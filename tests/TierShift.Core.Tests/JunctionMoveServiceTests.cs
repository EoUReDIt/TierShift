using TierShift.Core.Attribution;
using TierShift.Core.Data;
using TierShift.Core.FileSystem;
using TierShift.Core.Migration;
using Xunit;

namespace TierShift.Core.Tests;

public class JunctionMoveServiceTests
{
    [Fact]
    public async Task ExecuteAsync_MovesDirectoryCreatesJunctionAndRollsBackCleanly()
    {
        var root = Path.Combine(Path.GetTempPath(), "tiershift-test-" + Guid.NewGuid().ToString("N"));
        var source = Path.Combine(root, "source");
        var nested = Path.Combine(source, "sub");
        var target = Path.Combine(root, "target");
        Directory.CreateDirectory(nested);

        var file = Path.Combine(nested, "data.txt");
        File.WriteAllText(file, "keep me safely");

        try
        {
            var ledger = new SqliteLedger(Path.Combine(root, "ledger.db"));
            await ledger.InitializeAsync();
            var service = new JunctionMoveService(ledger);

            var moveId = await service.ExecuteAsync(
                "TestApp",
                "AppDataJunction",
                source,
                target,
                14,
                allowSameVolumeForTesting: true);

            Assert.True(NtfsJunction.IsJunction(source));
            Assert.True(NtfsJunction.VerifyResolvesTo(source, target));
            Assert.Equal("keep me safely", File.ReadAllText(Path.Combine(source, "sub", "data.txt")));
            Assert.False(Directory.Exists(source + ".tiershift_bak"));

            var moves = await ledger.GetAllMovesAsync();
            Assert.Single(moves);
            Assert.Equal("Active", moves[0].Status);

            await service.RollbackAsync(moveId);

            Assert.False(NtfsJunction.IsJunction(source));
            Assert.Equal("keep me safely", File.ReadAllText(Path.Combine(source, "sub", "data.txt")));
            Assert.False(Directory.Exists(target));

            var updated = await ledger.GetMoveByIdAsync(moveId);
            Assert.NotNull(updated);
            Assert.Equal("RolledBack", updated!.Status);
        }
        finally
        {
            if (NtfsJunction.IsJunction(source))
                NtfsJunction.Delete(source);
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task JunctionSweepService_CleansOrphanedTargetAfterUninstallerDeletesJunction()
    {
        var root = Path.Combine(Path.GetTempPath(), "tiershift-sweep-" + Guid.NewGuid().ToString("N"));
        var source = Path.Combine(root, "app_c");
        var target = Path.Combine(root, "app_d");
        Directory.CreateDirectory(source);
        File.WriteAllText(Path.Combine(source, "app.bin"), "payload");

        try
        {
            var ledger = new SqliteLedger(Path.Combine(root, "ledger.db"));
            await ledger.InitializeAsync();
            var moveService = new JunctionMoveService(ledger);
            var sweepService = new JunctionSweepService(ledger);

            var moveId = await moveService.ExecuteAsync(
                "UninstalledApp",
                "Win32Junction",
                source,
                target,
                7,
                allowSameVolumeForTesting: true);

            // Simulate Windows Uninstaller deleting files through the junction, then removing the C: junction
            File.Delete(Path.Combine(source, "app.bin"));
            NtfsJunction.Delete(source);

            Assert.False(Directory.Exists(source));
            Assert.True(Directory.Exists(target));

            var report = await sweepService.RunSweepAsync();
            Assert.Equal(1, report.CleanedTargets);
            Assert.False(Directory.Exists(target));

            var updated = await ledger.GetMoveByIdAsync(moveId);
            Assert.Equal("OrphanedTargetCleaned", updated!.Status);
        }
        finally
        {
            if (NtfsJunction.IsJunction(source))
                NtfsJunction.Delete(source);
            if (Directory.Exists(root))
                Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void AttributionEngine_JaroWinklerAndProtectedWhitelistWork()
    {
        Assert.Equal("blackmagic resolve", AttributionEngine.NormalizeToken("com.blackmagic.resolve-updater"));
        Assert.True(AttributionEngine.JaroWinkler("mathworks", "mathworks inc") >= 0.85);

        var root = Path.Combine(Path.GetTempPath(), "tiershift-attr-" + Guid.NewGuid().ToString("N"));
        var protectedDir = Path.Combine(root, "EBWebView");
        Directory.CreateDirectory(protectedDir);

        try
        {
            var engine = new AttributionEngine();
            var result = engine.AnalyzeFolder(protectedDir, "EBWebView", "Local", []);
            Assert.Equal("Protected", result.Classification);
            Assert.True(result.ConfidenceScore >= 95);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
