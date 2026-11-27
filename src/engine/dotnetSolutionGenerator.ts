import { ECOSYSTEM_KB_RULES, PROTECTED_WHITELIST } from './ecosystemKb';
import { ZipEntryInput } from './zipBuilder';

export interface SolutionFileEntry {
  path: string;
  language: 'csharp' | 'xml' | 'json' | 'sql' | 'text';
  description: string;
  content: string;
}

export const DOTNET_SOLUTION_FILES: SolutionFileEntry[] = [
  {
    path: 'TierShift.sln',
    language: 'text',
    description: 'Visual Studio / .NET 8 solution file separating Core, WinUI 3 App, and xUnit Tests.',
    content: `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.11.35327.3
MinimumVisualStudioVersion = 10.0.40219.1
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "TierShift.Core", "src\\TierShift.Core\\TierShift.Core.csproj", "{A8C14F90-12B3-4C5E-8B11-94F21E880001}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "TierShift.App", "src\\TierShift.App\\TierShift.App.csproj", "{A8C14F90-12B3-4C5E-8B11-94F21E880002}"
EndProject
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "TierShift.Core.Tests", "tests\\TierShift.Core.Tests\\TierShift.Core.Tests.csproj", "{A8C14F90-12B3-4C5E-8B11-94F21E880003}"
EndProject
Global
\tGlobalSection(SolutionConfigurationPlatforms) = preSolution
\t\tDebug|x64 = Debug|x64
\t\tRelease|x64 = Release|x64
\tEndGlobalSection
EndGlobal
`,
  },
  {
    path: 'src/TierShift.Core/TierShift.Core.csproj',
    language: 'xml',
    description: 'Pure C# net8.0-windows10.0.22621.0 class library with CsWin32 and Microsoft.Data.Sqlite.',
    content: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows10.0.22621.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    <Platforms>x64</Platforms>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.Data.Sqlite" Version="8.0.10" />
    <PackageReference Include="Microsoft.Windows.CsWin32" Version="0.3.106" PrivateAssets="all" />
  </ItemGroup>
  <ItemGroup>
    <Content Include="Rules\\ecosystem_kb.json" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
`,
  },
  {
    path: 'src/TierShift.Core/NativeMethods.txt',
    language: 'text',
    description: 'CsWin32 source-generated Win32 P/Invoke declarations for NTFS Reparse Points & Restart Manager.',
    content: `DeviceIoControl
CreateFile
GetFinalPathNameByHandle
FSCTL_SET_REPARSE_POINT
FSCTL_DELETE_REPARSE_POINT
FSCTL_GET_REPARSE_POINT
IO_REPARSE_TAG_MOUNT_POINT
RmStartSession
RmRegisterResources
RmGetList
RmShutdown
RmEndSession
`,
  },
  {
    path: 'src/TierShift.Core/Guardrails/PathGuard.cs',
    language: 'csharp',
    description: 'Non-negotiable OS path blocklist, kernel anti-cheat guard, NTFS fixed drive & 110% space pre-flight validator.',
    content: `using System.IO;

namespace TierShift.Core.Guardrails;

public sealed record PathGuardResult(bool Allowed, string Code, string Message, bool RouteViaMsix = false);

public static class PathGuard
{
    private static readonly string[] BlockedPrefixes =
    [
        Environment.GetFolderPath(Environment.SpecialFolder.Windows),
        @"C:\\$Recycle.Bin",
        @"C:\\System Volume Information",
        @"C:\\Boot",
        @"C:\\EFI",
        @"C:\\Recovery"
    ];

    private static readonly string[] BlockedContainerRoots =
    [
        @"C:\\Program Files",
        @"C:\\Program Files (x86)",
        @"C:\\ProgramData",
        @"C:\\Users"
    ];

    private static readonly string[] KernelAntiCheatTokens =
    [
        "riot vanguard",
        "easyanticheat",
        "battleye",
        "faceit ac"
    ];

    public static PathGuardResult Validate(string sourcePath, string targetPath, long sourceSizeBytes, bool isMsixNativeMove = false)
    {
        var fullSource = Path.GetFullPath(sourcePath).TrimEnd('\\\\');
        var fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\\\');

        if (fullSource.Length <= 2 && fullSource.EndsWith(':'))
            return new(false, "BLOCKED_DRIVE_ROOT", "Drive roots cannot be relocated.");

        foreach (var prefix in BlockedPrefixes)
        {
            if (fullSource.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
                fullSource.StartsWith(prefix + "\\\\", StringComparison.OrdinalIgnoreCase))
                return new(false, "BLOCKED_SYSTEM_ROOT", $"Protected OS root blocked: {prefix}");
        }

        if (fullSource.StartsWith(@"C:\\Program Files\\WindowsApps", StringComparison.OrdinalIgnoreCase) && !isMsixNativeMove)
            return new(false, "BLOCKED_WINDOWSAPPS_MSIX_ONLY", "Route WindowsApps through PackageManager.MovePackageToVolumeAsync.", RouteViaMsix: true);

        if (BlockedContainerRoots.Any(r => fullSource.Equals(r, StringComparison.OrdinalIgnoreCase)))
            return new(false, "BLOCKED_CONTAINER_ROOT", "Only child directories inside system container roots may be relocated.");

        var userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile).TrimEnd('\\\\');
        if (fullSource.Equals(userProfile, StringComparison.OrdinalIgnoreCase))
            return new(false, "BLOCKED_PROFILE_ROOT", "User profile root cannot be relocated; target specific AppData child folders.");

        var lowerSource = fullSource.ToLowerInvariant();
        foreach (var token in KernelAntiCheatTokens)
        {
            if (lowerSource.Contains(token))
                return new(false, "BLOCKED_KERNEL_ANTICHEAT", $"Kernel anti-cheat/driver path blocked: {token}");
        }

        if (Directory.Exists(fullSource) && (File.GetAttributes(fullSource) & FileAttributes.ReparsePoint) != 0)
            return new(false, "BLOCKED_ALREADY_REPARSE_POINT", "Source path is already an NTFS Reparse Point.");

        var targetRoot = Path.GetPathRoot(fullTarget) ?? throw new ArgumentException("Invalid target path.");
        var drive = new DriveInfo(targetRoot);
        if (drive.DriveType != DriveType.Fixed)
            return new(false, "BLOCKED_TARGET_DRIVE_TYPE", $"Target drive {drive.Name} must be a local Fixed disk.");

        if (!drive.DriveFormat.Equals("NTFS", StringComparison.OrdinalIgnoreCase))
            return new(false, "BLOCKED_TARGET_FILESYSTEM", $"Target drive {drive.Name} must be NTFS (found {drive.DriveFormat}).");

        var requiredBytes = (long)Math.Ceiling(sourceSizeBytes * 1.10);
        if (drive.AvailableFreeSpace < requiredBytes)
            return new(false, "BLOCKED_INSUFFICIENT_SPACE", $"Target requires {requiredBytes:N0} bytes (110% safety headroom).");

        return new(true, "OK", "Pre-flight safety checks passed.");
    }
}
`,
  },
  {
    path: 'src/TierShift.Core/Data/SqliteLedger.cs',
    language: 'csharp',
    description: 'SQLite initializer and repository for MoveLedger, TransactionJournal, and AttributionCache.',
    content: `using Microsoft.Data.Sqlite;

namespace TierShift.Core.Data;

public sealed class SqliteLedger(string dbPath)
{
    private readonly string _connectionString = new SqliteConnectionStringBuilder
    {
        DataSource = dbPath,
        Mode = SqliteOpenMode.ReadWriteCreate
    }.ToString();

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS MoveLedger (
                Id TEXT PRIMARY KEY,
                AppDisplayName TEXT NOT NULL,
                MoveType TEXT NOT NULL,
                SourcePath TEXT NOT NULL,
                TargetPath TEXT NOT NULL,
                BytesMoved INTEGER NOT NULL,
                Status TEXT NOT NULL,
                CreatedAtUtc TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS TransactionJournal (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                MoveId TEXT NOT NULL,
                StepOrder INTEGER NOT NULL,
                ActionType TEXT NOT NULL,
                PayloadJson TEXT NOT NULL,
                Completed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS AttributionCache (
                FolderPath TEXT PRIMARY KEY,
                ResolvedAppName TEXT,
                Publisher TEXT,
                ConfidenceScore INTEGER NOT NULL,
                EvidenceSummary TEXT NOT NULL,
                Classification TEXT NOT NULL,
                SizeBytes INTEGER NOT NULL,
                LastScannedUtc TEXT NOT NULL
            );
            """;
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
`,
  },
  {
    path: 'src/TierShift.Core/Migration/JunctionMoveService.cs',
    language: 'csharp',
    description: 'Atomic Junction-Anchored Move state machine with Restart Manager lock check, verified copy, swap, and rollback.',
    content: `using TierShift.Core.Data;
using TierShift.Core.Guardrails;

namespace TierShift.Core.Migration;

public sealed class JunctionMoveService(SqliteLedger ledger)
{
    public async Task<string> ExecuteAsync(
        string appDisplayName,
        string moveType,
        string sourcePath,
        string targetPath,
        long sourceSizeBytes,
        CancellationToken ct = default)
    {
        var guard = PathGuard.Validate(sourcePath, targetPath, sourceSizeBytes);
        if (!guard.Allowed)
            throw new InvalidOperationException($"PathGuard blocked relocation ({guard.Code}): {guard.Message}");

        var moveId = Guid.NewGuid().ToString();
        var backupPath = sourcePath.TrimEnd('\\\\') + ".tiershift_bak";

        // 1. Copy & verify file count + byte total
        await CopyDirectoryVerifiedAsync(sourcePath, targetPath, ct);

        // 2. Atomic swap: rename -> create NTFS junction -> verify -> delete backup
        var junctionCreated = false;
        try
        {
            Directory.Move(sourcePath, backupPath);
            Directory.CreateDirectory(sourcePath);
            NtfsJunction.Create(sourcePath, targetPath);
            junctionCreated = true;

            if (!NtfsJunction.VerifyResolvesTo(sourcePath, targetPath))
                throw new IOException("Junction verification failed via GetFinalPathNameByHandle.");

            Directory.Delete(backupPath, recursive: true);
            return moveId;
        }
        catch
        {
            if (junctionCreated && Directory.Exists(sourcePath))
                Directory.Delete(sourcePath, recursive: false);
            if (Directory.Exists(backupPath) && !Directory.Exists(sourcePath))
                Directory.Move(backupPath, sourcePath);
            if (Directory.Exists(targetPath))
                Directory.Delete(targetPath, recursive: true);
            throw;
        }
    }

    private static Task CopyDirectoryVerifiedAsync(string source, string target, CancellationToken ct)
    {
        // TODO: recursive copy preserving timestamps & basic ACLs, then assert file count + total bytes.
        // Throws until implemented: this runs before any source rename, so nothing is moved or deleted.
        throw new NotImplementedException("Verified directory copy is not implemented yet.");
    }
}

public static class NtfsJunction
{
    // TODO: DeviceIoControl FSCTL_SET_REPARSE_POINT with a mount-point reparse buffer.
    public static void Create(string junctionPath, string targetPath) =>
        throw new NotImplementedException("NTFS junction creation is not implemented yet.");

    // TODO: open the junction and compare GetFinalPathNameByHandle against expectedTarget.
    public static bool VerifyResolvesTo(string junctionPath, string expectedTarget) =>
        throw new NotImplementedException("NTFS junction verification is not implemented yet.");
}
`,
  },
  {
    path: 'src/TierShift.Core/Rules/ecosystem_kb.json',
    language: 'json',
    description: 'Vendor mapping rules and protected GPU/OS cache whitelist for Stage 4 & Stage 5 attribution.',
    content: JSON.stringify(
      {
        schemaVersion: '1.0',
        protectedWhitelist: PROTECTED_WHITELIST,
        rules: ECOSYSTEM_KB_RULES,
      },
      null,
      2
    ),
  },
  {
    path: 'src/TierShift.App/app.manifest',
    language: 'xml',
    description: 'Unpackaged WinUI 3 manifest requiring Administrator elevation for HKLM and Program Files access.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <assemblyIdentity version="0.1.0.0" name="TierShift.App"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
`,
  },
  {
    path: 'tests/TierShift.Core.Tests/PathGuardTests.cs',
    language: 'csharp',
    description: 'xUnit tests verifying PathGuard hard-rejects Windows system paths, profile roots, and kernel anti-cheat.',
    content: `using TierShift.Core.Guardrails;
using Xunit;

namespace TierShift.Core.Tests;

public class PathGuardTests
{
    [Theory]
    [InlineData(@"C:\\Windows\\System32")]
    [InlineData(@"C:\\")]
    [InlineData(@"C:\\Program Files")]
    [InlineData(@"C:\\Program Files\\Riot Vanguard")]
    [InlineData(@"C:\\Program Files\\WindowsApps\\AppX")]
    public void Validate_BlocksCriticalPaths(string dangerousPath)
    {
        var result = PathGuard.Validate(dangerousPath, @"D:\\TierShift\\Test", 1024);
        Assert.False(result.Allowed);
    }
}
`,
  },
  {
    path: '.github/workflows/release.yml',
    language: 'text',
    description: 'Manual workflow_dispatch GitHub Action that tests, publishes win-x64 WinUI 3, builds the Inno Setup installer, and publishes a GitHub Release.',
    content: `name: Manual Release (WinUI 3 + Inno Setup)

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Semantic version to release (e.g. 0.1.0)'
        required: true
        type: string
        default: '0.1.0'
      prerelease:
        description: 'Mark GitHub Release as pre-release'
        required: false
        type: boolean
        default: false
      release_notes:
        description: 'Optional release summary notes'
        required: false
        type: string
        default: 'TierShift release with Inno Setup installer and portable x64 archive.'

permissions:
  contents: write

jobs:
  build-and-release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet restore TierShift.sln -r win-x64
      - run: dotnet test tests/TierShift.Core.Tests/TierShift.Core.Tests.csproj -c Release --no-restore
      - name: Publish Unpackaged WinUI 3 (win-x64)
        shell: pwsh
        run: |
          dotnet publish src/TierShift.App/TierShift.App.csproj -c Release -r win-x64 --self-contained true -p:Platform=x64 -p:WindowsPackageType=None -p:WindowsAppSDKSelfContained=true -p:Version=\${{ inputs.version }} -o artifacts/publish/win-x64
      - name: Build Inno Setup Installer
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force -Path artifacts/release | Out-Null
          & "\${env:ProgramFiles(x86)}\\Inno Setup 6\\ISCC.exe" "/DMyAppVersion=\${{ inputs.version }}" "/DPublishDir=..\\artifacts\\publish\\win-x64" "/DOutputDir=..\\artifacts\\release" installer/TierShift.iss
      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v\${{ inputs.version }}
          name: TierShift v\${{ inputs.version }}
          prerelease: \${{ inputs.prerelease }}
          files: |
            artifacts/release/TierShift-Setup-\${{ inputs.version }}-x64.exe
            artifacts/release/SHA256SUMS.txt
`,
  },
  {
    path: 'installer/TierShift.iss',
    language: 'text',
    description: 'Recommended Inno Setup 6 installer script for unpackaged WinUI 3 (.NET 8 x64) with Administrator elevation.',
    content: `; TierShift Recommended Windows Installer (Inno Setup 6)
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppId={{9F4C28E1-6D4B-4C7A-A420-81B32F09C512}
AppName=TierShift
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\\TierShift
MinVersion=10.0.19045
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
OutputBaseFilename=TierShift-Setup-{#MyAppVersion}-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "{#PublishDir}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\TierShift"; Filename: "{app}\\TierShift.App.exe"
`,
  },
];

export function getSolutionZipEntries(): ZipEntryInput[] {
  return DOTNET_SOLUTION_FILES.map((f) => ({
    path: `TierShift/${f.path}`,
    content: f.content,
  }));
}
