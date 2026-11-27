using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using TierShift.Core.Data;
using TierShift.Core.FileSystem;

namespace TierShift.Core.Capsules;

public sealed record CapsuleManifest(
    string AppDisplayName,
    string CreatedAtUtc,
    bool CachesExcluded,
    string? OriginalProgramDataPath,
    string? OriginalRoamingPath,
    string? OriginalLocalPath,
    List<string> ExportedRegistryKeys);

public sealed record CapsuleInfo(
    string ArchivePath,
    string FileName,
    string AppDisplayName,
    long ArchiveBytes,
    string CreatedAtUtc,
    bool CachesExcluded);

public sealed class CapsuleService(SqliteLedger ledger)
{
    private static readonly string[] CacheFolderNames =
    [
        "Cache", "Code Cache", "GPUCache", "DawnCache", "GrShaderCache", "ShaderCache", "Temp", "Crashpad"
    ];

    public static string GetCapsuleDirectory(string targetDriveLetter) =>
        Path.Combine(targetDriveLetter.TrimEnd('\\') + "\\", "TierShift", "Capsules");

    public IReadOnlyList<CapsuleInfo> ListCapsules(string targetDriveLetter)
    {
        var dir = GetCapsuleDirectory(targetDriveLetter);
        if (!Directory.Exists(dir)) return [];

        var list = new List<CapsuleInfo>();
        foreach (var file in Directory.EnumerateFiles(dir, "*.tiercapsule"))
        {
            try
            {
                var fi = new FileInfo(file);
                string appName = Path.GetFileNameWithoutExtension(file);
                string created = fi.CreationTimeUtc.ToString("O");
                bool cachesExcluded = true;

                using var zip = ZipFile.OpenRead(file);
                var manifestEntry = zip.GetEntry("manifest.json");
                if (manifestEntry != null)
                {
                    using var sr = new StreamReader(manifestEntry.Open());
                    var manifest = JsonSerializer.Deserialize<CapsuleManifest>(sr.ReadToEnd());
                    if (manifest != null)
                    {
                        appName = manifest.AppDisplayName;
                        created = manifest.CreatedAtUtc;
                        cachesExcluded = manifest.CachesExcluded;
                    }
                }

                list.Add(new CapsuleInfo(file, fi.Name, appName, fi.Length, created, cachesExcluded));
            }
            catch { }
        }

        return list.OrderByDescending(c => c.CreatedAtUtc).ToList();
    }

    public async Task<CapsuleInfo> ExportCapsuleAsync(
        string appDisplayName,
        string targetDriveLetter,
        bool excludeCaches = true,
        CancellationToken ct = default)
    {
        return await Task.Run(() =>
        {
            var capsuleDir = GetCapsuleDirectory(targetDriveLetter);
            Directory.CreateDirectory(capsuleDir);

            var safeName = string.Concat(appDisplayName.Where(c => !Path.GetInvalidFileNameChars().Contains(c))).Replace(" ", "");
            var fileName = $"{safeName}_{DateTime.UtcNow:yyyy-MM-dd}.tiercapsule";
            var archivePath = Path.Combine(capsuleDir, fileName);

            var progData = FindMatchingSubdir(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), appDisplayName);
            var roaming = FindMatchingSubdir(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), appDisplayName);
            var local = FindMatchingSubdir(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), appDisplayName);

            var stagingDir = Path.Combine(Path.GetTempPath(), "tiershift-capsule-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stagingDir);

            try
            {
                if (progData != null) CopyFolderFiltered(progData, Path.Combine(stagingDir, "ProgramData"), excludeCaches, ct);
                if (roaming != null) CopyFolderFiltered(roaming, Path.Combine(stagingDir, "Roaming"), excludeCaches, ct);
                if (local != null) CopyFolderFiltered(local, Path.Combine(stagingDir, "Local"), excludeCaches, ct);

                var regDir = Path.Combine(stagingDir, "Registry");
                Directory.CreateDirectory(regDir);
                var exportedKeys = new List<string>();
                TryExportRegistryKey($@"HKCU\Software\{appDisplayName}", Path.Combine(regDir, "hkcu.reg"), exportedKeys);
                TryExportRegistryKey($@"HKLM\SOFTWARE\{appDisplayName}", Path.Combine(regDir, "hklm.reg"), exportedKeys);

                var manifest = new CapsuleManifest(
                    appDisplayName,
                    DateTime.UtcNow.ToString("O"),
                    excludeCaches,
                    progData,
                    roaming,
                    local,
                    exportedKeys);

                File.WriteAllText(
                    Path.Combine(stagingDir, "manifest.json"),
                    JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }));

                if (File.Exists(archivePath)) File.Delete(archivePath);
                ZipFile.CreateFromDirectory(stagingDir, archivePath, CompressionLevel.Optimal, includeBaseDirectory: false);

