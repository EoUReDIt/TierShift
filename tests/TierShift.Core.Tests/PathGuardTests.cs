using TierShift.Core.Guardrails;
using Xunit;

namespace TierShift.Core.Tests;

public class PathGuardTests
{
    [Theory]
    [InlineData(@"C:\Windows\System32")]
    [InlineData(@"C:\")]
    [InlineData(@"C:\Program Files")]
    [InlineData(@"C:\Program Files\Riot Vanguard")]
    [InlineData(@"C:\Program Files\WindowsApps\AppX")]
    public void Validate_BlocksCriticalPaths(string dangerousPath)
    {
        var result = PathGuard.Validate(dangerousPath, @"D:\TierShift\Test", 1024);
        Assert.False(result.Allowed);
    }
}
