import React from 'react';
import {
  ArrowRight,
  FolderSymlink,
  HardDrive,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  AppDataFolderItem,
  DriveVolume,
  InstalledApp,
  MoveLedgerRow,
} from '../engine/types';
import { formatBytes } from '../engine/pathGuard';
import { StorageUsageDonutChart } from './StorageUsageDonutChart';

export type NavSection =
  | 'dashboard'
  | 'apps'
  | 'appdata'
  | 'sorter'
  | 'ledger'
  | 'workbench';

interface DashboardViewProps {
  drives: DriveVolume[];
  selectedTargetLetter: string;
  onSelectTargetLetter: (letter: string) => void;
  apps: InstalledApp[];
  folders: AppDataFolderItem[];
  ledger: MoveLedgerRow[];
  isScanning: boolean;
  lastScannedLabel: string;
  onQuickScan: () => void;
  onNavigate: (section: NavSection, presetFilter?: string) => void;
  onStartAppMove: (app: InstalledApp) => void;
  onStartFolderOffload: (folder: AppDataFolderItem) => void;
  onInspectFolder: (folder: AppDataFolderItem) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  drives,
  selectedTargetLetter,
  onSelectTargetLetter,
  apps,
  folders,
  ledger,
  isScanning,
  lastScannedLabel,
  onQuickScan,
  onNavigate,
  onStartAppMove,
  onStartFolderOffload,
  onInspectFolder,
}) => {
  const nvmeDrive = drives.find((d) => d.letter === 'C:') || drives[0];
  const targetDrives = drives.filter((d) => d.letter !== 'C:');
  const activeTarget =
    targetDrives.find((d) => d.letter === selectedTargetLetter) ||
    targetDrives[0];

  const nvmeUsedPct = Math.min(
    100,
    (nvmeDrive.usedBytes / nvmeDrive.totalBytes) * 100
  );
  const nvmeFreeBytes = Math.max(0, nvmeDrive.totalBytes - nvmeDrive.usedBytes);

  const targetUsedPct = Math.min(
    100,
    (activeTarget.usedBytes / activeTarget.totalBytes) * 100
  );
  const targetFreeBytes = Math.max(
    0,
    activeTarget.totalBytes - activeTarget.usedBytes
  );
  const targetCompatible =
    activeTarget.fileSystem === 'NTFS' && activeTarget.driveType === 'Fixed';

  // Reclaimable KPI calculations
  const dormantApps = apps.filter(
    (a) =>
      a.status === 'OnNVMe' &&
      !a.isKernelProtected &&
      a.lastUsedDaysAgo >= 90 &&
      a.installBytes + a.programDataBytes + a.appDataBytes >=
        500 * 1024 * 1024
  );
  const dormantBytes = dormantApps.reduce(
    (sum, a) => sum + a.installBytes + a.programDataBytes + a.appDataBytes,
    0
  );

  const orphanedFolders = folders.filter(
    (f) => f.attribution.classification === 'Orphaned' && !f.isReparsePoint
  );
  const orphanedBytes = orphanedFolders.reduce((sum, f) => sum + f.sizeBytes, 0);

  const offloadableAppData = folders.filter(
    (f) =>
      !f.isReparsePoint &&
      f.attribution.classification !== 'Protected' &&
      f.attribution.classification !== 'Orphaned' &&
      f.attribution.classification !== 'Unknown'
  );
  const appDataBloatBytes = offloadableAppData.reduce(
    (sum, f) => sum + f.sizeBytes,
    0
  );

  const totalReclaimableBytes =
    dormantBytes + orphanedBytes + appDataBloatBytes;

  const activeJunctionCount = ledger.filter((l) => l.status === 'Active').length;
  const orphanedSweepPending = ledger.filter(
    (l) => l.status === 'Active' && l.sourceJunctionMissing && l.targetDirEmpty
  ).length;

  // D3 Donut chart totals: Active (on NVMe) vs. Offloaded (cold storage) vs. Orphaned (leftovers)
  const activeAppsOnNvme = apps.filter((a) => a.status === 'OnNVMe');
  const activeNonOrphanFolders = folders.filter(
    (f) => !f.isReparsePoint && f.attribution.classification !== 'Orphaned'
  );
  const activeStorageBytes =
    activeAppsOnNvme.reduce(
      (sum, a) => sum + a.installBytes + a.programDataBytes,
      0
    ) + activeNonOrphanFolders.reduce((sum, f) => sum + f.sizeBytes, 0);
  const activeStorageCount =
    activeAppsOnNvme.length + activeNonOrphanFolders.length;

  const activeLedgerMoves = ledger.filter(
    (l) => l.status === 'Active' && !(l.sourceJunctionMissing && l.targetDirEmpty)
  );
  const offloadedStorageBytes = activeLedgerMoves.reduce(
    (sum, l) => sum + l.bytesMoved,
    0
  );
  const offloadedStorageCount = activeLedgerMoves.length;

  // Top 5 priority actions ranked by reclaimable size
  type RecommendationItem =
    | {
        kind: 'app';
        id: string;
        title: string;
        subtitle: string;
        category: string;
        sizeBytes: number;
        app: InstalledApp;
      }
    | {
        kind: 'folder';
        id: string;
        title: string;
        subtitle: string;
        category: string;
        sizeBytes: number;
        folder: AppDataFolderItem;
      };

  const recommendations: RecommendationItem[] = [
    ...dormantApps.map((a) => ({
      kind: 'app' as const,
      id: a.id,
      title: a.displayName,
      subtitle: `${a.packageKind} · Dormant ${a.lastUsedDaysAgo}d · ${a.installPath}`,
      category: a.packageKind === 'MSIX' ? 'Dormant MSIX' : 'Dormant Win32',
      sizeBytes: a.installBytes + a.programDataBytes + a.appDataBytes,
      app: a,
    })),
    ...orphanedFolders.map((f) => ({
      kind: 'folder' as const,
      id: f.id,
      title: f.attribution.resolvedAppName || f.folderName,
      subtitle: `Orphaned · ${f.attribution.confidenceScore}% confidence · Untouched ${f.lastModifiedDaysAgo}d`,
      category: 'Orphaned Leftover',
      sizeBytes: f.sizeBytes,
      folder: f,
    })),
    ...offloadableAppData
      .filter((f) => f.sizeBytes >= 4 * 1024 * 1024 * 1024)
      .map((f) => ({
        kind: 'folder' as const,
        id: f.id,
        title: `${f.attribution.resolvedAppName || f.folderName} (${f.rootScope})`,
        subtitle: `${f.folderPath}`,
        category: 'AppData Bloat',
        sizeBytes: f.sizeBytes,
        folder: f,
      })),
  ]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Primary Focal Anchor: NVMe vs Cold HDD Storage Tiers */}
      <section className="rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
          <div>
            <h2 className="font-display text-base font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              Storage Tier Capacity
            </h2>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              Hot NVMe pressure against cold tier destination · Last scanned{' '}
              {lastScannedLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
              {targetDrives.map((d) => {
                const selected = d.letter === activeTarget.letter;
                return (
                  <button
                    key={d.letter}
                    type="button"
                    onClick={() => onSelectTargetLetter(d.letter)}
                    className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                        : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
                    }`}
                  >
                    Target {d.letter} ({d.fileSystem})
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onQuickScan}
              disabled={isScanning}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] disabled:opacity-60 dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`}
              />
              <span>{isScanning ? 'Scanning…' : 'Quick Scan'}</span>
            </button>
          </div>
        </div>

        {/* Side-by-side storage tier bars separated by hairline divider */}
        <div className="grid grid-cols-1 divide-y divide-[#E5E9F0] lg:grid-cols-2 lg:divide-x lg:divide-y-0 dark:divide-[#282D37]">
          {/* Hot Tier C: NVMe */}
          <div className="p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-[#0067C0] dark:text-[#60CDFF]" />
                  <span className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                    {nvmeDrive.letter} {nvmeDrive.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                  {nvmeDrive.model} · {nvmeDrive.fileSystem} · Primary Hot Tier
                </p>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono text-lg font-semibold tabular-nums ${
                    nvmeUsedPct >= 80
                      ? 'text-[#B45309] dark:text-[#FBBF24]'
                      : 'text-[#171B21] dark:text-[#EEF1F5]'
                  }`}
                >
                  {nvmeUsedPct.toFixed(1)}%
                </div>
                <div className="font-mono text-xs tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                  {formatBytes(nvmeFreeBytes)} free
                </div>
              </div>
            </div>

            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#E8ECF2] dark:bg-[#262B35]">
              <div
                className={`h-full transition-all duration-300 ${
                  nvmeUsedPct >= 85
                    ? 'bg-[#C2410C] dark:bg-[#FB923C]'
                    : 'bg-[#0067C0] dark:bg-[#60CDFF]'
                }`}
                style={{ width: `${nvmeUsedPct}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              <span className="font-mono tabular-nums">
                {formatBytes(nvmeDrive.usedBytes)} used of{' '}
                {formatBytes(nvmeDrive.totalBytes)}
              </span>
              <span className="font-medium text-[#0067C0] dark:text-[#60CDFF]">
                {formatBytes(totalReclaimableBytes)} reclaimable
              </span>
            </div>
          </div>

          {/* Cold Tier Target Drive */}
          <div className="p-6">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-[#5E6775] dark:text-[#9AA4B2]" />
                  <span className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                    {activeTarget.letter} {activeTarget.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                  {activeTarget.model} · {activeTarget.fileSystem} ·{' '}
                  {activeTarget.driveType} Disk
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-lg font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                  {targetUsedPct.toFixed(1)}%
                </div>
                <div className="font-mono text-xs tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                  {formatBytes(targetFreeBytes)} free
                </div>
              </div>
            </div>

            <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#E8ECF2] dark:bg-[#262B35]">
              <div
                className="h-full bg-[#334155] transition-all duration-300 dark:bg-[#64748B]"
                style={{ width: `${targetUsedPct}%` }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="font-mono tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                {formatBytes(activeTarget.usedBytes)} used ·{' '}
                {formatBytes(activeTarget.offloadedBytes)} managed by TierShift
              </span>
              {targetCompatible ? (
                <span className="font-medium text-[#15803D] dark:text-[#4ADE80]">
                  NTFS Junction Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-[#B91C1C] dark:text-[#F87171]">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>PathGuard Blocked ({activeTarget.fileSystem})</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Reclaimable Space KPI Strip (Single Elevation, Hairline Dividers) */}
      <section className="grid grid-cols-1 divide-y divide-[#E5E9F0] rounded-xl border border-[#E2E6EC] bg-white md:grid-cols-4 md:divide-x md:divide-y-0 dark:divide-[#282D37] dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <button
          type="button"
          onClick={() => onNavigate('apps', 'Dormant')}
          className="group p-5 text-left transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
        >
          <div className="text-xs font-medium text-[#5E6775] dark:text-[#9AA4B2]">
            Dormant Applications
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
            {formatBytes(dormantBytes)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#B45309] dark:text-[#FBBF24]">
            <span>{dormantApps.length} apps untouched &ge; 90d</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('appdata', 'Orphaned')}
          className="group p-5 text-left transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
        >
          <div className="text-xs font-medium text-[#5E6775] dark:text-[#9AA4B2]">
            Orphaned Leftovers
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
            {formatBytes(orphanedBytes)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#B91C1C] dark:text-[#F87171]">
            <span>{orphanedFolders.length} uninstalled app folders</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('appdata', 'Offloadable')}
          className="group p-5 text-left transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
        >
          <div className="text-xs font-medium text-[#5E6775] dark:text-[#9AA4B2]">
            Offloadable AppData
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
            {formatBytes(appDataBloatBytes)}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#0067C0] dark:text-[#60CDFF]">
            <span>{offloadableAppData.length} safe junction candidates</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('ledger')}
          className="group p-5 text-left transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
        >
          <div className="text-xs font-medium text-[#5E6775] dark:text-[#9AA4B2]">
            Active Ledger & Sweep
          </div>
          <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
            {activeJunctionCount}{' '}
            <span className="font-sans text-sm font-normal text-[#5E6775] dark:text-[#9AA4B2]">
              active
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-[#15803D] dark:text-[#4ADE80]">
            <span>
              {orphanedSweepPending > 0
                ? `${orphanedSweepPending} empty D: target to sweep`
                : 'All junctions healthy'}
            </span>
            <ArrowRight className="h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </div>
        </button>
      </section>

      {/* D3 Storage Usage Breakdown Donut (Active vs. Offloaded vs. Orphaned) */}
      <StorageUsageDonutChart
        activeBytes={activeStorageBytes}
        activeCount={activeStorageCount}
        offloadedBytes={offloadedStorageBytes}
        offloadedCount={offloadedStorageCount}
        orphanedBytes={orphanedBytes}
        orphanedCount={orphanedFolders.length}
        onNavigate={onNavigate}
      />

      {/* Priority Reclaim Queue */}
      <section className="rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="flex items-center justify-between border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              Highest-Impact Reclaim Opportunities
            </h3>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              Ranked by NVMe bytes recoverable via safe NTFS junctions, native MSIX volume moves, or orphan removal
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('apps')}
            className="whitespace-nowrap shrink-0 text-xs font-medium text-[#0067C0] hover:underline dark:text-[#60CDFF]"
          >
            View all applications
          </button>
        </div>

        {recommendations.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            All priority reclaim candidates have been offloaded or cleaned.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E9F0] text-[#5E6775] dark:border-[#282D37] dark:text-[#9AA4B2]">
                  <th className="px-6 py-2.5 font-medium">Candidate</th>
                  <th className="px-4 py-2.5 font-medium">Advisor Signal</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Recoverable
                  </th>
                  <th className="px-6 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
                {recommendations.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
                  >
                    <td className="px-6 py-3">
                      <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                        {item.title}
                      </div>
                      <div className="mt-0.5 max-w-md truncate font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                        {item.subtitle}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          item.category === 'Orphaned Leftover'
                            ? 'text-[#B91C1C] dark:text-[#F87171]'
                            : item.category.startsWith('Dormant')
                              ? 'text-[#B45309] dark:text-[#FBBF24]'
                              : 'text-[#0067C0] dark:text-[#60CDFF]'
                        }`}
                      >
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                      {formatBytes(item.sizeBytes)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {item.kind === 'app' ? (
                        <button
                          type="button"
                          onClick={() => onStartAppMove(item.app)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#60CDFF] dark:hover:text-[#60CDFF]"
                        >
                          <FolderSymlink className="h-3.5 w-3.5" />
                          <span>Move to {activeTarget.letter}</span>
                        </button>
                      ) : item.category === 'Orphaned Leftover' ? (
                        <button
                          type="button"
                          onClick={() => onInspectFolder(item.folder)}
                          className="whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:border-[#B91C1C] hover:text-[#B91C1C] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#F87171] dark:hover:text-[#F87171]"
                        >
                          Inspect Evidence
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStartFolderOffload(item.folder)}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#60CDFF] dark:hover:text-[#60CDFF]"
                        >
                          <FolderSymlink className="h-3.5 w-3.5" />
                          <span>Offload Junction</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
