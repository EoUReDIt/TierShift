using System.Diagnostics;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using TierShift.Core.Data;
using TierShift.Core.Discovery;
using TierShift.Core.FileSystem;

namespace TierShift.Core.Attribution;

public interface ITelemetrySignalProvider
{
    int GetScore(string folderPath);
}

public sealed class Phase1TelemetryStub : ITelemetrySignalProvider
{
    public int GetScore(string folderPath) => 0;
}

public sealed record FolderAttributionInfo(
    string FolderPath,
    string FolderName,
    string RootScope,
    string? ResolvedAppName,
    string? Publisher,
    int ConfidenceScore,
    string EvidenceSummary,
    string Classification,
    long SizeBytes,
    long FileCount,
    int UntouchedDays,
    bool IsOffloaded,
    string? OffloadedTargetPath,
    IReadOnlyList<string> StageTrace);

public sealed class AttributionEngine
{
    private sealed record KbFile(string SchemaVersion, List<string> ProtectedWhitelist, List<KbRule> Rules);
    private sealed record KbRule(string Pattern, string MatchType, string AppName, string Publisher, string Category, string Notes);

    private readonly List<string> _protectedWhitelist = [];
    private readonly List<KbRule> _kbRules = [];
    private readonly ITelemetrySignalProvider _telemetry;
    private readonly SqliteLedger? _ledger;

    public AttributionEngine(SqliteLedger? ledger = null, ITelemetrySignalProvider? telemetry = null)
    {
        _ledger = ledger;
        _telemetry = telemetry ?? new Phase1TelemetryStub();
        LoadKnowledgeBase();
    }

    private void LoadKnowledgeBase()
    {
        var kbPath = Path.Combine(AppContext.BaseDirectory, "Rules", "ecosystem_kb.json");
        if (!File.Exists(kbPath))
        {
            _protectedWhitelist.AddRange(["EBWebView", @"NVIDIA\DXCache", @"AMD\DxCache", "D3DSCache", @"Microsoft\Windows", "Temp"]);
            return;
        }

        try
        {
            var json = File.ReadAllText(kbPath);
            var parsed = JsonSerializer.Deserialize<KbFile>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (parsed != null)
            {
                _protectedWhitelist.AddRange(parsed.ProtectedWhitelist);
                _kbRules.AddRange(parsed.Rules);
            }
        }
        catch
        {
            _protectedWhitelist.AddRange(["EBWebView", @"NVIDIA\DXCache", @"AMD\DxCache", "D3DSCache", "Temp"]);
        }
    }

