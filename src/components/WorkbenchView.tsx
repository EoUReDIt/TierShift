import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { DriveVolume, InstalledApp } from '../engine/types';
import { formatBytes, validatePathGuard } from '../engine/pathGuard';
import {
  analyzeFolder,
  normalizeFolderToken,
} from '../engine/attributionEngine';
import {
  DOTNET_SOLUTION_FILES,
  getSolutionZipEntries,
} from '../engine/dotnetSolutionGenerator';
import { createZipBlob, triggerBlobDownload } from '../engine/zipBuilder';

interface WorkbenchViewProps {
  drives: DriveVolume[];
  apps: InstalledApp[];
}

const PRESET_PATHS = [
  { label: 'Windows System32', path: 'C:\\Windows\\System32' },
  { label: 'Riot Vanguard', path: 'C:\\Program Files\\Riot Vanguard' },
  {
    label: 'WindowsApps (MSIX)',
    path: 'C:\\Program Files\\WindowsApps\\Microsoft.Forza_1.0',
  },
  { label: 'User Profile Root', path: 'C:\\Users\\Alex' },
  { label: 'AppData Root', path: 'C:\\Users\\Alex\\AppData\\Local' },
  { label: 'Valid Win32 App', path: 'C:\\Program Files\\Blender Foundation\\Blender 4.2' },
];

