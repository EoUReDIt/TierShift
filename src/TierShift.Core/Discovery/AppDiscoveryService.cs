using System.Diagnostics;
using Microsoft.Win32;
using TierShift.Core.FileSystem;
using Windows.Management.Deployment;

namespace TierShift.Core.Discovery;

public sealed record VolumeInfo(
    string RootPath,
    string DriveLetter,
    string VolumeLabel,
    string FileSystem,
    DriveType DriveType,
    long TotalBytes,
    long FreeBytes)
{
    public long UsedBytes => Math.Max(0, TotalBytes - FreeBytes);
    public double UsedPercent => TotalBytes > 0 ? (double)UsedBytes / TotalBytes * 100.0 : 0.0;
    public bool IsNtfsFixed => DriveType == DriveType.Fixed && FileSystem.Equals("NTFS", StringComparison.OrdinalIgnoreCase);
}

public sealed record InstalledAppInfo(
    string Id,
    string DisplayName,
    string Publisher,
    string DisplayVersion,
    string PackageKind,
    string InstallPath,
    string? UninstallString,
    string? PackageFullName,
    long InstallBytes,
    long FileCount,
    int LastUsedDaysAgo,
    bool IsOffloaded,
    string? OffloadedTargetPath)
{
    public bool IsDormant => !IsOffloaded && LastUsedDaysAgo >= 90 && InstallBytes >= 500L * 1024 * 1024;
}

