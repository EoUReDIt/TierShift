namespace TierShift.Core.Data;

public sealed record DriveVolumeInfo(
    string Letter,
    string RootPath,
    string Label,
    string FileSystem,
    string DriveTypeName,
    long TotalBytes,
    long FreeBytes,
    long UsedBytes,
    bool IsNtfsFixed)
{
    public double UsedPercent => TotalBytes > 0 ? Math.Min(100.0, (double)UsedBytes / TotalBytes * 100.0) : 0;
    public string UsageSummary => $"{ByteFormatter.Format(UsedBytes)} used of {ByteFormatter.Format(TotalBytes)} ({ByteFormatter.Format(FreeBytes)} free)";
    public string DisplayName => string.IsNullOrWhiteSpace(Label)
        ? $"{Letter} Local Disk ({FileSystem})"
        : $"{Letter} {Label} ({FileSystem})";
}

public sealed class InstalledAppInfo
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string Publisher { get; init; }
    public required string Version { get; init; }
    public required string PackageKind { get; init; } // "Win32" | "MSIX"
    public required string InstallPath { get; init; }
    public string? ProgramDataPath { get; init; }
    public string? AppDataPath { get; init; }
    public string? UninstallString { get; set; }
    public long InstallBytes { get; set; }
    public long ProgramDataBytes { get; set; }
    public long AppDataBytes { get; set; }
    public int FileCount { get; set; }
    public int LastUsedDaysAgo { get; set; }
    public bool IsOffloaded { get; set; }
    public string? OffloadedTargetPath { get; set; }
    public bool IsKernelProtected { get; set; }
    public List<string> RegistryKeys { get; init; } = [];

    public long TrueFootprintBytes => InstallBytes + ProgramDataBytes + AppDataBytes;
    public bool IsDormant => !IsOffloaded && !IsKernelProtected && LastUsedDaysAgo >= 90 && TrueFootprintBytes >= 500L * 1024 * 1024;

    public string StatusLabel => IsKernelProtected
        ? "Kernel Protected (PathGuard)"
        : IsOffloaded
            ? $"Offloaded -> {OffloadedTargetPath}"
            : IsDormant
                ? $"Dormant ({LastUsedDaysAgo}d)"
                : "On System Drive";

    public string FootprintText => ByteFormatter.Format(TrueFootprintBytes);
    public string SubtitleText => $"{Publisher} · {PackageKind} · v{Version}";
    public bool CanMove => !IsOffloaded && !IsKernelProtected && !string.IsNullOrWhiteSpace(InstallPath) && Directory.Exists(InstallPath);
    public bool CanUninstall => !IsKernelProtected && !string.IsNullOrWhiteSpace(UninstallString);
}

public sealed class AppDataFolderInfo
{
    public required string FolderPath { get; init; }
    public required string FolderName { get; init; }
    public required string RootScope { get; init; } // "Local" | "LocalLow" | "Roaming" | "ProgramData"
    public long SizeBytes { get; set; }
    public int FileCount { get; set; }
    public int LastModifiedDaysAgo { get; set; }
    public bool IsReparsePoint { get; set; }
    public string? OffloadedTargetPath { get; set; }
    public string? ResolvedAppName { get; set; }
    public string? Publisher { get; set; }
    public int ConfidenceScore { get; set; }
    public string EvidenceSummary { get; set; } = string.Empty;
    public string Classification { get; set; } = "Unknown"; // Active | Dormant | Orphaned | Protected | Unknown
    public List<StageEvidenceDetail> Stages { get; init; } = [];

    public string SizeText => ByteFormatter.Format(SizeBytes);
    public string AttributionHeadline => $"{ConfidenceScore}% · {ResolvedAppName ?? "Unattributed Folder"}";
    public string StatusText => IsReparsePoint
        ? $"Offloaded -> {OffloadedTargetPath}"
        : $"{Classification} · Untouched {LastModifiedDaysAgo}d";
    public bool CanOffload => !IsReparsePoint && !string.Equals(Classification, "Protected", StringComparison.OrdinalIgnoreCase);
    public bool CanDeleteOrphan => !IsReparsePoint && string.Equals(Classification, "Orphaned", StringComparison.OrdinalIgnoreCase);
}

public sealed record StageEvidenceDetail(
    int Stage,
    string StageTitle,
    string Source,
    string Detail,
    int Points,
    bool Matched);

public sealed record MoveLedgerEntry(
    string Id,
    string AppDisplayName,
    string MoveType,
    string SourcePath,
    string TargetPath,
    long BytesMoved,
    string Status,
    string CreatedAtUtc)
{
    public string BytesText => ByteFormatter.Format(BytesMoved);
    public string RouteText => $"{SourcePath} -> {TargetPath}";
    public bool CanRollback => string.Equals(Status, "Active", StringComparison.OrdinalIgnoreCase);
}

public sealed record TransactionJournalEntry(
    long Id,
    string MoveId,
    int StepOrder,
    string ActionType,
    string PayloadJson,
    bool Completed);

public sealed record StateCapsuleInfo(
    string FileName,
    string ArchivePath,
    string AppDisplayName,
    long ArchiveBytes,
    string CreatedAtUtc,
    bool CachesExcluded,
    List<string> IncludedRoots,
    List<string> RegistryFiles)
{
    public string SizeText => ByteFormatter.Format(ArchiveBytes);
    public string DetailText => $"{SizeText} · {IncludedRoots.Count} folder(s) · {RegistryFiles.Count} .reg export(s)";
}

public sealed record LockingProcessInfo(
    int ProcessId,
    string AppName,
    string ServiceShortName,
    bool IsRestartable);

public static class ByteFormatter
{
    private static readonly string[] Units = ["B", "KB", "MB", "GB", "TB"];

    public static string Format(long bytes)
    {
        if (bytes <= 0) return "0 B";
        double value = bytes;
        var unitIndex = 0;
        while (value >= 1024.0 && unitIndex < Units.Length - 1)
        {
            value /= 1024.0;
            unitIndex++;
        }
        return unitIndex >= 3 ? $"{value:0.0} {Units[unitIndex]}" : $"{value:0.#} {Units[unitIndex]}";
    }
}
