using TierShift.Core.Sorting;
using Xunit;

namespace TierShift.Core.Tests;

public class InferenceSortingEngineTests
{
    [Fact]
    public void ClassifyArtifacts_AppliesAllEightProofOfConceptRules()
    {
        var engine = new InferenceSortingEngine();
        var inputs = new List<SortArtifactInput>
        {
            // Rule 1: Explicit identifier wins (100 -> Verified / MOVE)
            new(
                @"OneDrive\Presentations\Unit_8_Final_Presentation.pptx",
                "Unit_8_Final_Presentation.pptx",
                "Presentations",
                new DateTime(2025, 2, 24, 0, 0, 0, DateTimeKind.Utc),
                6_800_000,
                "ARIN 350 Unit 8 Final Presentation on Artificial Intelligence governance",
                BatchNumber: 1),

            // Rule 2: Subject-based inference recovers CMSC 430 without Course ID
            new(
                @"OneDrive\Exports\Week 2 discussion.html",
                "Week 2 discussion.html",
                "Exports",
                new DateTime(2024, 9, 12, 0, 0, 0, DateTimeKind.Utc),
                42_910,
                "Recursive Descent parser grammar, Parse Trees, and Left Recursion elimination",
                BatchNumber: 1),

            // Rules 3 & 5: Anchor + loose Java source file reconstruct CMSC 315 Project 4 Cluster
            new(
                @"OneDrive\School\Project 4 Reflection.docx",
                "Project 4 Reflection.docx",
                "School",
                new DateTime(2024, 5, 6, 0, 0, 0, DateTimeKind.Utc),
                184_320,
                "CMSC 315 Project 4 Reflection referencing GraphApp.java and VertexObj.java",
                BatchNumber: 1),
            new(
                @"OneDrive\LooseCode\GraphApp.java",
                "GraphApp.java",
                "LooseCode",
                new DateTime(2024, 5, 5, 0, 0, 0, DateTimeKind.Utc),
                14_210,
                "public class GraphApp { // Project 4 graph canvas for VertexObj }",
                BatchNumber: 1),

            // Rule 4: Supporting material inheritance (Primary CMIS 141 + Secondary Python Foundations)
            new(
                @"OneDrive\Books\byte-of-python.pdf",
                "byte-of-python.pdf",
                "Books",
                new DateTime(2023, 9, 10, 0, 0, 0, DateTimeKind.Utc),
                1_842_000,
                "A Byte of Python Foundations used as CMIS 141 supporting material",
                BatchNumber: 1),

            // Rule 7: Professional Training vs Self-Directed Practice
            new(
                @"OneDrive\Training\Revature_PET_Lab.zip",
                "Revature_PET_Lab.zip",
                "Training",
                new DateTime(2025, 10, 4, 0, 0, 0, DateTimeKind.Utc),
                4_920_100,
                "Revature PET Java Spring Angular assigned coding lab",
                BatchNumber: 2),
            new(
                @"OneDrive\Scratch\Graphviz_Notes.md",
                "Graphviz_Notes.md",
                "Scratch",
                new DateTime(2025, 11, 11, 0, 0, 0, DateTimeKind.Utc),
                38_200,
                "Independent Graphviz Research and Architecture Notes",
                BatchNumber: 2),

            // Governing Rule: Generic filename without signals -> Unknown / HOLD
            new(
                @"OneDrive\Recovered\content.rtf",
                "content.rtf",
                "Recovered",
                new DateTime(2023, 11, 19, 0, 0, 0, DateTimeKind.Utc),
                8_420,
                "Generic unlabeled rich text notes",
                BatchNumber: 3),

            // Rule 8: Negative Evidence -> Historical / REFERENCE
            new(
                @"OneDrive\Archive\CMIT 265",
                "CMIT 265",
                "Archive",
                new DateTime(2023, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                0,
                string.Empty,
                IsHistoricalReference: true,
                HistoricalNote: "No projects or coursework recovered across 5 passes",
                BatchNumber: 4)
        };

        var report = engine.ClassifyArtifacts(inputs);

        var arin = report.Artifacts.Single(a => a.FileName == "Unit_8_Final_Presentation.pptx");
        Assert.Equal(100, arin.Confidence);
        Assert.Equal(ClassificationStatus.Verified, arin.Status);
        Assert.Equal(MoveAction.MOVE, arin.MoveAction);
        Assert.Contains("ARIN 350", arin.DestinationFolder);

        var cmsc430 = report.Artifacts.Single(a => a.FileName == "Week 2 discussion.html");
        Assert.True(cmsc430.Confidence >= 90);
        Assert.Equal(ClassificationStatus.Verified, cmsc430.Status);
        Assert.Contains("CMSC 430", cmsc430.DestinationFolder);

        var graphApp = report.Artifacts.Single(a => a.FileName == "GraphApp.java");
        Assert.Equal(ClassificationStatus.Verified, graphApp.Status);
        Assert.Equal("cmsc_315_project_4", graphApp.ClusterId);
        Assert.Contains(@"CMSC 315\Project 4", graphApp.DestinationFolder);

        var pythonBook = report.Artifacts.Single(a => a.FileName == "byte-of-python.pdf");
        Assert.Contains(@"CMIS 141\Supporting Material", pythonBook.DestinationFolder);
        Assert.Equal("Self-Paced Learning / Python Foundations", pythonBook.SecondaryClassification);

        var revature = report.Artifacts.Single(a => a.FileName == "Revature_PET_Lab.zip");
        Assert.Equal("Professional Training", revature.Category);

        var graphviz = report.Artifacts.Single(a => a.FileName == "Graphviz_Notes.md");
        Assert.Equal("Self-Directed Practice", graphviz.Category);

        var unknown = report.Artifacts.Single(a => a.FileName == "content.rtf");
        Assert.Equal(ClassificationStatus.Unknown, unknown.Status);
        Assert.Equal(MoveAction.HOLD, unknown.MoveAction);
        Assert.Equal(@"Verified Inventory\Unsorted", unknown.DestinationFolder);

        var historical = report.Artifacts.Single(a => a.FileName == "CMIT 265");
        Assert.Equal(ClassificationStatus.Historical, historical.Status);
        Assert.Equal(MoveAction.REFERENCE, historical.MoveAction);

        // Batches 3 & 4 produced 0 new mappings/verified artifacts -> Stop Condition reached
        Assert.True(report.StopConditionReached);

        // Move Manifest CSV standard header verification
        var csv = InferenceSortingEngine.ExportMoveManifestCsv(report.Artifacts);
        Assert.StartsWith("SourceFile,DestinationFolder,Category,SubCategory,Confidence,Status,MoveAction,Notes", csv);
    }

    [Fact]
    public void ClassifyArtifacts_DoesNotFalsePositiveOnUnrelatedPetDocuments()
    {
        var engine = new InferenceSortingEngine();
        var inputs = new List<SortArtifactInput>
        {
            new(
                @"OneDrive\Personal\Pet_Vaccination_Receipt.txt",
                "Pet_Vaccination_Receipt.txt",
                "Personal",
                new DateTime(2025, 4, 12, 0, 0, 0, DateTimeKind.Utc),
                2048,
                "Annual veterinary clinic receipt for family pet checkup",
                BatchNumber: 1)
        };

        var report = engine.ClassifyArtifacts(inputs);
        var item = Assert.Single(report.Artifacts);
        Assert.NotEqual("Professional Training", item.Category);
        Assert.Equal(ClassificationStatus.Unknown, item.Status);
        Assert.Equal(MoveAction.HOLD, item.MoveAction);
    }
}
