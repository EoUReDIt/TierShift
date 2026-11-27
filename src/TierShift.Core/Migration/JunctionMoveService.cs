using TierShift.Core.Data;
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

        var moveId = Guid.NewGuid().ToString();
        var backupPath = sourcePath.TrimEnd('\\') + ".tiershift_bak";

        // 1. Copy & verify file count + byte total
        await CopyDirectoryVerifiedAsync(sourcePath, targetPath, ct);

        // 2. Atomic swap: rename -> create NTFS junction -> verify -> delete backup
        var junctionCreated = false;
        try
        {
            Directory.Move(sourcePath, backupPath);
            Directory.CreateDirectory(sourcePath);
            NtfsJunction.Create(sourcePath, targetPath);
            junctionCreated = true;

            if (!NtfsJunction.VerifyResolvesTo(sourcePath, targetPath))
                throw new IOException("Junction verification failed via GetFinalPathNameByHandle.");

            Directory.Delete(backupPath, recursive: true);
            return moveId;
        }
        catch
        {
            if (junctionCreated && Directory.Exists(sourcePath))
                Directory.Delete(sourcePath, recursive: false);
            if (Directory.Exists(backupPath) && !Directory.Exists(sourcePath))
                Directory.Move(backupPath, sourcePath);
            if (Directory.Exists(targetPath))
                Directory.Delete(targetPath, recursive: true);
            throw;
        }
    }

    private static Task CopyDirectoryVerifiedAsync(string source, string target, CancellationToken ct)
    {
        // TODO: recursive copy preserving timestamps & basic ACLs, then assert file count + total bytes.
        // Throws until implemented: this runs before any source rename, so nothing is moved or deleted.
        throw new NotImplementedException("Verified directory copy is not implemented yet.");
    }
}

public static class NtfsJunction
{
    public const uint IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;

    // TODO: DeviceIoControl FSCTL_SET_REPARSE_POINT with a mount-point reparse buffer.
    public static void Create(string junctionPath, string targetPath) =>
        throw new NotImplementedException("NTFS junction creation is not implemented yet.");

    // TODO: open the junction and compare GetFinalPathNameByHandleW against expectedTarget.
    public static bool VerifyResolvesTo(string junctionPath, string expectedTarget) =>
        throw new NotImplementedException("NTFS junction verification is not implemented yet.");
}
