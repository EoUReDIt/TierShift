import React, { useMemo, useState } from 'react';
import {
  Eye,
  FolderSymlink,
  Lock,
  Search,
  Trash2,
} from 'lucide-react';
import { AppDataFolderItem, AppDataRootScope } from '../engine/types';
import { formatBytes } from '../engine/pathGuard';

type FolderFilter =
  | 'All'
  | 'Orphaned'
  | 'Offloadable'
  | 'Protected'
  | 'Offloaded';

interface AppDataInspectorViewProps {
  folders: AppDataFolderItem[];
  initialFilter?: string;
  onInspectEvidence: (folder: AppDataFolderItem) => void;
  onOffloadFolder: (folder: AppDataFolderItem) => void;
  onDeleteOrphan: (folder: AppDataFolderItem) => void;
}

export const AppDataInspectorView: React.FC<AppDataInspectorViewProps> = ({
  folders,
  initialFilter,
  onInspectEvidence,
  onOffloadFolder,
  onDeleteOrphan,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FolderFilter>(
    initialFilter === 'Orphaned' ||
      initialFilter === 'Offloadable' ||
      initialFilter === 'Protected' ||
      initialFilter === 'Offloaded'
      ? initialFilter
      : 'All'
  );
  const [scope, setScope] = useState<'All' | AppDataRootScope>('All');

  const visibleFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return folders
      .filter((f) => (scope === 'All' ? true : f.rootScope === scope))
      .filter((f) => {
        if (filter === 'Orphaned')
          return f.attribution.classification === 'Orphaned' && !f.isReparsePoint;
        if (filter === 'Protected')
          return f.attribution.classification === 'Protected';
        if (filter === 'Offloaded') return f.isReparsePoint;
        if (filter === 'Offloadable')
          return (
            !f.isReparsePoint &&
            f.attribution.classification !== 'Protected' &&
            f.attribution.classification !== 'Orphaned'
          );
        return true;
      })
      .filter((f) => {
        if (!q) return true;
        return (
          f.folderPath.toLowerCase().includes(q) ||
          (f.attribution.resolvedAppName || '').toLowerCase().includes(q) ||
          f.attribution.evidenceSummary.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  }, [folders, search, filter, scope]);

  const filterTabs: { id: FolderFilter; label: string }[] = [
    { id: 'All', label: 'All Folders' },
    { id: 'Orphaned', label: 'Orphaned' },
    { id: 'Offloadable', label: 'Offloadable' },
    { id: 'Protected', label: 'Protected' },
    { id: 'Offloaded', label: 'Offloaded' },
  ];

  const scopeOptions: ('All' | AppDataRootScope)[] = [
    'All',
    'Local',
    'LocalLow',
    'Roaming',
    'ProgramData',
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
              placeholder="Search folder, GUID, or app…"
              className="w-60 rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] py-1.5 pr-3 pl-8 text-xs text-[#171B21] placeholder:text-[#7B8494] focus:border-[#0067C0] focus:bg-white focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5] dark:focus:border-[#60CDFF]"
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

        <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
          {scopeOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                scope === s
                  ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                  : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
              }`}
            >
              {s === 'All' ? 'All Roots' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Attribution Cache Grid */}
      <div className="overflow-hidden rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5E9F0] bg-[#F8FAFC] text-[#5E6775] dark:border-[#282D37] dark:bg-[#14171C] dark:text-[#9AA4B2]">
                <th className="px-5 py-3 font-medium">Directory & Scope</th>
                <th className="px-4 py-3 font-medium">
                  Attribution & Evidence
                </th>
                <th className="px-4 py-3 font-medium">Classification</th>
                <th className="px-4 py-3 text-right font-medium">Size</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
              {visibleFolders.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-xs text-[#5E6775] dark:text-[#9AA4B2]"
                  >
                    No AppData or ProgramData directories match this filter.
                  </td>
                </tr>
              ) : (
                visibleFolders.map((folder) => {
                  const { attribution } = folder;
                  const isProtected = attribution.classification === 'Protected';
                  const isOrphaned = attribution.classification === 'Orphaned';

                  return (
                    <tr
                      key={folder.id}
                      className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]"
                    >
                      {/* Path */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono text-xs font-medium text-[#171B21] dark:text-[#EEF1F5]">
                          {folder.folderName}
                        </div>
                        <div className="mt-0.5 max-w-md truncate font-mono text-[11px] text-[#7B8494] dark:text-[#7F8A9A]">
                          {folder.folderPath}
                        </div>
                        <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                          <span>{folder.rootScope}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">
                            {folder.fileCount.toLocaleString()} files
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">
                            Untouched {folder.lastModifiedDaysAgo}d
                          </span>
                          {folder.activeLocks.length > 0 && (
                            <>
                              <span aria-hidden="true"> · </span>
                              <span className="inline-flex items-center gap-1 text-[#B45309] dark:text-[#FBBF24]">
                                <Lock className="h-3 w-3" />
                                {folder.activeLocks[0].imageName}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Attribution */}
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                          <span className="font-mono tabular-nums text-[#0067C0] dark:text-[#60CDFF]">
                            {attribution.confidenceScore}%
                          </span>
                          <span aria-hidden="true" className="text-[#9AA4B2]">
                            {' '}
                            ·{' '}
                          </span>
                          <span>
                            {attribution.resolvedAppName || 'Unattributed Folder'}
                          </span>
                        </div>
                        <div className="mt-0.5 max-w-xs truncate text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                          {attribution.evidenceSummary}
                        </div>
                      </td>

                      {/* Classification */}
                      <td className="px-4 py-3.5 align-top whitespace-nowrap">
                        {folder.isReparsePoint ? (
                          <div>
                            <div className="font-medium text-[#15803D] dark:text-[#4ADE80]">
                              Offloaded (NTFS Junction)
                            </div>
                            <div className="mt-0.5 max-w-[180px] truncate font-mono text-[10.5px] text-[#5E6775] dark:text-[#9AA4B2]">
                              {folder.offloadedTargetPath}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`font-medium ${
                              isOrphaned
                                ? 'text-[#B91C1C] dark:text-[#F87171]'
                                : isProtected
                                  ? 'text-[#475569] dark:text-[#94A3B8]'
                                  : attribution.classification === 'Dormant'
                                    ? 'text-[#B45309] dark:text-[#FBBF24]'
                                    : attribution.classification === 'Unknown'
                                      ? 'text-[#64748B] dark:text-[#94A3B8]'
                                      : 'text-[#15803D] dark:text-[#4ADE80]'
                            }`}
                          >
                            {attribution.classification}
                          </div>
                        )}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3.5 align-top text-right font-mono font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                        {formatBytes(folder.sizeBytes)}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectEvidence(folder)}
                            className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB] dark:hover:bg-[#2A2F3A]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect Evidence</span>
                          </button>

                          {!folder.isReparsePoint && !isProtected && (
                            <button
                              type="button"
                              onClick={() => onOffloadFolder(folder)}
                              className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#60CDFF] dark:hover:text-[#60CDFF]"
                            >
                              <FolderSymlink className="h-3.5 w-3.5" />
                              <span>Offload</span>
                            </button>
                          )}

                          {isOrphaned && !folder.isReparsePoint && (
                            <button
                              type="button"
                              onClick={() => onDeleteOrphan(folder)}
                              title="Remove verified orphaned folder"
                              className="inline-flex items-center justify-center rounded-md border border-[#F5C2C7] bg-[#FDF2F2] p-1.5 text-[#B91C1C] transition-colors hover:bg-[#FCE4E4] dark:border-[#4A1E24] dark:bg-[#241316] dark:text-[#FCA5A5]"
                              aria-label={`Remove orphan ${folder.folderName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
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
