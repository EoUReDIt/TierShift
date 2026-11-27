using System.IO;
using System.Text.RegularExpressions;

namespace TierShift.Core.Guardrails;

public sealed record PathGuardResult(bool Allowed, string Code, string Message, bool RouteViaMsix = false);

public static partial class PathGuard
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
        "easyanticheat_eos",
        "battleye",
        "faceit ac"
    ];

    [GeneratedRegex(@"^[a-z]:\\users\\[^\\]+$", RegexOptions.IgnoreCase)]
    private static partial Regex UserProfileRootRegex();

    [GeneratedRegex(@"^[a-z]:\\users\\[^\\]+\\appdata(\\(local|locallow|roaming))?$", RegexOptions.IgnoreCase)]
    private static partial Regex AppDataContainerRootRegex();

    public static PathGuardResult Validate(
        string sourcePath,
        string targetPath,
        long sourceSizeBytes,
        bool isMsixNativeMove = false,
        bool allowSameVolume = false)
    {
        if (string.IsNullOrWhiteSpace(sourcePath))
            return new(false, "BLOCKED_DRIVE_ROOT", "Source path cannot be empty.");

        if (string.IsNullOrWhiteSpace(targetPath))
            return new(false, "BLOCKED_DRIVE_ROOT", "Target path cannot be empty.");

        string fullSource;
        string fullTarget;
        try
        {
            fullSource = Path.GetFullPath(sourcePath).TrimEnd('\\');
            fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\');
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return new(false, "BLOCKED_INVALID_PATH", $"Invalid path syntax: {ex.Message}");
        }

        if (fullSource.Length <= 2 && fullSource.EndsWith(':'))
            return new(false, "BLOCKED_DRIVE_ROOT", "Drive roots cannot be relocated.");

        foreach (var prefix in BlockedPrefixes)
        {
            if (string.IsNullOrEmpty(prefix))
                continue;
            var normalizedPrefix = prefix.TrimEnd('\\');
            if (fullSource.Equals(normalizedPrefix, StringComparison.OrdinalIgnoreCase) ||
                fullSource.StartsWith(normalizedPrefix + "\\", StringComparison.OrdinalIgnoreCase))
                return new(false, "BLOCKED_SYSTEM_ROOT", $"Protected OS root blocked: {normalizedPrefix}");
        }

        if (fullSource.StartsWith(@"C:\Program Files\WindowsApps", StringComparison.OrdinalIgnoreCase) && !isMsixNativeMove)
            return new(false, "BLOCKED_WINDOWSAPPS_MSIX_ONLY", "Route WindowsApps through PackageManager.MovePackageToVolumeAsync.", RouteViaMsix: true);

        if (BlockedContainerRoots.Any(r => fullSource.Equals(r, StringComparison.OrdinalIgnoreCase)))
            return new(false, "BLOCKED_CONTAINER_ROOT", "Only child directories inside system container roots may be relocated.");

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile).TrimEnd('\\');
        if ((!string.IsNullOrEmpty(userProfile) && fullSource.Equals(userProfile, StringComparison.OrdinalIgnoreCase)) ||
            UserProfileRootRegex().IsMatch(fullSource))
            return new(false, "BLOCKED_PROFILE_ROOT", "User profile root cannot be relocated; target specific AppData child folders.");

        if (AppDataContainerRootRegex().IsMatch(fullSource))
            return new(false, "BLOCKED_CONTAINER_ROOT", "Cannot relocate AppData, Local, LocalLow, or Roaming container roots themselves. Select a specific child folder.");

        var lowerSource = fullSource.ToLowerInvariant();
        foreach (var token in KernelAntiCheatTokens)
        {
            if (lowerSource.Contains(token))
                return new(false, "BLOCKED_KERNEL_ANTICHEAT", $"Kernel anti-cheat/driver path blocked: {token}");
        }

        if (Directory.Exists(fullSource) && (File.GetAttributes(fullSource) & FileAttributes.ReparsePoint) != 0)
            return new(false, "BLOCKED_ALREADY_REPARSE_POINT", "Source path is already an NTFS Reparse Point.");

        var sourceRoot = Path.GetPathRoot(fullSource);
        var targetRoot = Path.GetPathRoot(fullTarget);
        if (string.IsNullOrEmpty(targetRoot))
            return new(false, "BLOCKED_DRIVE_ROOT", "Target path must include a valid drive root.");

        if (!allowSameVolume &&
            !string.IsNullOrEmpty(sourceRoot) &&
            sourceRoot.Equals(targetRoot, StringComparison.OrdinalIgnoreCase))
        {
            return new(false, "BLOCKED_SAME_VOLUME", $"Target volume ({targetRoot.TrimEnd('\\')}) cannot be the same as source volume ({sourceRoot.TrimEnd('\\')}).");
        }

        DriveInfo drive;
        try
        {
            drive = new DriveInfo(targetRoot);
            if (!drive.IsReady)
                return new(false, "BLOCKED_TARGET_DRIVE_NOT_READY", $"Target drive {drive.Name} is not mounted or ready.");
        }
        catch (Exception ex) when (ex is ArgumentException or DriveNotFoundException or IOException)
        {
            return new(false, "BLOCKED_TARGET_DRIVE_NOT_READY", $"Target drive '{targetRoot}' is unavailable: {ex.Message}");
        }

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
