import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowUpDown,
  FolderSymlink,
  Lock,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { InstalledApp } from '../engine/types';
import { formatBytes } from '../engine/pathGuard';

type AppFilter = 'All' | 'OnNVMe' | 'Offloaded' | 'Dormant' | 'MSIX';
type SortKey = 'trueFootprint' | 'installBytes' | 'appDataBytes' | 'lastUsed';

interface AppsAdvisorViewProps {
  apps: InstalledApp[];
  targetDriveLetter: string;
  initialFilter?: string;
  onMoveApp: (app: InstalledApp) => void;
  onCreateCapsule: (app: InstalledApp) => void;
  onUninstallApp: (app: InstalledApp) => void;
}

export const AppsAdvisorView: React.FC<AppsAdvisorViewProps> = ({
  apps,
  targetDriveLetter,
  initialFilter,
  onMoveApp,
  onCreateCapsule,
  onUninstallApp,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<AppFilter>(
    initialFilter === 'Dormant' ||
      initialFilter === 'Offloaded' ||
      initialFilter === 'OnNVMe' ||
      initialFilter === 'MSIX'
      ? initialFilter
      : 'All'
  );
  const [sortKey, setSortKey] = useState<SortKey>('trueFootprint');
  const [confirmUninstallId, setConfirmUninstallId] = useState<string | null>(
    null
  );

  const visibleApps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps
      .filter((app) => app.status !== 'Uninstalled')
      .filter((app) => {
        if (filter === 'OnNVMe') return app.status === 'OnNVMe';
        if (filter === 'Offloaded') return app.status === 'Offloaded';
        if (filter === 'Dormant')
          return app.status === 'OnNVMe' && app.lastUsedDaysAgo >= 90;
        if (filter === 'MSIX') return app.packageKind === 'MSIX';
        return true;
      })
      .filter((app) => {
        if (!q) return true;
        return (
          app.displayName.toLowerCase().includes(q) ||
          app.publisher.toLowerCase().includes(q) ||
          app.installPath.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const footA = a.installBytes + a.programDataBytes + a.appDataBytes;
        const footB = b.installBytes + b.programDataBytes + b.appDataBytes;
        if (sortKey === 'trueFootprint') return footB - footA;
        if (sortKey === 'installBytes') return b.installBytes - a.installBytes;
        if (sortKey === 'appDataBytes') return b.appDataBytes - a.appDataBytes;
        return b.lastUsedDaysAgo - a.lastUsedDaysAgo;
      });
  }, [apps, search, filter, sortKey]);

  const filterTabs: { id: AppFilter; label: string }[] = [
    { id: 'All', label: 'All Apps' },
    { id: 'OnNVMe', label: 'On NVMe' },
    { id: 'Offloaded', label: 'Offloaded' },
    { id: 'Dormant', label: 'Dormant 90d+' },
    { id: 'MSIX', label: 'MSIX Store' },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E6EC] bg-white px-4 py-3 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#5E6775] dark:text-[#9AA4B2]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search app, publisher, or path…"
              className="w-64 rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] py-1.5 pr-3 pl-8 text-xs text-[#171B21] placeholder:text-[#7B8494] focus:border-[#0067C0] focus:bg-white focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5] dark:focus:border-[#60CDFF]"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                    : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <ArrowUpDown className="h-3.5 w-3.5 text-[#5E6775] dark:text-[#9AA4B2]" />
          <label htmlFor="app-sort-select" className="sr-only">
            Sort applications by
          </label>
          <select
            id="app-sort-select"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-lg border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5]"
          >
            <option value="trueFootprint">Sort: True Footprint</option>
            <option value="installBytes">Sort: Install Dir Size</option>
            <option value="appDataBytes">Sort: AppData Size</option>
            <option value="lastUsed">Sort: Dormancy (Days)</option>
          </select>
        </div>
      </div>

      {/* Applications Grid */}
      <div className="overflow-hidden rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E9F0] bg-[#F8FAFC] text-[#5E6775] dark:border-[#282D37] dark:bg-[#14171C] dark:text-[#9AA4B2]">
                <th className="px-5 py-3 font-medium">Application</th>
                <th className="px-4 py-3 font-medium">Status & Activity</th>
                <th className="px-4 py-3 font-medium">
                  True Footprint (Install + ProgramData + AppData)
                </th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
              {visibleApps.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-xs text-[#5E6775] dark:text-[#9AA4B2]"
                  >
                    No installed applications match the current filter.
                  </td>
                </tr>
              ) : (
                visibleApps.map((app) => {
                  const trueFootprint =
                    app.installBytes + app.programDataBytes + app.appDataBytes;
                  const installPct =
                    trueFootprint > 0
                      ? (app.installBytes / trueFootprint) * 100
                      : 0;
                  const progDataPct =
                    trueFootprint > 0
                      ? (app.programDataBytes / trueFootprint) * 100
                      : 0;
                  const appDataPct =
                    trueFootprint > 0
                      ? (app.appDataBytes / trueFootprint) * 100
                      : 0;

                  const isDormant =
                    app.status === 'OnNVMe' && app.lastUsedDaysAgo >= 90;
                  const isConfirmingUninstall = confirmUninstallId === app.id;

                  return (
                    <tr
                      key={app.id}
                      className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
                    >
                      {/* Name + Metadata */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                          {app.displayName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                          <span>{app.publisher}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{app.packageKind}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono">v{app.version}</span>
                          {app.hasActiveCapsule && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="font-medium text-[#0067C0] dark:text-[#60CDFF]">
                                Capsule saved
                              </span>
                            </>
                          )}
                        </div>
                        <div className="mt-1 max-w-sm truncate font-mono text-[11px] text-[#7B8494] dark:text-[#7F8A9A]">
                          {app.status === 'Offloaded' && app.offloadedTargetPath
                            ? `${app.installPath} -> ${app.offloadedTargetPath}`
                            : app.installPath}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        <div
                          className={`font-medium ${
                            app.isKernelProtected
                              ? 'text-[#B91C1C] dark:text-[#F87171]'
                              : app.status === 'Offloaded'
                                ? 'text-[#15803D] dark:text-[#4ADE80]'
                                : isDormant
                                  ? 'text-[#B45309] dark:text-[#FBBF24]'
                                  : 'text-[#171B21] dark:text-[#EEF1F5]'
                          }`}
                        >
                          {app.isKernelProtected
                            ? 'Kernel Protected (PathGuard)'
                            : app.status === 'Offloaded'
                              ? `Offloaded to ${app.offloadedTargetPath?.slice(0, 2) || 'D:'}`
                              : isDormant
                                ? `Dormant · ${app.lastUsedDaysAgo}d`
                                : 'On NVMe (C:)'}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                          {app.lastUsedDaysAgo === 0
                            ? 'Used today'
                            : `Last touched ${app.lastUsedDaysAgo}d ago`}
                        </div>
                        {app.activeLocks.length > 0 && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#B45309] dark:text-[#FBBF24]">
                            <Lock className="h-3 w-3 shrink-0" />
                            <span>
                              {app.activeLocks[0].imageName}
                              {app.activeLocks.length > 1
                                ? ` +${app.activeLocks.length - 1}`
                                : ''}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* True Footprint */}
                      <td className="px-4 py-3.5 align-top min-w-[240px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-sm font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                            {formatBytes(trueFootprint)}
                          </span>
                          <span className="font-mono text-[11px] tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                            {formatBytes(app.installBytes)} ·{' '}
                            {formatBytes(app.programDataBytes)} ·{' '}
                            {formatBytes(app.appDataBytes)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-[#E8ECF2] dark:bg-[#262B35]">
                          <div
                            className="bg-[#0067C0] dark:bg-[#60CDFF]"
                            style={{ width: `${installPct}%` }}
                            title={`Install Dir: ${formatBytes(app.installBytes)}`}
                          />
                          <div
                            className="bg-[#64748B] dark:bg-[#94A3B8]"
                            style={{ width: `${progDataPct}%` }}
                            title={`ProgramData: ${formatBytes(app.programDataBytes)}`}
                          />
                          <div
                            className="bg-[#D97706] dark:bg-[#FBBF24]"
                            style={{ width: `${appDataPct}%` }}
                            title={`AppData: ${formatBytes(app.appDataBytes)}`}
                          />
                        </div>
                        <div className="mt-1 text-[10.5px] text-[#7B8494] dark:text-[#7F8A9A]">
                          Install / ProgramData / AppData
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 align-top text-right">
                        {isConfirmingUninstall ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onUninstallApp(app);
                                setConfirmUninstallId(null);
                              }}
                              className="whitespace-nowrap shrink-0 rounded-md bg-[#B91C1C] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#991B1B]"
                            >
                              Confirm Uninstall
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmUninstallId(null)}
                              className="whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] px-2.5 py-1.5 text-xs font-medium text-[#374151] dark:border-[#323846] dark:text-[#D1D5DB]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {app.status === 'OnNVMe' && (
                              <button
                                type="button"
                                onClick={() => onMoveApp(app)}
                                className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  app.isKernelProtected
                                    ? 'border-[#F5C2C7] bg-[#FDF2F2] text-[#B91C1C] hover:bg-[#FCE4E4] dark:border-[#4A1E24] dark:bg-[#241316] dark:text-[#FCA5A5]'
                                    : 'border-[#D8DEE6] bg-white text-[#171B21] hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#60CDFF] dark:hover:text-[#60CDFF]'
                                }`}
                              >
                                {app.isKernelProtected ? (
                                  <ShieldAlert className="h-3.5 w-3.5" />
                                ) : (
                                  <FolderSymlink className="h-3.5 w-3.5" />
                                )}
                                <span>
                                  {app.isKernelProtected
                                    ? 'Check Guard'
                                    : `Move to ${targetDriveLetter}`}
                                </span>
                              </button>
                            )}

                            {!app.isKernelProtected && (
                              <button
                                type="button"
                                onClick={() => onCreateCapsule(app)}
                                title="Export Portable State Capsule (.tiercapsule)"
                                className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB] dark:hover:bg-[#2A2F3A]"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                <span>Capsule</span>
                              </button>
                            )}

                            {!app.isKernelProtected && (
                              <button
                                type="button"
                                onClick={() => setConfirmUninstallId(app.id)}
                                title="Invoke Windows Native Uninstall"
                                className="inline-flex items-center justify-center rounded-md border border-[#D8DEE6] bg-white p-1.5 text-[#5E6775] transition-colors hover:border-[#F5C2C7] hover:text-[#B91C1C] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#9AA4B2] dark:hover:border-[#4A1E24] dark:hover:text-[#F87171]"
                                aria-label={`Uninstall ${app.displayName}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
