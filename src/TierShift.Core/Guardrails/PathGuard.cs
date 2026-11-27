using System.IO;

namespace TierShift.Core.Guardrails;

public sealed record PathGuardResult(bool Allowed, string Code, string Message, bool RouteViaMsix = false);

public static class PathGuard
{
    private static readonly string[] BlockedPrefixes =
    [
        Environment.GetFolderPath(Environment.SpecialFolder.Windows),
        @"C:\$Recycle.Bin",
        @"C:\System Volume Information",
        @"C:\Boot",
        @"C:\EFI",
        @"C:\Recovery"
    ];

    private static readonly string[] BlockedContainerRoots =
    [
        @"C:\Program Files",
        @"C:\Program Files (x86)",
        @"C:\ProgramData",
        @"C:\Users"
    ];

    private static readonly string[] KernelAntiCheatTokens =
    [
        "riot vanguard",
        "easyanticheat",
        "battleye",
        "faceit ac"
    ];

    public static PathGuardResult Validate(string sourcePath, string targetPath, long sourceSizeBytes, bool isMsixNativeMove = false)
    {
        var fullSource = Path.GetFullPath(sourcePath).TrimEnd('\\');
        var fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\');

        if (fullSource.Length <= 2 && fullSource.EndsWith(':'))
            return new(false, "BLOCKED_DRIVE_ROOT", "Drive roots cannot be relocated.");

        foreach (var prefix in BlockedPrefixes)
        {
            if (fullSource.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
                fullSource.StartsWith(prefix + "\\", StringComparison.OrdinalIgnoreCase))
                return new(false, "BLOCKED_SYSTEM_ROOT", $"Protected OS root blocked: {prefix}");
        }

        if (fullSource.StartsWith(@"C:\Program Files\WindowsApps", StringComparison.OrdinalIgnoreCase) && !isMsixNativeMove)
            return new(false, "BLOCKED_WINDOWSAPPS_MSIX_ONLY", "Route WindowsApps through PackageManager.MovePackageToVolumeAsync.", RouteViaMsix: true);

        if (BlockedContainerRoots.Any(r => fullSource.Equals(r, StringComparison.OrdinalIgnoreCase)))
            return new(false, "BLOCKED_CONTAINER_ROOT", "Only child directories inside system container roots may be relocated.");

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile).TrimEnd('\\');
        if (fullSource.Equals(userProfile, StringComparison.OrdinalIgnoreCase))
            return new(false, "BLOCKED_PROFILE_ROOT", "User profile root cannot be relocated; target specific AppData child folders.");

        var lowerSource = fullSource.ToLowerInvariant();
        foreach (var token in KernelAntiCheatTokens)
        {
            if (lowerSource.Contains(token))
                return new(false, "BLOCKED_KERNEL_ANTICHEAT", $"Kernel anti-cheat/driver path blocked: {token}");
        }

        if (Directory.Exists(fullSource) && (File.GetAttributes(fullSource) & FileAttributes.ReparsePoint) != 0)
            return new(false, "BLOCKED_ALREADY_REPARSE_POINT", "Source path is already an NTFS Reparse Point.");

        var targetRoot = Path.GetPathRoot(fullTarget) ?? throw new ArgumentException("Invalid target path.");
        var drive = new DriveInfo(targetRoot);
        if (drive.DriveType != DriveType.Fixed)
            return new(false, "BLOCKED_TARGET_DRIVE_TYPE", $"Target drive {drive.Name} must be a local Fixed disk.");

        if (!drive.DriveFormat.Equals("NTFS", StringComparison.OrdinalIgnoreCase))
            return new(false, "BLOCKED_TARGET_FILESYSTEM", $"Target drive {drive.Name} must be NTFS (found {drive.DriveFormat}).");

        var requiredBytes = (long)Math.Ceiling(sourceSizeBytes * 1.10);
        if (drive.AvailableFreeSpace < requiredBytes)
            return new(false, "BLOCKED_INSUFFICIENT_SPACE", $"Target requires {requiredBytes:N0} bytes (110% safety headroom).");

        return new(true, "OK", "Pre-flight safety checks passed.");
    }
}
