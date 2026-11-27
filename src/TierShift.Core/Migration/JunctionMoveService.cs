using System.Text.Json;
using TierShift.Core.Data;
using TierShift.Core.FileSystem;
using TierShift.Core.Guardrails;

namespace TierShift.Core.Migration;

public sealed class JunctionMoveService(SqliteLedger ledger)
{
    public async Task<string> ExecuteAsync(
        string appDisplayName,
        string moveType,
        string sourcePath,
        string targetPath,
        long sourceSizeBytes,
        IProgress<CopyProgress>? progress = null,
        bool closeLockingApps = false,
        CancellationToken ct = default,
        bool allowSameVolumeForTesting = false)
    {
        var guard = PathGuard.Validate(
            sourcePath,
            targetPath,
            sourceSizeBytes,
            allowSameVolume: allowSameVolumeForTesting);

        if (!guard.Allowed)
            throw new InvalidOperationException($"PathGuard blocked relocation ({guard.Code}): {guard.Message}");

        if (!Directory.Exists(sourcePath))
            throw new DirectoryNotFoundException($"Source directory not found: {sourcePath}");

        var fullSource = Path.GetFullPath(sourcePath).TrimEnd('\\');
        var fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\');

        // 1. Lock Detection via Restart Manager
        var locks = RestartManagerService.FindLockingProcesses(fullSource);
        if (locks.Count > 0)
        {
            if (!closeLockingApps || locks.Any(l => !l.IsClosable))
            {
                var names = string.Join(", ", locks.Select(l => $"{l.AppName} (PID {l.Pid})"));
                throw new IOException($"Directory is locked by running processes: {names}");
            }

            if (!RestartManagerService.TryShutdownClosableProcesses(fullSource))
                throw new IOException("Unable to release all process locks on the source directory.");
        }

        var moveId = Guid.NewGuid().ToString();
        var backupPath = fullSource + ".tiershift_bak";

        // 2. Verified Copy
        var stats = await VerifiedCopy.CopyDirectoryVerifiedAsync(fullSource, fullTarget, progress, ct);
        await ledger.AddJournalStepAsync(
            moveId,
            1,
            "CopyDir",
            JsonSerializer.Serialize(new { source = fullSource, target = fullTarget, files = stats.FileCount, bytes = stats.TotalBytes }),
            completed: true,
            ct);

        // 3. Atomic Swap: rename -> create NTFS junction -> verify -> delete backup
        var junctionCreated = false;
        try
        {
            Directory.Move(fullSource, backupPath);
            Directory.CreateDirectory(fullSource);
            NtfsJunction.Create(fullSource, fullTarget);
            junctionCreated = true;

            if (!NtfsJunction.VerifyResolvesTo(fullSource, fullTarget))
                throw new IOException("Junction verification failed via GetFinalPathNameByHandleW.");

            await ledger.AddJournalStepAsync(
                moveId,
                2,
                "CreateJunction",
                JsonSerializer.Serialize(new { junction = fullSource, target = fullTarget, reparseTag = "IO_REPARSE_TAG_MOUNT_POINT" }),
                completed: true,
                ct);

            Directory.Delete(backupPath, recursive: true);

            await ledger.AddJournalStepAsync(
                moveId,
                3,
                "DeleteSource",
                JsonSerializer.Serialize(new { backupDeleted = backupPath }),
                completed: true,
                ct);

            await ledger.InsertMoveAsync(
                new MoveLedgerRecord(
                    moveId,
                    appDisplayName,
                    moveType,
                    fullSource,
                    fullTarget,
                    stats.TotalBytes,
                    "Active",
                    DateTime.UtcNow.ToString("O")),
                ct);

            return moveId;
        }
        catch
        {
            if (junctionCreated && Directory.Exists(fullSource))
            {
                try { NtfsJunction.Delete(fullSource); } catch { }
            }
            if (Directory.Exists(backupPath) && !Directory.Exists(fullSource))
            {
                try { Directory.Move(backupPath, fullSource); } catch { }
            }
            if (Directory.Exists(fullTarget))
            {
                try { Directory.Delete(fullTarget, recursive: true); } catch { }
            }
            throw;
        }
    }

    /// <summary>
    /// 1-Click Rollback: copies target files back to the original NVMe source path,
    /// replaces the NTFS junction atomically, deletes the cold-tier copy, and marks RolledBack.
    /// </summary>
    public async Task RollbackAsync(
        string moveId,
        IProgress<CopyProgress>? progress = null,
        CancellationToken ct = default)
    {
        var record = await ledger.GetMoveByIdAsync(moveId, ct)
            ?? throw new InvalidOperationException($"MoveLedger record not found: {moveId}");

        if (!record.Status.Equals("Active", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Move {moveId} cannot be rolled back from status '{record.Status}'.");

        if (!Directory.Exists(record.TargetPath))
            throw new DirectoryNotFoundException($"Cold-storage target no longer exists: {record.TargetPath}");

        var fullSource = Path.GetFullPath(record.SourcePath).TrimEnd('\\');
        var fullTarget = Path.GetFullPath(record.TargetPath).TrimEnd('\\');
        var stagingPath = fullSource + ".tiershift_restore";

        try
        {
            await VerifiedCopy.CopyDirectoryVerifiedAsync(fullTarget, stagingPath, progress, ct);

            if (NtfsJunction.IsJunction(fullSource))
                NtfsJunction.Delete(fullSource);
            else if (Directory.Exists(fullSource))
                Directory.Delete(fullSource, recursive: false);

            Directory.Move(stagingPath, fullSource);

            try { Directory.Delete(fullTarget, recursive: true); } catch { }

            await ledger.UpdateMoveStatusAsync(moveId, "RolledBack", ct);
        }
        catch
        {
            if (Directory.Exists(stagingPath))
            {
                try { Directory.Delete(stagingPath, recursive: true); } catch { }
            }
            if (!Directory.Exists(fullSource) && Directory.Exists(fullTarget))
            {
                try
                {
                    Directory.CreateDirectory(fullSource);
                    NtfsJunction.Create(fullSource, fullTarget);
                }
                catch { }
            }
            throw;
        }
    }
}
