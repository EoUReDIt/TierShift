using TierShift.Core.Data;
using TierShift.Core.Migration;
using Xunit;

namespace TierShift.Core.Tests;

public class JunctionMoveServiceTests
{
    [Fact]
    public void NtfsJunction_StubsThrowInsteadOfFakingSuccess()
    {
        Assert.Throws<NotImplementedException>(() => NtfsJunction.Create(@"C:\a", @"D:\b"));
        Assert.Throws<NotImplementedException>(() => NtfsJunction.VerifyResolvesTo(@"C:\a", @"D:\b"));
    }

    [Fact]
    public async Task ExecuteAsync_ThrowsWithoutTouchingSource()
    {
        var root = Path.Combine(Path.GetTempPath(), "tiershift-test-" + Guid.NewGuid().ToString("N"));
        var source = Path.Combine(root, "source");
        var target = Path.Combine(root, "target");
        Directory.CreateDirectory(source);
        var file = Path.Combine(source, "data.txt");
        File.WriteAllText(file, "keep me");

        try
        {
            var service = new JunctionMoveService(new SqliteLedger(Path.Combine(root, "ledger.db")));
            await Assert.ThrowsAsync<NotImplementedException>(
                () => service.ExecuteAsync("Test", "AppData", source, target, 7, allowSameVolumeForTesting: true));

            Assert.Equal("keep me", File.ReadAllText(file));
            Assert.False(Directory.Exists(source + ".tiershift_bak"));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }
}
