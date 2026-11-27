using TierShift.Core.Guardrails;
using Xunit;

namespace TierShift.Core.Tests;

public class PathGuardTests
{
    [Theory]
    [InlineData(@"C:\Windows\System32", "BLOCKED_SYSTEM_ROOT")]
    [InlineData(@"C:\", "BLOCKED_DRIVE_ROOT")]
    [InlineData(@"C:\Program Files", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Program Files (x86)", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\ProgramData", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Users\Alex", "BLOCKED_PROFILE_ROOT")]
    [InlineData(@"C:\Users\Alex\AppData", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Users\Alex\AppData\Local", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Users\Alex\AppData\LocalLow", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Users\Alex\AppData\Roaming", "BLOCKED_CONTAINER_ROOT")]
    [InlineData(@"C:\Program Files\Riot Vanguard", "BLOCKED_KERNEL_ANTICHEAT")]
    [InlineData(@"C:\Program Files\WindowsApps\AppX", "BLOCKED_WINDOWSAPPS_MSIX_ONLY")]
    public void Validate_BlocksCriticalPaths(string dangerousPath, string expectedCode)
    {
        var result = PathGuard.Validate(dangerousPath, @"D:\TierShift\Test", 1024);
        Assert.False(result.Allowed);
        Assert.Equal(expectedCode, result.Code);
    }

    [Fact]
    public void Validate_BlocksSameVolumeByDefault()
    {
        var result = PathGuard.Validate(
            @"C:\Program Files\Blender Foundation\Blender 4.2",
            @"C:\TierShift\Apps\Blender 4.2",
            1024);

        Assert.False(result.Allowed);
        Assert.Equal("BLOCKED_SAME_VOLUME", result.Code);
    }

    [Fact]
    public void Validate_ReturnsStructuredErrorWhenTargetDriveUnavailable()
    {
        var result = PathGuard.Validate(
            @"C:\Program Files\Blender Foundation\Blender 4.2",
            @"Q:\TierShift\Apps\Blender 4.2",
            1024);

        Assert.False(result.Allowed);
        Assert.Equal("BLOCKED_TARGET_DRIVE_NOT_READY", result.Code);
    }
}