public static class AppDiscoveryService
{
    public static IReadOnlyList<VolumeInfo> GetLocalVolumes()
    {
        var list = new List<VolumeInfo>();
        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady) continue;
                var letter = drive.Name.TrimEnd('\\');
                list.Add(new VolumeInfo(
                    drive.Name,
                    letter,
                    string.IsNullOrWhiteSpace(drive.VolumeLabel) ? "Local Disk" : drive.VolumeLabel,
                    drive.DriveFormat,
                    drive.DriveType,
                    drive.TotalSize,
                    drive.AvailableFreeSpace));
            }
            catch
            {
                // Skip unreadable/unmounted volumes
            }
        }
        return list;
    }

    public static async Task<IReadOnlyList<InstalledAppInfo>> DiscoverInstalledAppsAsync(CancellationToken ct = default)
    {
        return await Task.Run(() =>
        {
            var results = new List<InstalledAppInfo>();
            var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Win32 Apps from ARP Uninstall Registry Keys
            ReadUninstallHive(Registry.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", results, seenPaths, ct);
            ReadUninstallHive(Registry.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", results, seenPaths, ct);
            ReadUninstallHive(Registry.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", results, seenPaths, ct);

            // 2. MSIX / Store Apps via Windows.Management.Deployment.PackageManager
            try
            {
                var pm = new PackageManager();
                foreach (var pkg in pm.FindPackagesForUser(string.Empty))
                {
                    ct.ThrowIfCancellationRequested();
                    if (pkg.IsFramework || pkg.IsResourcePackage || pkg.IsBundle || pkg.SignatureKind == Windows.ApplicationModel.PackageSignatureKind.System)
                        continue;

                    string? loc = null;
                    try { loc = pkg.InstalledPath; } catch { continue; }
                    if (string.IsNullOrWhiteSpace(loc) || !Directory.Exists(loc)) continue;

                    var normLoc = Path.GetFullPath(loc).TrimEnd('\\');
                    if (!seenPaths.Add(normLoc)) continue;

                    var displayName = string.IsNullOrWhiteSpace(pkg.DisplayName) ? pkg.Id.Name : pkg.DisplayName;
                    var publisher = string.IsNullOrWhiteSpace(pkg.PublisherDisplayName) ? pkg.Id.Publisher : pkg.PublisherDisplayName;
                    var version = $"{pkg.Id.Version.Major}.{pkg.Id.Version.Minor}.{pkg.Id.Version.Build}";
                    var stats = VerifiedCopy.MeasureDirectory(normLoc, ct);
                    var daysAgo = Math.Max(0, (int)(DateTime.UtcNow - stats.LatestWriteUtc).TotalDays);
                    bool isOffloaded = !normLoc.StartsWith("C:", StringComparison.OrdinalIgnoreCase);

                    results.Add(new InstalledAppInfo(
                        pkg.Id.FullName,
                        displayName,
                        publisher,
                        version,
                        "MSIX",
                        normLoc,
                        null,
                        pkg.Id.FullName,
                        stats.TotalBytes,
                        stats.FileCount,
                        daysAgo,
                        isOffloaded,
                        isOffloaded ? normLoc : null));
                }
            }
            catch
            {
                // PackageManager enumeration may be restricted in non-interactive test environments
            }

            return (IReadOnlyList<InstalledAppInfo>)results
                .OrderByDescending(a => a.InstallBytes)
                .ToList();
        }, ct);
    }

    public static async Task MoveMsixPackageToVolumeAsync(string packageFullName, string targetDriveLetter, CancellationToken ct = default)
    {
        var pm = new PackageManager();
        var normalizedLetter = targetDriveLetter.TrimEnd('\\');
        var volume = pm.GetPackageVolumes().FirstOrDefault(v =>
                v.MountPoint.TrimEnd('\\').Equals(normalizedLetter, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"No MSIX PackageVolume found for {targetDriveLetter}.");

        var op = pm.MovePackageToVolumeAsync(packageFullName, DeploymentOptions.None, volume);
        var result = await op.AsTask(ct);
        if (result.ExtendedErrorCode != null)
            throw new InvalidOperationException($"MSIX move failed: {result.ErrorText}", result.ExtendedErrorCode);
    }

    public static void LaunchNativeUninstaller(string uninstallString)
    {
        if (string.IsNullOrWhiteSpace(uninstallString))
            throw new InvalidOperationException("No native uninstall command registered for this application.");

        var trimmed = uninstallString.Trim();
        string fileName;
        string arguments;

        if (trimmed.StartsWith('"'))
        {
            int endQuote = trimmed.IndexOf('"', 1);
            if (endQuote > 1)
            {
                fileName = trimmed[1..endQuote];
                arguments = trimmed[(endQuote + 1)..].Trim();
            }
            else
            {
                fileName = trimmed.Trim('"');
                arguments = string.Empty;
            }
        }
        else
        {
            int firstSpace = trimmed.IndexOf(' ');
            if (firstSpace > 0)
            {
                fileName = trimmed[..firstSpace];
                arguments = trimmed[(firstSpace + 1)..].Trim();
            }
            else
            {
                fileName = trimmed;
                arguments = string.Empty;
            }
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = true
        });
    }

    private static void ReadUninstallHive(
        RegistryKey root,
        string subKeyPath,
        List<InstalledAppInfo> results,
        HashSet<string> seenPaths,
        CancellationToken ct)
    {
        using var uninstallKey = root.OpenSubKey(subKeyPath);
        if (uninstallKey == null) return;

        foreach (var name in uninstallKey.GetSubKeyNames())
        {
            ct.ThrowIfCancellationRequested();
            using var appKey = uninstallKey.OpenSubKey(name);
            if (appKey == null) continue;

            var systemComponent = appKey.GetValue("SystemComponent");
            if (systemComponent is int sc && sc == 1) continue;

            var displayName = appKey.GetValue("DisplayName") as string;
            var installLocation = (appKey.GetValue("InstallLocation") as string)?.Trim().Trim('"');
            if (string.IsNullOrWhiteSpace(displayName) || string.IsNullOrWhiteSpace(installLocation))
                continue;

            if (!Directory.Exists(installLocation))
                continue;

            string normPath;
            try { normPath = Path.GetFullPath(installLocation).TrimEnd('\\'); }
            catch { continue; }

            // Skip container roots (e.g. broken installers setting InstallLocation = C:\Program Files)
            if (normPath.Equals(@"C:\Program Files", StringComparison.OrdinalIgnoreCase) ||
                normPath.Equals(@"C:\Program Files (x86)", StringComparison.OrdinalIgnoreCase) ||
                normPath.Length <= 3)
                continue;

            if (!seenPaths.Add(normPath)) continue;

            var publisher = appKey.GetValue("Publisher") as string ?? "Unknown Publisher";
            var version = appKey.GetValue("DisplayVersion") as string ?? "";
            var uninstallStr = appKey.GetValue("UninstallString") as string;

            bool isJunction = NtfsJunction.IsJunction(normPath);
            string? target = isJunction ? NtfsJunction.ResolveFinalPath(normPath) : null;
            bool isOffloaded = isJunction || !normPath.StartsWith("C:", StringComparison.OrdinalIgnoreCase);

            var measureTarget = target ?? normPath;
            var stats = VerifiedCopy.MeasureDirectory(measureTarget, ct);
            if (stats.TotalBytes < 1024 * 1024) continue; // Skip trivial <1 MB entries

            var daysAgo = Math.Max(0, (int)(DateTime.UtcNow - stats.LatestWriteUtc).TotalDays);

            results.Add(new InstalledAppInfo(
                name,
                displayName,
                publisher,
                version,
                "Win32",
                normPath,
                uninstallStr,
                null,
                stats.TotalBytes,
                stats.FileCount,
                daysAgo,
                isOffloaded,
                target ?? (isOffloaded ? normPath : null)));
        }
    }
}
