import { ZipEntryInput } from './zipBuilder';

import slnRaw from '../../TierShift.sln?raw';
import globalJsonRaw from '../../global.json?raw';
import coreCsprojRaw from '../TierShift.Core/TierShift.Core.csproj?raw';
import pathGuardRaw from '../TierShift.Core/Guardrails/PathGuard.cs?raw';
import ntfsJunctionRaw from '../TierShift.Core/FileSystem/NtfsJunction.cs?raw';
import verifiedCopyRaw from '../TierShift.Core/FileSystem/VerifiedCopy.cs?raw';
import restartManagerRaw from '../TierShift.Core/FileSystem/RestartManagerService.cs?raw';
import sqliteLedgerRaw from '../TierShift.Core/Data/SqliteLedger.cs?raw';
import junctionMoveRaw from '../TierShift.Core/Migration/JunctionMoveService.cs?raw';
import junctionSweepRaw from '../TierShift.Core/Migration/JunctionSweepService.cs?raw';
import appDiscoveryRaw from '../TierShift.Core/Discovery/AppDiscoveryService.cs?raw';
import attributionEngineRaw from '../TierShift.Core/Attribution/AttributionEngine.cs?raw';
import capsuleServiceRaw from '../TierShift.Core/Capsules/CapsuleService.cs?raw';
import inferenceSortingRaw from '../TierShift.Core/Sorting/InferenceSortingEngine.cs?raw';
import ecosystemKbRaw from '../TierShift.Core/Rules/ecosystem_kb.json?raw';
import appCsprojRaw from '../TierShift.App/TierShift.App.csproj?raw';
import appManifestRaw from '../TierShift.App/app.manifest?raw';
import appXamlRaw from '../TierShift.App/App.xaml?raw';
import appXamlCsRaw from '../TierShift.App/App.xaml.cs?raw';
import mainWindowXamlRaw from '../TierShift.App/MainWindow.xaml?raw';
import mainWindowXamlCsRaw from '../TierShift.App/MainWindow.xaml.cs?raw';
import testsCsprojRaw from '../../tests/TierShift.Core.Tests/TierShift.Core.Tests.csproj?raw';
import pathGuardTestsRaw from '../../tests/TierShift.Core.Tests/PathGuardTests.cs?raw';
import junctionMoveTestsRaw from '../../tests/TierShift.Core.Tests/JunctionMoveServiceTests.cs?raw';
import inferenceSortingTestsRaw from '../../tests/TierShift.Core.Tests/InferenceSortingEngineTests.cs?raw';
import appDiscoveryTestsRaw from '../../tests/TierShift.Core.Tests/AppDiscoveryServiceTests.cs?raw';
import ciWorkflowRaw from '../../.github/workflows/ci.yml?raw';
import releaseWorkflowRaw from '../../.github/workflows/release.yml?raw';
import installerIssRaw from '../../installer/TierShift.iss?raw';

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
    description:
      'Visual Studio / .NET 8 solution file separating Core, WinUI 3 App, and xUnit Tests.',
    content: slnRaw,
  },
  {
    path: 'global.json',
    language: 'json',
    description:
      'Pins the .NET 8.0.x SDK (latestFeature rollForward) so CI and local builds never drift to newer preview/major SDKs.',
    content: globalJsonRaw,
  },
  {
    path: 'src/TierShift.Core/TierShift.Core.csproj',
    language: 'xml',
    description:
      'Pure C# net8.0-windows10.0.22621.0 class library with Microsoft.Data.Sqlite and direct Win32 interop.',
    content: coreCsprojRaw,
  },
  {
    path: 'src/TierShift.Core/Guardrails/PathGuard.cs',
    language: 'csharp',
    description:
      'Non-negotiable OS path blocklist, AppData root & same-volume guards, safe DriveInfo & 110% space pre-flight validator.',
    content: pathGuardRaw,
  },
  {
    path: 'src/TierShift.Core/FileSystem/NtfsJunction.cs',
    language: 'csharp',
    description:
      'Win32 NTFS Directory Junction creator, deleter, and GetFinalPathNameByHandleW verifier.',
    content: ntfsJunctionRaw,
  },
  {
    path: 'src/TierShift.Core/FileSystem/VerifiedCopy.cs',
    language: 'csharp',
    description:
      'Recursive timestamp-preserving copy engine with file-count & byte-total integrity verification.',
    content: verifiedCopyRaw,
  },
  {
    path: 'src/TierShift.Core/FileSystem/RestartManagerService.cs',
    language: 'csharp',
    description:
      'Windows Restart Manager lock detection and graceful user-app shutdown service.',
    content: restartManagerRaw,
  },
  {
    path: 'src/TierShift.Core/Data/SqliteLedger.cs',
    language: 'csharp',
    description:
      'SQLite repository for MoveLedger, TransactionJournal, and AttributionCache.',
    content: sqliteLedgerRaw,
  },
  {
    path: 'src/TierShift.Core/Migration/JunctionMoveService.cs',
    language: 'csharp',
    description:
      'Atomic Junction-Anchored Move state machine with Restart Manager checks, verified copy, NTFS swap, and 1-click RollbackAsync.',
    content: junctionMoveRaw,
  },
  {
    path: 'src/TierShift.Core/Migration/JunctionSweepService.cs',
    language: 'csharp',
    description:
      'Post-uninstall orphaned target directory sweeper for active MoveLedger junctions.',
    content: junctionSweepRaw,
  },
  {
    path: 'src/TierShift.Core/Discovery/AppDiscoveryService.cs',
    language: 'csharp',
    description:
      'Local NTFS volume reader, ARP Uninstall registry scanner, MSIX PackageManager mover, and native uninstaller launcher.',
    content: appDiscoveryRaw,
  },
  {
    path: 'src/TierShift.Core/Attribution/AttributionEngine.cs',
    language: 'csharp',
    description:
      '5-Stage Mystery Folder Attribution Engine with ecosystem_kb.json, Jaro-Winkler similarity, and PE/Authenticode inspection.',
    content: attributionEngineRaw,
  },
  {
    path: 'src/TierShift.Core/Capsules/CapsuleService.cs',
    language: 'csharp',
    description:
      'Portable .tiercapsule ZIP + .reg exporter and Restore Redirected NTFS junction restorer.',
    content: capsuleServiceRaw,
  },
  {
    path: 'src/TierShift.Core/Sorting/InferenceSortingEngine.cs',
    language: 'csharp',
    description:
      'v37 Evidence-Based Inference Sorting Engine implementing all 8 PoC rules, cluster & version reconstruction, stop-condition tracking, and 8-column Move Manifest CSV export.',
    content: inferenceSortingRaw,
  },
  {
    path: 'src/TierShift.Core/Rules/ecosystem_kb.json',
    language: 'json',
    description:
      'Vendor mapping rules and protected GPU/OS cache whitelist for Stage 4 & Stage 5 attribution.',
    content: ecosystemKbRaw,
  },
  {
    path: 'src/TierShift.App/TierShift.App.csproj',
    language: 'xml',
    description:
      'Unpackaged self-contained WinUI 3 / Windows App SDK desktop application project (win-x64).',
    content: appCsprojRaw,
  },
  {
    path: 'src/TierShift.App/app.manifest',
    language: 'xml',
    description:
      'Unpackaged WinUI 3 manifest requiring Administrator elevation for HKLM and Program Files access.',
    content: appManifestRaw,
  },
  {
    path: 'src/TierShift.App/App.xaml',
    language: 'xml',
    description: 'WinUI 3 application resources dictionary.',
    content: appXamlRaw,
  },
  {
    path: 'src/TierShift.App/App.xaml.cs',
    language: 'csharp',
    description: 'WinUI 3 application entry point launching MainWindow.',
    content: appXamlCsRaw,
  },
  {
    path: 'src/TierShift.App/MainWindow.xaml',
    language: 'xml',
    description:
      'Full interactive WinUI 3 Fluent UI with MicaBackdrop, NavigationView, Dashboard, Apps & Advisor, AppData Inspector, and Capsules & Ledger.',
    content: mainWindowXamlRaw,
  },
  {
    path: 'src/TierShift.App/MainWindow.xaml.cs',
    language: 'csharp',
    description:
      'MainWindow code-behind connecting all 4 WinUI 3 screens to TierShift.Core engines.',
    content: mainWindowXamlCsRaw,
  },
  {
    path: 'tests/TierShift.Core.Tests/TierShift.Core.Tests.csproj',
    language: 'xml',
    description: 'xUnit test project targeting net8.0-windows10.0.22621.0 (x64).',
    content: testsCsprojRaw,
  },
  {
    path: 'tests/TierShift.Core.Tests/PathGuardTests.cs',
    language: 'csharp',
    description:
      'xUnit tests verifying PathGuard blocks system paths, AppData roots, same-volume moves, and missing target drives.',
    content: pathGuardTestsRaw,
  },
  {
    path: 'tests/TierShift.Core.Tests/JunctionMoveServiceTests.cs',
    language: 'csharp',
    description:
      'End-to-end xUnit tests covering real NTFS Junction move, rollback, orphaned junction sweep, and attribution scoring.',
    content: junctionMoveTestsRaw,
  },
  {
    path: 'tests/TierShift.Core.Tests/InferenceSortingEngineTests.cs',
    language: 'csharp',
    description:
      'xUnit tests validating all 8 v37 inference sorting rules, cluster convergence, stop condition, and Move Manifest CSV export.',
    content: inferenceSortingTestsRaw,
  },
  {
    path: 'tests/TierShift.Core.Tests/AppDiscoveryServiceTests.cs',
    language: 'csharp',
    description:
      'xUnit tests verifying local volume discovery, mount-point normalization, and MSIX FindPackageVolumes lookup.',
    content: appDiscoveryTestsRaw,
  },
  {
    path: '.github/workflows/ci.yml',
    language: 'text',
    description:
      'Automated push/PR CI workflow validating .NET 8 xUnit tests, WinUI 3 x64 compilation, and TypeScript/Vite web builds.',
    content: ciWorkflowRaw,
  },
  {
    path: '.github/workflows/release.yml',
    language: 'text',
    description:
      'Manual workflow_dispatch GitHub Action that restores/tests x64, publishes WinUI 3, builds the Inno Setup installer, and publishes a GitHub Release.',
    content: releaseWorkflowRaw,
  },
  {
    path: 'installer/TierShift.iss',
    language: 'text',
    description:
      'Recommended Inno Setup 6 installer script for unpackaged WinUI 3 (.NET 8 x64) with Administrator elevation.',
    content: installerIssRaw,
  },
];

export function getSolutionZipEntries(): ZipEntryInput[] {
  return DOTNET_SOLUTION_FILES.map((f) => ({
    path: `TierShift/${f.path}`,
    content: f.content,
  }));
}
