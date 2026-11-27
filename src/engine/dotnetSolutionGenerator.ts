import { ZipEntryInput } from './zipBuilder';

import slnRaw from '../../TierShift.sln?raw';
import coreCsprojRaw from '../TierShift.Core/TierShift.Core.csproj?raw';
import nativeMethodsRaw from '../TierShift.Core/NativeMethods.txt?raw';
import pathGuardRaw from '../TierShift.Core/Guardrails/PathGuard.cs?raw';
import sqliteLedgerRaw from '../TierShift.Core/Data/SqliteLedger.cs?raw';
import junctionMoveRaw from '../TierShift.Core/Migration/JunctionMoveService.cs?raw';
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
    path: 'src/TierShift.Core/TierShift.Core.csproj',
    language: 'xml',
    description:
      'Pure C# net8.0-windows10.0.22621.0 class library with CsWin32 and Microsoft.Data.Sqlite.',
    content: coreCsprojRaw,
  },
  {
    path: 'src/TierShift.Core/NativeMethods.txt',
    language: 'text',
    description:
      'CsWin32 source-generated Win32 P/Invoke declarations for NTFS Reparse Points & Restart Manager.',
    content: nativeMethodsRaw,
  },
  {
    path: 'src/TierShift.Core/Guardrails/PathGuard.cs',
    language: 'csharp',
    description:
      'Non-negotiable OS path blocklist, AppData root & same-volume guards, safe DriveInfo & 110% space pre-flight validator.',
    content: pathGuardRaw,
  },
  {
    path: 'src/TierShift.Core/Data/SqliteLedger.cs',
    language: 'csharp',
    description:
      'SQLite initializer for MoveLedger, TransactionJournal, and AttributionCache.',
    content: sqliteLedgerRaw,
  },
  {
    path: 'src/TierShift.Core/Migration/JunctionMoveService.cs',
    language: 'csharp',
    description:
      'Atomic Junction-Anchored Move state machine with PathGuard validation, fail-safe stubs, and rollback.',
    content: junctionMoveRaw,
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
      'Fluent WinUI 3 shell with MicaBackdrop, custom titlebar drag region, and left NavigationView.',
    content: mainWindowXamlRaw,
  },
  {
    path: 'src/TierShift.App/MainWindow.xaml.cs',
    language: 'csharp',
    description:
      'MainWindow code-behind configuring custom titlebar extension and initializing the SQLite MoveLedger.',
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
      'xUnit tests verifying fail-safe stubs throw without modifying source files or leaving backup folders.',
    content: junctionMoveTestsRaw,
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