    public async Task<IReadOnlyList<FolderAttributionInfo>> ScanAppDataAndProgramDataAsync(
        IReadOnlyList<InstalledAppInfo> installedApps,
        CancellationToken ct = default)
    {
        return await Task.Run(async () =>
        {
            var msiFolders = LoadMsiInstallerFolders();
            var roots = new (string Scope, string Path)[]
            {
                ("Local", Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)),
                ("LocalLow", Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow")),
                ("Roaming", Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)),
                ("ProgramData", Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData))
            };

            var results = new List<FolderAttributionInfo>();

            foreach (var (scope, rootPath) in roots)
            {
                if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
                    continue;

                IEnumerable<string> children;
                try { children = Directory.EnumerateDirectories(rootPath); }
                catch { continue; }

                foreach (var dir in children)
                {
                    ct.ThrowIfCancellationRequested();
                    var folderName = Path.GetFileName(dir);
                    if (string.IsNullOrWhiteSpace(folderName)) continue;

                    var info = AnalyzeFolder(dir, folderName, scope, installedApps, msiFolders, ct);
                    if (info.SizeBytes < 5L * 1024 * 1024 && !info.IsOffloaded) continue; // Focus on >= 5 MB folders

                    results.Add(info);

                    if (_ledger != null)
                    {
                        await _ledger.UpsertAttributionAsync(new AttributionCacheRecord(
                            info.FolderPath,
                            info.ResolvedAppName,
                            info.Publisher,
                            info.ConfidenceScore,
                            info.EvidenceSummary,
                            info.Classification,
                            info.SizeBytes,
                            DateTime.UtcNow.ToString("O")), ct);
                    }
                }
            }

            return (IReadOnlyList<FolderAttributionInfo>)results
                .OrderByDescending(r => r.SizeBytes)
                .ToList();
        }, ct);
    }

    public FolderAttributionInfo AnalyzeFolder(
        string folderPath,
        string folderName,
        string rootScope,
        IReadOnlyList<InstalledAppInfo> installedApps,
        HashSet<string>? msiFolders = null,
        CancellationToken ct = default)
    {
        bool isJunction = NtfsJunction.IsJunction(folderPath);
        string? offloadedTarget = isJunction ? NtfsJunction.ResolveFinalPath(folderPath) : null;
        var stats = VerifiedCopy.MeasureDirectory(offloadedTarget ?? folderPath, ct);
        int untouchedDays = Math.Max(0, (int)(DateTime.UtcNow - stats.LatestWriteUtc).TotalDays);

        var trace = new List<string>();
        var summaryParts = new List<string>();
        int score = 0;
        string? resolvedApp = null;
        string? publisher = null;
        bool hasMatchingArp = false;

        // STAGE 1: OS & Installer Forensics (+90)
        var exactArp = installedApps.FirstOrDefault(a =>
            a.InstallPath.Equals(folderPath, StringComparison.OrdinalIgnoreCase) ||
            a.DisplayName.Equals(folderName, StringComparison.OrdinalIgnoreCase) ||
            a.Publisher.Equals(folderName, StringComparison.OrdinalIgnoreCase));

        bool msiMatch = msiFolders != null && msiFolders.Any(f =>
            f.StartsWith(folderPath, StringComparison.OrdinalIgnoreCase));

        if (exactArp != null || msiMatch)
        {
            score += 90;
            hasMatchingArp = exactArp != null;
            resolvedApp = exactArp?.DisplayName ?? folderName;
            publisher = exactArp?.Publisher;
            var label = exactArp != null ? "ARP Uninstall (+90)" : "MSI Folders (+90)";
            summaryParts.Add(label);
            trace.Add($"Stage 1 [OS Forensics]: {label} -> {resolvedApp}");
        }
        else
        {
            trace.Add("Stage 1 [OS Forensics]: No exact ARP or MSI Installer\\Folders match (+0)");
        }

        // STAGE 2: Shallow Binary Inspection (Max depth 3, header-only) (+75 or +15 boost)
        var (binApp, binPub, binSource) = InspectShallowMetadata(offloadedTarget ?? folderPath, ct);
        if (!string.IsNullOrWhiteSpace(binApp) || !string.IsNullOrWhiteSpace(binPub))
        {
            int pts = score > 0 ? 15 : 75;
            score += pts;
            resolvedApp ??= binApp ?? binPub;
            publisher ??= binPub;
            summaryParts.Add($"{binSource} (+{pts})");
            trace.Add($"Stage 2 [Shallow Binary]: {binSource} -> {binApp ?? binPub} (+{pts})");
        }
        else
        {
            trace.Add("Stage 2 [Shallow Binary]: No signed PE binaries or package.json within depth 3 (+0)");
        }

        // STAGE 3: Telemetry (Phase 2 Stub)
        int telemetryPts = _telemetry.GetScore(folderPath);
        trace.Add($"Stage 3 [Telemetry]: ITelemetrySignalProvider Phase 2 stub (+{telemetryPts})");

        // STAGE 4: Knowledge Graph (ecosystem_kb.json +70) & Jaro-Winkler Fuzzy (+50)
        var kbRule = _kbRules.FirstOrDefault(r => r.MatchType.ToLowerInvariant() switch
        {
            "exact" => folderName.Equals(r.Pattern, StringComparison.OrdinalIgnoreCase),
            "prefix" => folderName.StartsWith(r.Pattern, StringComparison.OrdinalIgnoreCase),
            _ => folderName.Contains(r.Pattern, StringComparison.OrdinalIgnoreCase) ||
                 folderPath.Contains(r.Pattern, StringComparison.OrdinalIgnoreCase)
        });

        if (kbRule != null)
        {
            int pts = score == 0 ? 70 : Math.Min(20, 100 - score);
            score += pts;
            resolvedApp ??= kbRule.AppName;
            publisher ??= kbRule.Publisher;
            summaryParts.Add($"ecosystem_kb.json (+{pts})");
            trace.Add($"Stage 4 [Knowledge Graph]: Matched KB rule '{kbRule.Pattern}' -> {kbRule.AppName} (+{pts})");
        }
        else
        {
            var token = NormalizeToken(folderName);
            double bestSim = 0;
            InstalledAppInfo? bestApp = null;
            if (token.Length >= 3)
            {
                foreach (var app in installedApps)
                {
                    var s1 = JaroWinkler(token, NormalizeToken(app.DisplayName));
                    var s2 = JaroWinkler(token, NormalizeToken(app.Publisher));
                    var sim = Math.Max(s1, s2);
                    if (sim > bestSim)
                    {
                        bestSim = sim;
                        bestApp = app;
                    }
                }
            }

            if (bestSim >= 0.85 && bestApp != null)
            {
                int pts = score == 0 ? 50 : Math.Min(15, 100 - score);
                score += pts;
                hasMatchingArp = true;
                resolvedApp ??= bestApp.DisplayName;
                publisher ??= bestApp.Publisher;
                summaryParts.Add($"Jaro-Winkler {bestSim:0.00} (+{pts})");
                trace.Add($"Stage 4 [Fuzzy Match]: '{token}' matched '{bestApp.DisplayName}' ({bestSim:0.000} >= 0.85) (+{pts})");
            }
            else
            {
                trace.Add($"Stage 4 [KB & Fuzzy]: No KB match; closest Jaro-Winkler score {bestSim:0.00} (< 0.85) (+0)");
            }
        }

        score = Math.Min(100, score);

        // STAGE 5: Classification & Protection
        var protectedMatch = _protectedWhitelist.FirstOrDefault(w =>
            folderName.Equals(w, StringComparison.OrdinalIgnoreCase) ||
            folderPath.EndsWith("\\" + w, StringComparison.OrdinalIgnoreCase) ||
            folderPath.Contains("\\" + w + "\\", StringComparison.OrdinalIgnoreCase));

        string classification;
        if (protectedMatch != null)
        {
            classification = "Protected";
            score = Math.Max(score, 95);
            resolvedApp ??= $"Protected Windows/GPU Cache ({protectedMatch})";
            trace.Add($"Stage 5 [Classification]: Protected Whitelist match '{protectedMatch}' -> Protected");
        }
        else if (score >= 60 && !hasMatchingArp && untouchedDays >= 60)
        {
            classification = "Orphaned";
            trace.Add($"Stage 5 [Classification]: Confidence {score}% >= 60%, no matching ARP install, untouched {untouchedDays}d -> Orphaned");
        }
        else if (hasMatchingArp && untouchedDays >= 90 && stats.TotalBytes >= 500L * 1024 * 1024)
        {
            classification = "Dormant";
            trace.Add($"Stage 5 [Classification]: Installed parent, untouched {untouchedDays}d, >= 500 MB -> Dormant");
        }
        else if (score >= 50)
        {
            classification = "Active";
            trace.Add($"Stage 5 [Classification]: Attributed active folder (touched {untouchedDays}d ago) -> Active");
        }
        else
        {
            classification = "Unknown";
            trace.Add($"Stage 5 [Classification]: Confidence {score}% below threshold -> Unknown");
        }

        var evidenceSummary = summaryParts.Count > 0
            ? string.Join(", ", summaryParts)
            : protectedMatch != null
                ? $"Protected Whitelist ({protectedMatch})"
                : "No high-confidence signals";

        return new FolderAttributionInfo(
            folderPath,
            folderName,
            rootScope,
            resolvedApp,
            publisher,
            score,
            evidenceSummary,
            classification,
            stats.TotalBytes,
            stats.FileCount,
            untouchedDays,
            isJunction,
            offloadedTarget,
            trace);
    }

    private static (string? AppName, string? Publisher, string Source) InspectShallowMetadata(string rootDir, CancellationToken ct)
    {
        var queue = new Queue<(string Dir, int Depth)>();
        queue.Enqueue((rootDir, 0));
        int probed = 0;

        while (queue.Count > 0 && probed < 20)
        {
            ct.ThrowIfCancellationRequested();
            var (current, depth) = queue.Dequeue();

            try
            {
                foreach (var file in Directory.EnumerateFiles(current))
                {
                    if (probed >= 20) break;
                    var ext = Path.GetExtension(file);

                    if (ext.Equals(".exe", StringComparison.OrdinalIgnoreCase) || ext.Equals(".dll", StringComparison.OrdinalIgnoreCase))
                    {
                        probed++;
                        try
                        {
                            var fvi = FileVersionInfo.GetVersionInfo(file);
                            string? certCn = null;
                            try
                            {
                                using var cert = X509Certificate.CreateFromSignedFile(file);
                                certCn = ExtractSubjectCn(cert.Subject);
                            }
                            catch { }

                            if (!string.IsNullOrWhiteSpace(fvi.ProductName) || !string.IsNullOrWhiteSpace(certCn))
                            {
                                return (
                                    string.IsNullOrWhiteSpace(fvi.ProductName) ? null : fvi.ProductName.Trim(),
                                    certCn ?? (string.IsNullOrWhiteSpace(fvi.CompanyName) ? null : fvi.CompanyName.Trim()),
                                    certCn != null ? "PE + Authenticode" : "PE FileVersionInfo");
                            }
                        }
                        catch { }
                    }
                    else if (Path.GetFileName(file).Equals("package.json", StringComparison.OrdinalIgnoreCase))
                    {
                        probed++;
                        try
                        {
                            using var doc = JsonDocument.Parse(File.ReadAllText(file));
                            if (doc.RootElement.TryGetProperty("productName", out var pn) && pn.ValueKind == JsonValueKind.String)
                                return (pn.GetString(), null, "package.json");
                            if (doc.RootElement.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String)
                                return (nm.GetString(), null, "package.json");
                        }
                        catch { }
                    }
                }

                if (depth < 3)
                {
                    foreach (var sub in Directory.EnumerateDirectories(current))
                    {
                        if ((File.GetAttributes(sub) & FileAttributes.ReparsePoint) == 0)
                            queue.Enqueue((sub, depth + 1));
                    }
                }
            }
            catch { }
        }

        return (null, null, string.Empty);
    }

    private static string? ExtractSubjectCn(string subject)
    {
        var match = Regex.Match(subject, @"CN=([^,]+)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups[1].Value.Trim().Trim('"') : null;
    }

    private static HashSet<string> LoadMsiInstallerFolders()
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\Folders");
            if (key != null)
            {
                foreach (var valName in key.GetValueNames())
                    set.Add(valName.TrimEnd('\\'));
            }
        }
        catch { }
        return set;
    }

    public static string NormalizeToken(string raw)
    {
        var s = Regex.Replace(raw, @"\{[0-9a-fA-F-]{8,36}\}", "");
        s = Regex.Replace(s, @"^(com|org)\.", "", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"[-_.](updater|cache|temp)$", "", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"[-_.]+", " ");
        return Regex.Replace(s, @"\s+", " ").Trim().ToLowerInvariant();
    }

    public static double JaroWinkler(string s1, string s2)
    {
        if (string.IsNullOrEmpty(s1) || string.IsNullOrEmpty(s2)) return 0.0;
        if (s1.Equals(s2, StringComparison.OrdinalIgnoreCase)) return 1.0;

        s1 = s1.ToLowerInvariant();
        s2 = s2.ToLowerInvariant();

        int matchWindow = Math.Max(0, Math.Max(s1.Length, s2.Length) / 2 - 1);
        var aMatches = new bool[s1.Length];
        var bMatches = new bool[s2.Length];

        int matches = 0;
        for (int i = 0; i < s1.Length; i++)
        {
            int start = Math.Max(0, i - matchWindow);
            int end = Math.Min(i + matchWindow + 1, s2.Length);
            for (int j = start; j < end; j++)
            {
                if (bMatches[j] || s1[i] != s2[j]) continue;
                aMatches[i] = true;
                bMatches[j] = true;
                matches++;
                break;
            }
        }

        if (matches == 0) return 0.0;

        int transpositions = 0;
        int k = 0;
        for (int i = 0; i < s1.Length; i++)
        {
            if (!aMatches[i]) continue;
            while (!bMatches[k]) k++;
            if (s1[i] != s2[k]) transpositions++;
            k++;
        }

        double jaro = ((double)matches / s1.Length + (double)matches / s2.Length + (matches - transpositions / 2.0) / matches) / 3.0;

        int prefix = 0;
        int maxPrefix = Math.Min(4, Math.Min(s1.Length, s2.Length));
        for (int i = 0; i < maxPrefix; i++)
        {
            if (s1[i] == s2[i]) prefix++;
            else break;
        }

        return Math.Min(1.0, jaro + prefix * 0.1 * (1.0 - jaro));
    }
}
