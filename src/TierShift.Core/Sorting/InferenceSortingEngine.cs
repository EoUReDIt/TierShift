using System.Text;
using System.Text.RegularExpressions;

namespace TierShift.Core.Sorting;

public enum ClassificationStatus
{
    Verified,
    Probable,
    Unknown,
    Historical
}

public enum MoveAction
{
    MOVE,
    REVIEW,
    HOLD,
    REFERENCE
}

public sealed record SignalBreakdown(
    int ExplicitAssignment,
    int SubjectMatch,
    int ClusterMatch,
    int TemporalMatch,
    int VersionMatch,
    int ContradictoryPenalty,
    int Total);

public sealed record SortArtifactInput(
    string SourceFile,
    string FileName,
    string ParentFolder,
    DateTime ModifiedUtc,
    long SizeBytes,
    string ContentExcerpt,
    IReadOnlyList<string>? Topics = null,
    string? VersionGroup = null,
    int VersionRank = 0,
    bool IsHistoricalReference = false,
    string? HistoricalNote = null,
    int BatchNumber = 1);

public sealed record ClassifiedSortArtifact(
    string SourceFile,
    string FileName,
    string DestinationFolder,
    string Category,
    string SubCategory,
    string? SecondaryClassification,
    string? ClusterId,
    string? ClusterLabel,
    string? VersionFamily,
    int Confidence,
    ClassificationStatus Status,
    MoveAction MoveAction,
    SignalBreakdown Signals,
    IReadOnlyList<string> AppliedRules,
    string Notes,
    int BatchNumber);

public sealed record BatchYieldSummary(
    int BatchNumber,
    int ArtifactsProcessed,
    int NewCourseMappings,
    int NewCategoryMappings,
    int NewVerifiedArtifacts,
    bool ZeroYield);

public sealed record InferenceSortReport(
    IReadOnlyList<ClassifiedSortArtifact> Artifacts,
    IReadOnlyList<BatchYieldSummary> Batches,
    bool StopConditionReached);

/// <summary>
/// v37 Evidence-Based Inference Sorting Engine for OneDrive / cold-storage inventory reconstruction.
/// Governing Rule: Never classify solely by filename; accumulate Explicit, Subject, Cluster,
/// Temporal, and Version evidence minus contradictory penalties.
/// </summary>
public sealed partial class InferenceSortingEngine
{
    private sealed record CourseRule(
        string Code,
        string Title,
        Regex ExplicitRegex,
        string[] SubjectKeywords,
        string[] CodeFiles);

