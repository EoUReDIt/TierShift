using TierShift.Core.FileSystem;
using Xunit;

namespace TierShift.Core.Tests;

public class TransferEstimatorTests
{
    [Fact]
    public void NoEstimateDuringWarmUp()
    {
        var est = new TransferEstimator(warmUp: TimeSpan.FromSeconds(2));
        est.Update(10_000_000, TimeSpan.FromSeconds(1));
        Assert.NotNull(est.BytesPerSecond);
        Assert.Null(est.EstimateRemaining(10_000_000, 100_000_000));
    }

    [Fact]
    public void SteadyRateGivesExpectedRemainingTime()
    {
        var est = new TransferEstimator();
        for (var s = 1; s <= 10; s++)
            est.Update(s * 10_000_000L, TimeSpan.FromSeconds(s)); // 10 MB/s

        Assert.Equal(10_000_000, est.BytesPerSecond!.Value, precision: 0);
        Assert.Equal(TimeSpan.FromSeconds(90), est.EstimateRemaining(100_000_000, 1_000_000_000));
    }

    [Fact]
    public void SmoothingDampsASingleSpike()
    {
        var est = new TransferEstimator(smoothing: 0.25);
        for (var s = 1; s <= 5; s++)
            est.Update(s * 10_000_000L, TimeSpan.FromSeconds(s));        // 10 MB/s
        est.Update(5 * 10_000_000L + 100_000_000, TimeSpan.FromSeconds(6)); // one 100 MB/s second

        var rate = est.BytesPerSecond!.Value;
        Assert.InRange(rate, 10_000_000, 40_000_000);
    }

    [Fact]
    public void SamplesTooCloseTogetherAreIgnored()
    {
        var est = new TransferEstimator(minSampleInterval: TimeSpan.FromMilliseconds(500));
        est.Update(1_000_000, TimeSpan.FromMilliseconds(100));
        Assert.Null(est.BytesPerSecond);
    }

    [Fact]
    public void StalledTransferHasNoEstimate()
    {
        var est = new TransferEstimator();
        est.Update(0, TimeSpan.FromSeconds(3));
        Assert.Null(est.EstimateRemaining(0, 1_000));
    }

    [Fact]
    public void ResetClearsRate()
    {
        var est = new TransferEstimator();
        est.Update(10_000_000, TimeSpan.FromSeconds(3));
        est.Reset();
        Assert.Null(est.BytesPerSecond);
    }

    [Theory]
    [InlineData(0, "1s")]
    [InlineData(45, "45s")]
    [InlineData(245, "4m 05s")]
    [InlineData(7620, "2h 07m")]
    public void FormatDuration_IsShortAndReadable(int seconds, string expected)
    {
        Assert.Equal(expected, TransferEstimator.FormatDuration(TimeSpan.FromSeconds(seconds)));
    }
}

public class VerifiedCopyProgressTests
{
    private sealed class CollectingProgress : IProgress<CopyProgress>
    {
        public List<CopyProgress> Reports { get; } = new();
        public void Report(CopyProgress value)
        {
            lock (Reports) Reports.Add(value);
        }
    }

    [Fact]
    public async Task ReportsScanningCopyingVerifyingAndProgressInsideLargeFiles()
    {
        var root = Path.Combine(Path.GetTempPath(), "tiershift-progress-" + Guid.NewGuid().ToString("N"));
        var source = Path.Combine(root, "source");
        var target = Path.Combine(root, "target");
        Directory.CreateDirectory(Path.Combine(source, "sub"));

        var largeSize = VerifiedCopy.ChunkedCopyThresholdBytes + 3 * 1024 * 1024 + 17;
        var large = new byte[largeSize];
        new Random(42).NextBytes(large);
        await File.WriteAllBytesAsync(Path.Combine(source, "model.bin"), large);
        await File.WriteAllTextAsync(Path.Combine(source, "sub", "small.txt"), "hello");
        var readOnlyFile = Path.Combine(source, "sub", "locked.cfg");
        await File.WriteAllTextAsync(readOnlyFile, "cfg");
        File.SetAttributes(readOnlyFile, FileAttributes.ReadOnly);
        var stamp = new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(Path.Combine(source, "model.bin"), stamp);

        var progress = new CollectingProgress();
        try
        {
            var stats = await VerifiedCopy.CopyDirectoryVerifiedAsync(source, target, progress, reportInterval: TimeSpan.Zero);

            var totalBytes = largeSize + 5 + 3;
            Assert.Equal(3, stats.FileCount);
            Assert.Equal(totalBytes, stats.TotalBytes);

            var reports = progress.Reports;
            Assert.Equal(CopyPhase.Scanning, reports[0].Phase);
            Assert.Equal(CopyPhase.Verifying, reports[^1].Phase);
            Assert.Equal(1.0, reports[^1].Fraction);

            var copying = reports.Where(r => r.Phase == CopyPhase.Copying).ToList();
            Assert.Contains(copying, r => r.BytesCopied > 0 && r.BytesCopied < largeSize && r.FilesCopied == 0);
            Assert.True(copying.Zip(copying.Skip(1)).All(p => p.Second.BytesCopied >= p.First.BytesCopied));
            Assert.Equal(totalBytes, copying[^1].BytesCopied);

            Assert.Equal(large, await File.ReadAllBytesAsync(Path.Combine(target, "model.bin")));
            Assert.Equal(stamp, File.GetLastWriteTimeUtc(Path.Combine(target, "model.bin")));
            Assert.True((File.GetAttributes(Path.Combine(target, "sub", "locked.cfg")) & FileAttributes.ReadOnly) != 0);
        }
        finally
        {
            foreach (var f in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
                File.SetAttributes(f, FileAttributes.Normal);
            Directory.Delete(root, recursive: true);
        }
    }
}