export const WorkbenchView: React.FC<WorkbenchViewProps> = ({
  drives,
  apps,
}) => {
  const [tab, setTab] = useState<'sandbox' | 'source'>('sandbox');

  // PathGuard tester state
  const [testSourcePath, setTestSourcePath] = useState(
    'C:\\Program Files\\Riot Vanguard'
  );
  const [testTargetDriveLetter, setTestTargetDriveLetter] = useState('D:');
  const [testSizeGB, setTestSizeGB] = useState(12);
  const [isMsixFlag, setIsMsixFlag] = useState(false);

  // Attribution tester state
  const [customFolderName, setCustomFolderName] = useState(
    'com.blackmagic.resolve-updater'
  );
  const [customDaysUntouched, setCustomDaysUntouched] = useState(120);
  const [customHasArpKey, setCustomHasArpKey] = useState(false);

  // Source viewer state
  const [selectedFilePath, setSelectedFilePath] = useState(
    DOTNET_SOLUTION_FILES[3].path // PathGuard.cs
  );
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const selectedDrive =
    drives.find((d) => d.letter === testTargetDriveLetter) || drives[1];

  const guardResult = useMemo(
    () =>
      validatePathGuard({
        sourcePath: testSourcePath,
        targetPath: `${selectedDrive.letter}\\TierShift\\CustomTarget`,
        sourceSizeBytes: testSizeGB * 1024 * 1024 * 1024,
        targetDrive: selectedDrive,
        isMsixNativeMove: isMsixFlag,
      }),
    [testSourcePath, selectedDrive, testSizeGB, isMsixFlag]
  );

  const customAttribution = useMemo(
    () =>
      analyzeFolder(
        {
          id: 'custom-test',
          folderPath: `C:\\Users\\Alex\\AppData\\Local\\${customFolderName}`,
          folderName: customFolderName,
          rootScope: 'Local',
          sizeBytes: 1.4 * 1024 * 1024 * 1024,
          fileCount: 1240,
          lastModifiedDaysAgo: customDaysUntouched,
          isReparsePoint: false,
          activeLocks: [],
          hasMatchingArpKey: customHasArpKey,
          hasRunningService: false,
          hasProgramFilesExe: customHasArpKey,
        },
        apps
      ),
    [customFolderName, customDaysUntouched, customHasArpKey, apps]
  );

  const selectedFile =
    DOTNET_SOLUTION_FILES.find((f) => f.path === selectedFilePath) ||
    DOTNET_SOLUTION_FILES[0];

  const handleDownloadSolution = () => {
    const blob = createZipBlob(getSolutionZipEntries());
    triggerBlobDownload(blob, 'TierShift-Net8-WinUI3-Solution.zip');
  };

  const handleCopyFile = async (content: string, path: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      // Fallback ignored if clipboard denied in sandbox
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E6EC] bg-white px-4 py-3 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
          <button
            type="button"
            onClick={() => setTab('sandbox')}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'sandbox'
                ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
            }`}
          >
            PathGuard & Heuristic Tester
          </button>
          <button
            type="button"
            onClick={() => setTab('source')}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === 'source'
                ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
            }`}
          >
            .NET 8 / WinUI 3 Source ({DOTNET_SOLUTION_FILES.length} files)
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownloadSolution}
          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download .NET 8 Solution (.zip)</span>
        </button>
      </div>

      {tab === 'sandbox' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* PathGuard Validator */}
          <section className="rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
            <h3 className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              PathGuard Blocklist & Pre-Flight Tester
            </h3>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              Verify non-negotiable OS blocklists, NTFS fixed-disk enforcement, and 110% headroom math.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {PRESET_PATHS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTestSourcePath(preset.path)}
                  className="whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-[#F8FAFC] px-2.5 py-1 text-[11px] font-medium text-[#374151] hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#14171C] dark:text-[#CBD5E1]"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label
                  htmlFor="pg-source-input"
                  className="mb-1 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
                >
                  Source Windows Path
                </label>
                <input
                  id="pg-source-input"
                  type="text"
                  value={testSourcePath}
                  onChange={(e) => setTestSourcePath(e.target.value)}
                  className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#171B21] focus:border-[#0067C0] focus:bg-white focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="pg-target-drive"
                    className="mb-1 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
                  >
                    Target Volume
                  </label>
                  <select
                    id="pg-target-drive"
                    value={testTargetDriveLetter}
                    onChange={(e) => setTestTargetDriveLetter(e.target.value)}
                    className="w-full rounded-lg border border-[#D8DEE6] bg-white px-2.5 py-2 text-xs text-[#171B21] dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
                  >
                    {drives.map((d) => (
                      <option key={d.letter} value={d.letter}>
                        {d.letter} {d.label} ({d.fileSystem} · {d.driveType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="pg-size-gb"
                    className="mb-1 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
                  >
                    Folder Size (GB)
                  </label>
                  <input
                    id="pg-size-gb"
                    type="number"
                    min={1}
                    max={4000}
                    value={testSizeGB}
                    onChange={(e) =>
                      setTestSizeGB(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-2 font-mono text-xs tabular-nums text-[#171B21] dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isMsixFlag}
                  onChange={(e) => setIsMsixFlag(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#0067C0]"
                />
                <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                  Route via native MSIX PackageManager API
                </span>
              </label>

              <div
                className={`mt-2 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-xs ${
                  guardResult.allowed
                    ? 'border-[#D1E7DD] bg-[#F4FBF7] text-[#14532D] dark:border-[#1E3A2A] dark:bg-[#132219] dark:text-[#86EFAC]'
                    : 'border-[#F5C2C7] bg-[#FDF2F2] text-[#7F1D1D] dark:border-[#4A1E24] dark:bg-[#241316] dark:text-[#FCA5A5]'
                }`}
              >
                {guardResult.allowed ? (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div className="space-y-1">
                  <div className="font-semibold">
                    {guardResult.allowed
                      ? 'ALLOWED'
                      : `REJECTED · ${guardResult.code}`}
                  </div>
                  <p>{guardResult.message}</p>
                  {guardResult.requiredBytes !== undefined && (
                    <p className="font-mono text-[11px] opacity-85">
                      Required (110%): {formatBytes(guardResult.requiredBytes)}{' '}
                      · Free on {selectedDrive.letter}:{' '}
                      {formatBytes(guardResult.availableBytes || 0)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Live 5-Stage Attribution Tester */}
          <section className="rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
            <h3 className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              Live 5-Stage Attribution & Jaro-Winkler Sandbox
            </h3>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              Test any AppData folder name against `ecosystem_kb.json`, Protected Whitelist, and ARP fuzzy matching.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label
                  htmlFor="attr-folder-input"
                  className="mb-1 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
                >
                  AppData Folder Name
                </label>
                <input
                  id="attr-folder-input"
                  type="text"
                  value={customFolderName}
                  onChange={(e) => setCustomFolderName(e.target.value)}
                  placeholder="e.g. SquirrelTemp, MathWorks-Updater, EBWebView"
                  className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-2 font-mono text-xs text-[#171B21] focus:border-[#0067C0] focus:bg-white focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
                />
                <div className="mt-1 font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                  Normalized token: &quot;{normalizeFolderToken(customFolderName)}&quot;
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="attr-days-input"
                    className="mb-1 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
                  >
                    Untouched Days
                  </label>
                  <input
                    id="attr-days-input"
                    type="number"
                    min={0}
                    max={999}
                    value={customDaysUntouched}
                    onChange={(e) =>
                      setCustomDaysUntouched(
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-2 font-mono text-xs tabular-nums text-[#171B21] dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={customHasArpKey}
                      onChange={(e) => setCustomHasArpKey(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#0067C0]"
                    />
                    <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                      Parent app installed in ARP
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-lg border border-[#E5E9F0] bg-[#F8FAFC] p-3.5 dark:border-[#282D37] dark:bg-[#14171C]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                    {customAttribution.resolvedAppName || 'Unattributed'}
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-[#0067C0] dark:text-[#60CDFF]">
                    {customAttribution.confidenceScore}% ·{' '}
                    {customAttribution.classification}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                  {customAttribution.evidenceSummary}
                </div>
                <div className="mt-2.5 space-y-1 border-t border-[#E5E9F0] pt-2.5 text-[11px] dark:border-[#282D37]">
                  {customAttribution.stages
                    .filter((s) => s.matched || s.stage === 4 || s.stage === 5)
                    .map((s) => (
                      <div
                        key={s.stage}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                          Stage {s.stage}: {s.source}
                        </span>
                        <span className="font-mono text-[#171B21] dark:text-[#EEF1F5]">
                          {s.points > 0 ? `+${s.points}` : s.stage === 5 ? customAttribution.classification : '0'}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : (
        /* .NET 8 / WinUI 3 Source Code Explorer */
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[#E2E6EC] bg-white lg:grid-cols-12 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
          <div className="border-b border-[#E5E9F0] bg-[#F8FAFC] lg:col-span-4 lg:border-r lg:border-b-0 dark:border-[#282D37] dark:bg-[#14171C]">
            <div className="border-b border-[#E5E9F0] px-4 py-3 text-xs font-semibold text-[#171B21] dark:border-[#282D37] dark:text-[#EEF1F5]">
              Solution Tree (net8.0-windows10.0.22621.0)
            </div>
            <div className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
              {DOTNET_SOLUTION_FILES.map((file) => {
                const active = file.path === selectedFile.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedFilePath(file.path)}
                    className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-xs transition-colors ${
                      active
                        ? 'bg-white font-medium text-[#0067C0] dark:bg-[#1A1D23] dark:text-[#60CDFF]'
                        : 'text-[#374151] hover:bg-white/70 dark:text-[#CBD5E1] dark:hover:bg-[#1A1D23]/60'
                    }`}
                  >
                    <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-75" />
                    <span className="truncate font-mono text-[11.5px]">
                      {file.path}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col lg:col-span-8">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E9F0] px-5 py-3 dark:border-[#282D37]">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                  {selectedFile.path}
                </div>
                <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                  {selectedFile.description}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleCopyFile(selectedFile.content, selectedFile.path)
                }
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
              >
                {copiedPath === selectedFile.path ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#15803D]" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="max-h-[540px] flex-1 overflow-auto bg-[#F8FAFC] p-5 font-mono text-[11.5px] leading-relaxed text-[#171B21] dark:bg-[#111317] dark:text-[#D8DEE9]">
              {selectedFile.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
