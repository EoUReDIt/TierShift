using TierShift.Core.Discovery;
using Xunit;

namespace TierShift.Core.Tests;

public class AppDiscoveryServiceTests
{
    [Theory]
    [InlineData(@"D:\", "D:")]
    [InlineData("d:", "D:")]
    [InlineData("e", "E:")]
    [InlineData("  c:\\  ", "C:")]
    [InlineData("", "")]
    public void NormalizeDriveLetter_CanonicalizesVolumeMountPoints(string input, string expected)
    {
        Assert.Equal(expected, AppDiscoveryService.NormalizeDriveLetter(input));
    }

    [Fact]
    public void GetLocalVolumes_ReturnsAtLeastOneReadyFixedVolume()
    {
        var volumes = AppDiscoveryService.GetLocalVolumes();
        Assert.NotEmpty(volumes);
        Assert.Contains(volumes, v => v.DriveType == DriveType.Fixed && v.TotalBytes > 0);
    }

    [Fact]
    public async Task DiscoverInstalledAppsAsync_CompletesWithoutThrowing()
    {
        var apps = await AppDiscoveryService.DiscoverInstalledAppsAsync();
        Assert.NotNull(apps);
    }

    [Fact]
    public async Task MoveMsixPackageToVolumeAsync_ThrowsWhenTargetVolumeDoesNotExist()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            AppDiscoveryService.MoveMsixPackageToVolumeAsync("NonExistent.TestPackage_1.0.0.0_x64__8wekyb3d8bbwe", @"Q:\"));
    }
}
