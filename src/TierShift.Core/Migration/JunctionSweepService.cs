using TierShift.Core.Data;

namespace TierShift.Core.Migration;

public sealed record SweepReport(int CheckedActiveMoves, int CleanedTargets, IReadOnlyList<string> CleanedPaths);

/// <summary>
/// Detects when a Windows Uninstaller removed the C: NTFS junction leaving an empty shell folder
/// on cold storage (D:+), deletes the empty target, and updates MoveLedger status.
/// </summary>
public sealed class JunctionSweepService(SqliteLedger ledger)
{
    public async Task<SweepReport> RunSweepAsync(CancellationToken ct = default)
    {
        var allMoves = await ledger.GetAllMovesAsync(ct);
        var activeMoves = allMoves
            .Where(m => m.Status.Equals("Active", StringComparison.OrdinalIgnoreCase) &&
                        !m.MoveType.Equals("MsixNative", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var cleanedPaths = new List<string>();

        foreach (var move in activeMoves)
        {
            ct.ThrowIfCancellationRequested();

            if (!Directory.Exists(move.SourcePath) && Directory.Exists(move.TargetPath))
            {
                if (IsDirectoryEmptyOfFiles(move.TargetPath))
                {
                    try
                    {
                        Directory.Delete(move.TargetPath, recursive: true);
                        await ledger.UpdateMoveStatusAsync(move.Id, "OrphanedTargetCleaned", ct);
                        cleanedPaths.Add(move.TargetPath);
                    }
                    catch
                    {
                        // Leave untouched if currently held open
                    }
                }
            }
        }

        return new SweepReport(activeMoves.Count, cleanedPaths.Count, cleanedPaths);
    }

    private static bool IsDirectoryEmptyOfFiles(string path)
    {
        try
        {
            return !Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories).Any();
        }
        catch
        {
            return false;
        }
    }
}