                var fi = new FileInfo(archivePath);
                return new CapsuleInfo(archivePath, fi.Name, appDisplayName, fi.Length, manifest.CreatedAtUtc, excludeCaches);
            }
            finally
            {
                try { Directory.Delete(stagingDir, recursive: true); } catch { }
            }
        }, ct);
    }

    public async Task<string> RestoreRedirectedAsync(string archivePath, string targetDriveLetter, CancellationToken ct = default)
    {
        if (!File.Exists(archivePath))
            throw new FileNotFoundException($"State Capsule not found: {archivePath}");

        var tempExtract = Path.Combine(Path.GetTempPath(), "tiershift-restore-" + Guid.NewGuid().ToString("N"));
        ZipFile.ExtractToDirectory(archivePath, tempExtract);

        try
        {
            var manifestPath = Path.Combine(tempExtract, "manifest.json");
            var manifest = JsonSerializer.Deserialize<CapsuleManifest>(await File.ReadAllTextAsync(manifestPath, ct))
                ?? throw new InvalidDataException("Capsule manifest.json is missing or invalid.");

            var safeApp = string.Concat(manifest.AppDisplayName.Where(c => !Path.GetInvalidFileNameChars().Contains(c)));
            var stateRoot = Path.Combine(targetDriveLetter.TrimEnd('\\') + "\\", "TierShift", "State", safeApp);
            Directory.CreateDirectory(stateRoot);

            await RedirectFolderIfPresentAsync(tempExtract, "ProgramData", manifest.OriginalProgramDataPath, Path.Combine(stateRoot, "ProgramData"), manifest.AppDisplayName, ct);
            await RedirectFolderIfPresentAsync(tempExtract, "Roaming", manifest.OriginalRoamingPath, Path.Combine(stateRoot, "Roaming"), manifest.AppDisplayName, ct);
            await RedirectFolderIfPresentAsync(tempExtract, "Local", manifest.OriginalLocalPath, Path.Combine(stateRoot, "Local"), manifest.AppDisplayName, ct);

            var regDir = Path.Combine(tempExtract, "Registry");
            if (Directory.Exists(regDir))
            {
                foreach (var regFile in Directory.EnumerateFiles(regDir, "*.reg"))
                {
                    RunRegTool($"import \"{regFile}\"");
                }
            }

            return stateRoot;
        }
        finally
        {
            try { Directory.Delete(tempExtract, recursive: true); } catch { }
        }
    }

    private async Task RedirectFolderIfPresentAsync(
        string extractRoot,
        string subName,
        string? originalCPath,
        string destStatePath,
        string appName,
        CancellationToken ct)
    {
        var extracted = Path.Combine(extractRoot, subName);
        if (!Directory.Exists(extracted) || string.IsNullOrWhiteSpace(originalCPath)) return;

        var stats = await VerifiedCopy.CopyDirectoryVerifiedAsync(extracted, destStatePath, null, ct);

        if (!Directory.Exists(originalCPath))
        {
            Directory.CreateDirectory(originalCPath);
            NtfsJunction.Create(originalCPath, destStatePath);
        }
        else if (!Directory.EnumerateFileSystemEntries(originalCPath).Any() && !NtfsJunction.IsJunction(originalCPath))
        {
            NtfsJunction.Create(originalCPath, destStatePath);
        }

        await ledger.InsertMoveAsync(new MoveLedgerRecord(
            Guid.NewGuid().ToString(),
            $"{appName} ({subName} Capsule)",
            "StateCapsule",
            originalCPath,
            destStatePath,
            stats.TotalBytes,
            "Active",
            DateTime.UtcNow.ToString("O")), ct);
    }

    private static string? FindMatchingSubdir(string root, string appDisplayName)
    {
        if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) return null;
        var direct = Path.Combine(root, appDisplayName);
        if (Directory.Exists(direct)) return direct;

        var firstWord = appDisplayName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (string.IsNullOrWhiteSpace(firstWord) || firstWord.Length < 3) return null;

        try
        {
            return Directory.EnumerateDirectories(root)
                .FirstOrDefault(d => Path.GetFileName(d).Equals(firstWord, StringComparison.OrdinalIgnoreCase));
        }
        catch { return null; }
    }

    private static void CopyFolderFiltered(string source, string dest, bool excludeCaches, CancellationToken ct)
    {
        Directory.CreateDirectory(dest);
        foreach (var file in Directory.EnumerateFiles(source))
        {
            ct.ThrowIfCancellationRequested();
            try { File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), overwrite: true); }
            catch { }
        }

        foreach (var dir in Directory.EnumerateDirectories(source))
        {
            ct.ThrowIfCancellationRequested();
            var name = Path.GetFileName(dir);
            if (excludeCaches && CacheFolderNames.Any(c => c.Equals(name, StringComparison.OrdinalIgnoreCase)))
                continue;
            if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) != 0)
                continue;
            CopyFolderFiltered(dir, Path.Combine(dest, name), excludeCaches, ct);
        }
    }

    private static void TryExportRegistryKey(string regKey, string outputPath, List<string> exported)
    {
        if (RunRegTool($"export \"{regKey}\" \"{outputPath}\" /y") == 0 && File.Exists(outputPath))
            exported.Add(regKey);
    }

    private static int RunRegTool(string args)
    {
        try
        {
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = "reg.exe",
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            });
            if (proc == null) return -1;
            proc.WaitForExit(10000);
            return proc.ExitCode;
        }
        catch { return -1; }
    }
}