    private static readonly CourseRule[] CourseRules =
    [
        new("CMIS 141", "Introductory Programming", new Regex(@"\bcmis[\s_-]?141\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["byte of python", "python foundations", "intro programming", "exceptions"], []),
        new("CMIS 242", "Intermediate Programming", new Regex(@"\bcmis[\s_-]?242\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["intermediate java", "inheritance", "encapsulation"], []),
        new("CMSC 315", "Data Structures and Analysis", new Regex(@"\bcmsc[\s_-]?315\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["binary tree", "binarytree", "startbst", "bst", "graphapp", "vertexobj", "appstart", "point2dc", "getarraycreator", "data structures"],
            ["appstart.java", "binarytree.java", "graphapp.java", "vertexobj.java", "startbst.java", "getarraycreator.java", "point2dc.java"]),
        new("CMSC 320", "Relational Database Concepts", new Regex(@"\bcmsc[\s_-]?320\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["database design", "pk/fk", "primary key", "foreign key", "entity relationship", "normalization", "3nf", "relational schema"], []),
        new("CMSC 330", "Advanced Programming Languages", new Regex(@"\bcmsc[\s_-]?330\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["lexical analyzer", "syntax tree", "interpreter", "programming languages", "semantic analysis"], []),
        new("CMSC 335", "Object-Oriented & Concurrent Programming", new Regex(@"\bcmsc[\s_-]?335\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["javafx", "swing", "concurrency", "threads", "thread pool", "polymorphism"], []),
        new("CMSC 345", "Software Engineering Principles", new Regex(@"\bcmsc[\s_-]?345\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["requirements engineering", "erd analysis", "software lifecycle", "sdlc", "integration testing", "review questions"], []),
        new("CMSC 430", "Compiler Theory and Design", new Regex(@"\bcmsc[\s_-]?430\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["recursive descent", "grammar", "parse trees", "parse tree", "left recursion", "parsing discussion", "bnf", "compiler theory"], []),
        new("CMSC 451", "Design and Analysis of Algorithms", new Regex(@"\bcmsc[\s_-]?451\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["asymptotic", "dynamic programming", "recurrence relation", "np-complete", "algorithm analysis", "divide and conquer"], []),
        new("CMSC 495", "Capstone in Computer Science", new Regex(@"\bcmsc[\s_-]?495\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["capstone project", "cmsc 495"], []),
        new("CSIA 303", "Information System Security", new Regex(@"\bcsia[\s_-]?303\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["cia triad", "information assurance", "risk assessment", "access control policy"], []),
        new("SDEV 300", "Building Secure Python Applications", new Regex(@"\bsdev[\s_-]?300\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["flask security", "secure python", "owasp", "input sanitization", "week 5 assignments", "week 5 discussions", "password hashing"], []),
        new("ARIN 350", "Artificial Intelligence Applications", new Regex(@"\barin[\s_-]?350\b", RegexOptions.IgnoreCase | RegexOptions.Compiled),
            ["unit_8_final_presentation", "artificial intelligence", "ai governance"], [])
    ];

    private static readonly Regex[] UnreliableNamePatterns =
    [
        new(@"^content\.(rtf|mht|html?|txt)$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^document\d*\.(docx?|pdf|odt|rtf)$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^notes?\d*\.(txt|md|rtf)$", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^[a-f0-9-]{20,}\.", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"^[a-z0-9]{10,14}\.xlsx$", RegexOptions.IgnoreCase | RegexOptions.Compiled)
    ];

    private static readonly HashSet<string> ReadableTextExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".txt", ".md", ".java", ".cs", ".py", ".html", ".htm", ".json", ".csv", ".xml", ".rtf", ".mht", ".sql", ".js", ".ts"
    };

    [GeneratedRegex(@"\bproject\s*([1-9])\b", RegexOptions.IgnoreCase)]
    private static partial Regex ProjectNumberRegex();

    [GeneratedRegex(@"\b(CMIS|CMSC|CSIA|SDEV|ARIN|CMIT)\s+\d{3}\b", RegexOptions.IgnoreCase)]
    private static partial Regex CourseCodeExtractRegex();

    /// <summary>
    /// Scans a real directory on disk, reads bounded text excerpts (never trusting filename alone),
    /// and classifies all files using the v37 Evidence-Based Inference Sorting Engine.
    /// </summary>
    public async Task<InferenceSortReport> ScanAndClassifyDirectoryAsync(
        string rootDirectory,
        int maxFiles = 2000,
        CancellationToken ct = default)
    {
        if (!Directory.Exists(rootDirectory))
            throw new DirectoryNotFoundException($"Directory not found: {rootDirectory}");

        var inputs = await Task.Run(() =>
        {
            var list = new List<SortArtifactInput>();
            var stack = new Stack<string>();
            stack.Push(rootDirectory);

            while (stack.Count > 0 && list.Count < maxFiles)
            {
                ct.ThrowIfCancellationRequested();
                var current = stack.Pop();

                try
                {
                    foreach (var file in Directory.EnumerateFiles(current))
                    {
                        ct.ThrowIfCancellationRequested();
                        if (list.Count >= maxFiles) break;

                        try
                        {
                            var fi = new FileInfo(file);
                            var parentName = Path.GetFileName(Path.GetDirectoryName(file) ?? string.Empty);
                            var excerpt = ReadBoundedExcerpt(file, fi.Extension);
                            var versionGroup = InferVersionGroup(fi.Name);

                            list.Add(new SortArtifactInput(
                                SourceFile: file,
                                FileName: fi.Name,
                                ParentFolder: parentName,
                                ModifiedUtc: fi.LastWriteTimeUtc,
                                SizeBytes: fi.Length,
                                ContentExcerpt: excerpt,
                                VersionGroup: versionGroup,
                                VersionRank: (int)(fi.LastWriteTimeUtc.Year * 10000 + fi.LastWriteTimeUtc.Month * 100 + fi.LastWriteTimeUtc.Day),
                                BatchNumber: 1));
                        }
                        catch { }
                    }

                    foreach (var sub in Directory.EnumerateDirectories(current))
                    {
                        if ((File.GetAttributes(sub) & FileAttributes.ReparsePoint) != 0)
                            continue;
                        var name = Path.GetFileName(sub);
                        if (name.Equals("Verified Inventory", StringComparison.OrdinalIgnoreCase))
                            continue;
                        stack.Push(sub);
                    }
                }
                catch { }
            }

            return list;
        }, ct);

        return ClassifyArtifacts(inputs);
    }

    public InferenceSortReport ClassifyArtifacts(IReadOnlyList<SortArtifactInput> inputs)
    {
        // Pass 0: Rule 6 — Version family canonical newest name
        var newestByGroup = inputs
            .Where(i => !string.IsNullOrWhiteSpace(i.VersionGroup))
            .GroupBy(i => i.VersionGroup!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => Path.GetFileNameWithoutExtension(
                    g.OrderByDescending(x => x.VersionRank)
                     .ThenByDescending(x => x.ModifiedUtc)
                     .First().FileName),
                StringComparer.OrdinalIgnoreCase);

        var drafts = new List<DraftArtifact>(inputs.Count);

        // Pass 1: Independent signal accumulation
        foreach (var raw in inputs)
        {
            var topicsText = raw.Topics != null ? string.Join(" ", raw.Topics) : string.Empty;
            var combined = $"{raw.FileName} {raw.ParentFolder} {raw.ContentExcerpt} {topicsText}";
            var lower = combined.ToLowerInvariant();
            var lowerFile = raw.FileName.ToLowerInvariant();

            var draft = new DraftArtifact(raw)
            {
                ProjectKey = ExtractProjectKey(combined)
            };

            if (raw.IsHistoricalReference)
            {
                draft.Category = "Academic";
                draft.SubCategory = raw.FileName;
                draft.DestinationFolder = "Reference Only (No Move)";
                draft.AppliedRules.Add("Rule 8: Negative Evidence (Historical Reference)");
                draft.Notes.Add(raw.HistoricalNote ?? "Multiple reconstruction passes produced no recoverable artifacts.");
                drafts.Add(draft);
                continue;
            }

            // Rule 1: Explicit Course ID wins (100)
            CourseRule? matchedCourse = null;
            foreach (var rule in CourseRules)
            {
                if (rule.ExplicitRegex.IsMatch(combined))
                {
                    matchedCourse = rule;
                    draft.ExplicitScore = 100;
                    draft.AppliedRules.Add($"Rule 1: Explicit Identifier Wins ({rule.Code})");
                    draft.Notes.Add($"Explicit course identifier '{rule.Code}' ({rule.Title}) matched.");
                    break;
                }
            }

            // Rule 2: Subject-Based Inference when identifier is missing
            if (matchedCourse == null)
            {
                CourseRule? bestCourse = null;
                List<string> bestHits = [];

                foreach (var rule in CourseRules)
                {
                    var hits = rule.SubjectKeywords.Where(k => lower.Contains(k, StringComparison.Ordinal)).ToList();
                    if (rule.CodeFiles.Contains(lowerFile, StringComparer.OrdinalIgnoreCase))
                        hits.Add($"source:{raw.FileName}");

                    if (hits.Count > bestHits.Count)
                    {
                        bestHits = hits;
                        bestCourse = rule;
                    }
                }

                if (bestCourse != null && bestHits.Count >= 2)
                {
                    matchedCourse = bestCourse;
                    draft.SubjectScore = bestHits.Count >= 3 ? 94 : 82;
                    draft.AppliedRules.Add($"Rule 2: Subject-Based Inference ({bestCourse.Code})");
                    draft.Notes.Add($"Matched {bestHits.Count} curriculum signals ({string.Join(", ", bestHits.Take(4))}) for {bestCourse.Code}.");
                }
                else if (bestCourse != null && bestHits.Count == 1)
                {
                    matchedCourse = bestCourse;
                    draft.SubjectScore = 60;
                    draft.AppliedRules.Add($"Rule 2: Partial Subject Signal ({bestCourse.Code})");
                    draft.Notes.Add($"Single subject hit ({bestHits[0]}) — requires cluster corroboration.");
                }
            }

            // Rule 4: Supporting Material Inheritance (byte-of-python.pdf -> CMIS 141 + Python Foundations)
            if (matchedCourse != null && lower.Contains("byte") && lower.Contains("python"))
            {
                draft.CourseCode = "CMIS 141";
                draft.Category = "Academic";
                draft.SubCategory = "University Coursework / CMIS 141 / Supporting Material";
                draft.DestinationFolder = @"Verified Inventory\Academic\University Coursework\CMIS 141\Supporting Material";
                draft.SecondaryClassification = "Self-Paced Learning / Python Foundations";
                draft.AppliedRules.Add("Rule 4: Supporting Material Inheritance");
                draft.Notes.Add("Primary: CMIS 141 Supporting Material; Secondary: Self-Paced Learning / Python Foundations.");
            }
            else if (matchedCourse != null)
            {
                draft.CourseCode = matchedCourse.Code;
                draft.Category = "Academic";
                draft.SubCategory = draft.ProjectKey != null
                    ? $"University Coursework / {matchedCourse.Code} / {draft.ProjectKey}"
                    : $"University Coursework / {matchedCourse.Code}";
                draft.DestinationFolder = draft.ProjectKey != null
                    ? $@"Verified Inventory\Academic\University Coursework\{matchedCourse.Code}\{draft.ProjectKey}"
                    : $@"Verified Inventory\Academic\University Coursework\{matchedCourse.Code}";
                draft.AppliedRules.Add("Rule 7: Category Priority (University Coursework)");
            }

            // Rule 7 Priority 2: Professional Training (Revature PET)
            bool hasPetTrainingContext = Regex.IsMatch(combined, @"\bpet\b", RegexOptions.IgnoreCase) &&
                                         (lower.Contains("java") || lower.Contains("spring") || lower.Contains("angular") ||
                                          lower.Contains("coding lab") || lower.Contains("assessment") || lower.Contains("training"));
            if (matchedCourse == null && (lower.Contains("revature") || hasPetTrainingContext))
            {
                draft.Category = "Professional Training";
                draft.SubCategory = "Revature / PET";
                draft.DestinationFolder = @"Verified Inventory\Professional Training\Revature\PET";
                draft.ExplicitScore = 100;
                draft.AppliedRules.Add("Rule 1: Explicit Program Match (Revature PET)");
                draft.AppliedRules.Add("Rule 7: Category Separation (Assigned by Provider -> Professional Training)");
                draft.Notes.Add("Matched Revature PET curriculum (Java/Spring/Angular labs & assessments).");
            }

            // Rule 7 Priority 3: Self-Paced Learning (Educative / Coursera / edX / LinkedIn Learning)
            if (draft.Category == "Unsorted" &&
                (lower.Contains("educative") || lower.Contains("coursera") || lower.Contains("edx") || lower.Contains("linkedin learning") || lower.Contains("grokking")))
            {
                var provider = lower.Contains("educative") || lower.Contains("grokking") ? "Educative"
                    : lower.Contains("coursera") ? "Coursera"
                    : lower.Contains("edx") ? "edX" : "LinkedIn Learning";

                draft.Category = "Self-Paced Learning";
                draft.SubCategory = provider == "Educative" ? "Educative / Grokking Low Level Design" : provider;
                draft.DestinationFolder = provider == "Educative"
                    ? @"Verified Inventory\Self-Paced Learning\Educative\Grokking Low Level Design"
                    : $@"Verified Inventory\Self-Paced Learning\{provider}";
                draft.ExplicitScore = lower.Contains(provider.ToLowerInvariant()) ? 100 : 0;
                draft.SubjectScore = draft.ExplicitScore == 100 ? 0 : 92;
                draft.AppliedRules.Add($"Rule 1: Provider Curriculum Match ({provider})");
                draft.AppliedRules.Add("Rule 7: Category Separation (Provider Course -> Self-Paced Learning)");
                draft.Notes.Add($"Matched independent provider curriculum ({provider}).");
            }

            // Career Reconstruction
            if (draft.Category == "Unsorted")
            {
                if (lower.Contains("sf86") || lower.Contains("sf-86") || lower.Contains("security clearance"))
                {
                    draft.Category = "Career";
                    draft.SubCategory = "Security Clearance";
                    draft.DestinationFolder = @"Verified Inventory\Career\Security Clearance";
                    draft.ExplicitScore = 100;
                    draft.AppliedRules.Add("Rule 1: Explicit Form Identifier (SF-86)");
                    draft.Notes.Add("Matched Standard Form 86 National Security Positions clearance record.");
                }
                else if (lower.Contains("application-interview confirmed") || lower.Contains("interview confirmation"))
                {
                    draft.Category = "Career";
                    draft.SubCategory = "Interviews";
                    draft.DestinationFolder = @"Verified Inventory\Career\Interviews";
                    draft.ExplicitScore = 100;
                    draft.AppliedRules.Add("Rule 1: Confirmed Interview Artifact");
                    draft.Notes.Add("Verified interview-stage confirmation record.");
                }
                else if (lower.Contains("resume"))
                {
                    draft.Category = "Career";
                    draft.SubCategory = "Resume Workspace";
                    string? canonical = raw.VersionGroup != null && newestByGroup.TryGetValue(raw.VersionGroup, out var vName)
                        ? vName
                        : null;
                    draft.DestinationFolder = canonical != null
                        ? $@"Verified Inventory\Career\Resume Workspace\{canonical}"
                        : @"Verified Inventory\Career\Resume Workspace";
                    draft.ExplicitScore = lower.Contains("master resume") ? 95 : 80;
                    if (canonical != null)
                    {
                        draft.VersionScore = 10;
                        draft.AppliedRules.Add($"Rule 6: Version Reconstruction (Newest Name: {canonical})");
                        draft.Notes.Add($"Version family '{raw.VersionGroup}' resolved to newest name '{canonical}'.");
                    }
                    draft.Notes.Add("Matched Career Resume Workspace.");
                }
                else if (lower.Contains("sherweb"))
                {
                    draft.Category = "Career";
                    draft.SubCategory = "Employers / SherWeb";
                    draft.DestinationFolder = @"Verified Inventory\Career\Employers\SherWeb";
                    draft.ExplicitScore = 100;
                    draft.AppliedRules.Add("Rule 1: Employer Direct Match (Sherweb)");
                    draft.Notes.Add("Employer match verified against Sherweb timeline.");
                }
            }

            // Rule 7 Priority 4: Self-Directed Practice
            if (draft.Category == "Unsorted" &&
                (lower.Contains("graphviz") || lower.Contains("architecture notes") || lower.Contains("ai-assisted learning") || lower.Contains("hashset") || lower.Contains("abstractset")))
            {
                draft.Category = "Self-Directed Practice";
                draft.SubCategory = "Academic / Self-Directed Practice";
                draft.DestinationFolder = @"Verified Inventory\Academic\Self-Directed Practice";
                draft.SubjectScore = 92;
                draft.AppliedRules.Add("Rule 7: Category Separation (User-Created -> Self-Directed Practice)");
                draft.Notes.Add("Independent user-created practice artifact.");
            }

            // Governing Rule: penalize unreliable generic filenames without corroborating evidence
            if (UnreliableNamePatterns.Any(r => r.IsMatch(raw.FileName)) && draft.ExplicitScore == 0 && draft.SubjectScore < 80)
            {
                draft.ContradictoryPenalty = 15;
                draft.Notes.Add("Filename-only classification rejected: opaque/generic filename lacks convergent evidence.");
            }

            drafts.Add(draft);
        }

        // Pass 2: Rules 3 & 5 — Assignment Relationship & Cluster Reconstruction
        var anchors = drafts.Where(d => d.CourseCode != null && d.ProjectKey != null && d.ExplicitScore >= 90).ToList();
        foreach (var anchor in anchors)
        {
            var clusterId = $"{anchor.CourseCode}_{anchor.ProjectKey}".Replace(" ", "_").ToLowerInvariant();
            var clusterLabel = $"{anchor.CourseCode} · {anchor.ProjectKey} Cluster";
            anchor.ClusterId = clusterId;
            anchor.ClusterLabel = clusterLabel;

            foreach (var candidate in drafts)
            {
                if (ReferenceEquals(candidate, anchor) || candidate.Raw.IsHistoricalReference)
                    continue;

                bool sameProject = candidate.ProjectKey != null &&
                                   candidate.ProjectKey.Equals(anchor.ProjectKey, StringComparison.OrdinalIgnoreCase);
                bool closeDate = Math.Abs((candidate.Raw.ModifiedUtc - anchor.Raw.ModifiedUtc).TotalDays) <= 7.0;
                bool anchorReferencesFile = anchor.Raw.ContentExcerpt.Contains(candidate.Raw.FileName, StringComparison.OrdinalIgnoreCase);
                bool compatibleCourse = candidate.CourseCode == null ||
                                        candidate.CourseCode.Equals(anchor.CourseCode, StringComparison.OrdinalIgnoreCase);

                if (compatibleCourse && (anchorReferencesFile || (sameProject && closeDate)))
                {
                    candidate.CourseCode = anchor.CourseCode;
                    candidate.Category = "Academic";
                    candidate.SubCategory = $"University Coursework / {anchor.CourseCode} / {anchor.ProjectKey}";
                    candidate.DestinationFolder = $@"Verified Inventory\Academic\University Coursework\{anchor.CourseCode}\{anchor.ProjectKey}";
                    candidate.ClusterId = clusterId;
                    candidate.ClusterLabel = clusterLabel;

                    if (candidate.ExplicitScore < 100)
                        candidate.ClusterScore = Math.Max(candidate.ClusterScore, 30);
                    if (closeDate)
                        candidate.TemporalScore = Math.Max(candidate.TemporalScore, 15);

                    candidate.AppliedRules.Add($"Rule 3: Assignment Relationship Inference ({anchor.Raw.FileName})");
                    candidate.AppliedRules.Add($"Rule 5: Cluster Reconstruction ({clusterLabel})");
                    candidate.Notes.Add($"Converged with anchor '{anchor.Raw.FileName}' in {clusterLabel}.");
                }
            }
        }

        // Pass 3: Final Confidence Formula & Status Assignment
        var classified = new List<ClassifiedSortArtifact>(drafts.Count);
        foreach (var d in drafts)
        {
            int rawScore = d.ExplicitScore + d.SubjectScore + d.ClusterScore + d.TemporalScore + d.VersionScore - d.ContradictoryPenalty;
            int confidence = d.Raw.IsHistoricalReference ? 0 : Math.Clamp(rawScore, 0, 100);

            ClassificationStatus status;
            MoveAction action;
            string dest = d.DestinationFolder;
            string cat = d.Category;

            if (d.Raw.IsHistoricalReference)
            {
                status = ClassificationStatus.Historical;
                action = MoveAction.REFERENCE;
                dest = "Reference Only (No Move)";
            }
            else if (confidence >= 90)
            {
                status = ClassificationStatus.Verified;
                action = MoveAction.MOVE;
            }
            else if (confidence >= 75)
            {
                status = ClassificationStatus.Probable;
                action = MoveAction.REVIEW;
                dest = $@"Verified Inventory\Staging-Probable\{d.SubCategory.Replace(" / ", @"\")}";
            }
            else
            {
                status = ClassificationStatus.Unknown;
                action = MoveAction.HOLD;
                cat = "Unsorted";
                dest = @"Verified Inventory\Unsorted";
            }

            if (d.AppliedRules.Count == 0)
                d.AppliedRules.Add("Governing Rule: Insufficient Multi-Signal Evidence");
            if (d.Notes.Count == 0)
                d.Notes.Add("Held in Unsorted: no convergent signals.");

            classified.Add(new ClassifiedSortArtifact(
                d.Raw.SourceFile,
                d.Raw.FileName,
                dest,
                cat,
                d.SubCategory,
                d.SecondaryClassification,
                d.ClusterId,
                d.ClusterLabel,
                d.Raw.VersionGroup,
                confidence,
                status,
                action,
                new SignalBreakdown(d.ExplicitScore, d.SubjectScore, d.ClusterScore, d.TemporalScore, d.VersionScore, d.ContradictoryPenalty, confidence),
                d.AppliedRules.Distinct().ToList(),
                string.Join(" | ", d.Notes),
                d.Raw.BatchNumber));
        }

        // Batch Stop Condition Evaluation (2 consecutive zero-yield batches)
        var batchNumbers = classified.Select(a => a.BatchNumber).Distinct().OrderBy(n => n).ToList();
        var seenCourses = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var seenCategories = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var batches = new List<BatchYieldSummary>();

        int consecutiveZero = 0;
        bool stopReached = false;

        foreach (var b in batchNumbers)
        {
            var items = classified.Where(a => a.BatchNumber == b).ToList();
            int newCourses = 0;
            int newCats = 0;
            int newVerified = 0;

            foreach (var item in items)
            {
                if (item.Status == ClassificationStatus.Verified)
                {
                    newVerified++;
                    var m = CourseCodeExtractRegex().Match(item.SubCategory);
                    if (m.Success && seenCourses.Add(m.Value))
                        newCourses++;
                    if (seenCategories.Add(item.Category))
                        newCats++;
                }
            }

            bool zeroYield = newCourses == 0 && newCats == 0 && newVerified == 0;
            batches.Add(new BatchYieldSummary(b, items.Count, newCourses, newCats, newVerified, zeroYield));

            if (zeroYield)
            {
                consecutiveZero++;
                if (consecutiveZero >= 2) stopReached = true;
            }
            else
            {
                consecutiveZero = 0;
            }
        }

        return new InferenceSortReport(classified, batches, stopReached);
    }

    /// <summary>
    /// Exports the v37 Move Manifest Standard CSV:
    /// SourceFile,DestinationFolder,Category,SubCategory,Confidence,Status,MoveAction,Notes
    /// </summary>
    public static string ExportMoveManifestCsv(IEnumerable<ClassifiedSortArtifact> artifacts)
    {
        var sb = new StringBuilder();
        sb.AppendLine("SourceFile,DestinationFolder,Category,SubCategory,Confidence,Status,MoveAction,Notes");

        foreach (var a in artifacts)
        {
            sb.Append(CsvEscape(a.SourceFile)).Append(',');
            sb.Append(CsvEscape(a.DestinationFolder)).Append(',');
            sb.Append(CsvEscape(a.Category)).Append(',');
            sb.Append(CsvEscape(a.SubCategory)).Append(',');
            sb.Append(a.Confidence).Append(',');
            sb.Append(a.Status).Append(',');
            sb.Append(a.MoveAction).Append(',');
            sb.AppendLine(CsvEscape(a.Notes));
        }

        return sb.ToString();
    }

    /// <summary>
    /// Executes ONLY Verified (MOVE) artifacts into the Verified Inventory root.
    /// Probable artifacts are never auto-moved into final destinations; Unknown and Historical are never moved.
    /// </summary>
    public static int ExecuteVerifiedMoves(
        IEnumerable<ClassifiedSortArtifact> artifacts,
        string inventoryBaseRoot,
        bool includeProbableStaging = false)
    {
        int moved = 0;
        foreach (var item in artifacts)
        {
            bool eligible = item.MoveAction == MoveAction.MOVE ||
                            (includeProbableStaging && item.MoveAction == MoveAction.REVIEW);
            if (!eligible || !File.Exists(item.SourceFile))
                continue;

            var destDir = Path.Combine(inventoryBaseRoot, item.DestinationFolder);
            try
            {
                var fullSrc = Path.GetFullPath(item.SourceFile);
                var fullDestDir = Path.GetFullPath(destDir);
                if (fullSrc.Equals(Path.Combine(fullDestDir, item.FileName), StringComparison.OrdinalIgnoreCase))
                    continue;

                Directory.CreateDirectory(fullDestDir);

                var destFile = Path.Combine(fullDestDir, item.FileName);
                if (File.Exists(destFile))
                {
                    var stem = Path.GetFileNameWithoutExtension(item.FileName);
                    var ext = Path.GetExtension(item.FileName);
                    destFile = Path.Combine(fullDestDir, $"{stem}_{DateTime.UtcNow:yyyyMMddHHmmss}{ext}");
                }

                File.Move(fullSrc, destFile);
                moved++;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Skip locked or read-only files without aborting remaining verified moves
            }
        }

        return moved;
    }

    private static string ReadBoundedExcerpt(string filePath, string extension)
    {
        if (!ReadableTextExtensions.Contains(extension))
            return string.Empty;

        try
        {
            using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            var buffer = new char[2048];
            int read = sr.Read(buffer, 0, buffer.Length);
            return read > 0 ? new string(buffer, 0, read) : string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string? InferVersionGroup(string fileName)
    {
        if (fileName.Contains("Resume", StringComparison.OrdinalIgnoreCase))
            return "Master Resume";
        return null;
    }

    private static string? ExtractProjectKey(string text)
    {
        var m = ProjectNumberRegex().Match(text);
        return m.Success ? $"Project {m.Groups[1].Value}" : null;
    }

    private static string CsvEscape(string value)
    {
        if (value.IndexOfAny([',', '"', '\r', '\n']) >= 0)
            return $"\"{value.Replace("\"", "\"\"")}\"";
        return value;
    }

    private sealed class DraftArtifact(SortArtifactInput raw)
    {
        public SortArtifactInput Raw { get; } = raw;
        public string Category { get; set; } = "Unsorted";
        public string SubCategory { get; set; } = "Unclassified";
        public string DestinationFolder { get; set; } = @"Verified Inventory\Unsorted";
        public string? SecondaryClassification { get; set; }
        public string? CourseCode { get; set; }
        public string? ProjectKey { get; set; }
        public string? ClusterId { get; set; }
        public string? ClusterLabel { get; set; }
        public int ExplicitScore { get; set; }
        public int SubjectScore { get; set; }
        public int ClusterScore { get; set; }
        public int TemporalScore { get; set; }
        public int VersionScore { get; set; }
        public int ContradictoryPenalty { get; set; }
        public List<string> AppliedRules { get; } = [];
        public List<string> Notes { get; } = [];
    }
}
