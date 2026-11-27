import React, { useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Download,
  FolderSymlink,
  Plus,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  MoveLedgerRow,
  StateCapsule,
  TransactionJournalRow,
} from '../engine/types';
import { formatBytes } from '../engine/pathGuard';
import { createZipBlob, triggerBlobDownload } from '../engine/zipBuilder';

interface CapsulesLedgerViewProps {
  ledger: MoveLedgerRow[];
  journal: TransactionJournalRow[];
  capsules: StateCapsule[];
  lastSweepReport: string | null;
  onRollbackLedgerRow: (row: MoveLedgerRow) => void;
  onSweepOrphanedJunctions: () => void;
  onOpenCreateCapsule: () => void;
  onOpenRestoreCapsule: (capsule: StateCapsule) => void;
}

export const CapsulesLedgerView: React.FC<CapsulesLedgerViewProps> = ({
  ledger,
  journal,
  capsules,
  lastSweepReport,
  onRollbackLedgerRow,
  onSweepOrphanedJunctions,
  onOpenCreateCapsule,
  onOpenRestoreCapsule,
}) => {
  const [subTab, setSubTab] = useState<'ledger' | 'capsules'>('ledger');
  const [expandedMoveId, setExpandedMoveId] = useState<string | null>(null);
  const [expandedCapsuleId, setExpandedCapsuleId] = useState<string | null>(
    null
  );

  const pendingOrphanSweeps = ledger.filter(
    (l) => l.status === 'Active' && l.sourceJunctionMissing && l.targetDirEmpty
  ).length;

  const handleDownloadCapsuleArchive = (capsule: StateCapsule) => {
    const manifest = {
      schema: 'TierShift.StateCapsule.v1',
      id: capsule.id,
      appDisplayName: capsule.appDisplayName,
      publisher: capsule.publisher,
      createdAtUtc: capsule.createdAtUtc,
      cachesExcluded: capsule.cachesExcluded,
      includedPaths: capsule.includedPaths,
      registryExports: capsule.registryExports,
    };
    const blob = createZipBlob([
      {
        path: 'manifest.json',
        content: JSON.stringify(manifest, null, 2),
      },
      {
        path: 'registry/state_export.reg',
        content: capsule.regFilePreview,
      },
      {
        path: 'README.txt',
        content: `TierShift Portable State Capsule\nApplication: ${capsule.appDisplayName}\nRestore via TierShift -> Capsules & Ledger -> Restore Redirected.\nTarget redirection root: D:\\TierShift\\State\\${capsule.appDisplayName}\n`,
      },
    ]);
    triggerBlobDownload(blob, capsule.fileName);
  };

  return (
    <div className="space-y-4">
      {/* Segmented View Switch & Primary Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E6EC] bg-white px-4 py-3 dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
        <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
          <button
            type="button"
            onClick={() => setSubTab('ledger')}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              subTab === 'ledger'
                ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
            }`}
          >
            Active Junctions & MoveLedger ({ledger.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('capsules')}
            className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              subTab === 'capsules'
                ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
            }`}
          >
            Portable State Capsules ({capsules.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'ledger' ? (
            <button
              type="button"
              onClick={onSweepOrphanedJunctions}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                Sweep Orphaned Junctions
                {pendingOrphanSweeps > 0 ? ` (${pendingOrphanSweeps})` : ''}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCreateCapsule}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create State Capsule</span>
            </button>
          )}
        </div>
      </div>

      {/* Sweep Report Banner */}
      {subTab === 'ledger' && lastSweepReport && (
        <div className="rounded-xl border border-[#D1E7DD] bg-[#F4FBF7] px-4 py-3 text-xs text-[#14532D] dark:border-[#1E3A2A] dark:bg-[#132219] dark:text-[#86EFAC]">
          <strong>JunctionSweepService:</strong> {lastSweepReport}
        </div>
      )}

      {/* TAB 1: MoveLedger & TransactionJournal */}
      {subTab === 'ledger' && (
        <div className="overflow-hidden rounded-xl border border-[#E2E6EC] bg-white dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E5E9F0] bg-[#F8FAFC] text-[#5E6775] dark:border-[#282D37] dark:bg-[#14171C] dark:text-[#9AA4B2]">
                  <th className="w-8 px-4 py-3" aria-label="Expand journal" />
                  <th className="px-3 py-3 font-medium">
                    Entry & Reparse Route
                  </th>
                  <th className="px-4 py-3 font-medium">Move Type</th>
                  <th className="px-4 py-3 font-medium">Ledger Status</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Bytes Moved
                  </th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
                {ledger.map((row) => {
                  const isExpanded = expandedMoveId === row.id;
                  const steps = journal
                    .filter((j) => j.moveId === row.id)
                    .sort((a, b) => a.stepOrder - b.stepOrder);
                  const isOrphanedTarget =
                    row.status === 'Active' &&
                    row.sourceJunctionMissing &&
                    row.targetDirEmpty;

                  return (
                    <React.Fragment key={row.id}>
                      <tr className="transition-colors hover:bg-[#F8FAFC] dark:hover:bg-[#20242C]">
                        <td className="px-4 py-3.5 align-top">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedMoveId(isExpanded ? null : row.id)
                            }
                            className="rounded p-0.5 text-[#5E6775] hover:bg-[#E8ECF2] dark:text-[#9AA4B2] dark:hover:bg-[#282D37]"
                            aria-label={`Toggle transaction journal for ${row.appDisplayName}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>

                        <td className="px-3 py-3.5 align-top">
                          <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                            {row.appDisplayName}
                          </div>
                          <div className="mt-1 space-y-0.5 font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                            <div className="max-w-lg truncate">
                              C: {row.sourcePath}
                            </div>
                            <div className="max-w-lg truncate text-[#0067C0] dark:text-[#60CDFF]">
                              -&gt; {row.targetPath}
                            </div>
                          </div>
                          <div className="mt-1 text-[10.5px] text-[#7B8494] dark:text-[#7F8A9A]">
                            ID {row.id.slice(0, 8)} ·{' '}
                            {new Date(row.createdAtUtc).toLocaleDateString()} ·{' '}
                            {steps.length} journal step
                            {steps.length === 1 ? '' : 's'}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top whitespace-nowrap font-mono text-[11.5px] text-[#374151] dark:text-[#CBD5E1]">
                          {row.moveType}
                        </td>

                        <td className="px-4 py-3.5 align-top whitespace-nowrap">
                          {isOrphanedTarget ? (
                            <div>
                              <div className="font-medium text-[#B45309] dark:text-[#FBBF24]">
                                Orphaned Target Shell
                              </div>
                              <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                                C: junction removed by Uninstaller
                              </div>
                            </div>
                          ) : (
                            <span
                              className={`font-medium ${
                                row.status === 'Active'
                                  ? 'text-[#15803D] dark:text-[#4ADE80]'
                                  : row.status === 'RolledBack'
                                    ? 'text-[#5E6775] dark:text-[#9AA4B2]'
                                    : row.status === 'OrphanedTargetCleaned'
                                      ? 'text-[#0067C0] dark:text-[#60CDFF]'
                                      : 'text-[#B91C1C] dark:text-[#F87171]'
                              }`}
                            >
                              {row.status}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top text-right font-mono font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                          {formatBytes(row.bytesMoved)}
                        </td>

                        <td className="px-5 py-3.5 align-top text-right">
                          {row.status === 'Active' && !isOrphanedTarget ? (
                            <button
                              type="button"
                              onClick={() => onRollbackLedgerRow(row)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:border-[#0067C0] hover:text-[#0067C0] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5] dark:hover:border-[#60CDFF] dark:hover:text-[#60CDFF]"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Restore to NVMe</span>
                            </button>
                          ) : isOrphanedTarget ? (
                            <button
                              type="button"
                              onClick={onSweepOrphanedJunctions}
                              className="whitespace-nowrap shrink-0 rounded-md border border-[#F5D0A9] bg-[#FFFBEB] px-3 py-1.5 text-xs font-medium text-[#B45309] hover:bg-[#FEF3C7] dark:border-[#4A3818] dark:bg-[#241E11] dark:text-[#FBBF24]"
                            >
                              Clean Target
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#7B8494] dark:text-[#64748B]">
                              Completed
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#F8FAFC] dark:bg-[#14171C]">
                          <td colSpan={6} className="px-10 py-3.5">
                            <div className="text-[11px] font-semibold text-[#374151] dark:text-[#CBD5E1]">
                              SQLite TransactionJournal Steps (MoveId: {row.id})
                            </div>
                            {steps.length === 0 ? (
                              <div className="mt-1.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                                No inverse journal steps recorded for this entry.
                              </div>
                            ) : (
                              <div className="mt-2 space-y-1.5">
                                {steps.map((st) => (
                                  <div
                                    key={st.id}
                                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E5E9F0] pb-1.5 font-mono text-[11px] last:border-b-0 dark:border-[#242933]"
                                  >
                                    <span className="font-medium text-[#0067C0] dark:text-[#60CDFF]">
                                      #{st.stepOrder} {st.actionType}
                                    </span>
                                    <span className="max-w-2xl truncate text-[#5E6775] dark:text-[#9AA4B2]">
                                      {st.payloadJson}
                                    </span>
                                    <span className="text-[#15803D] dark:text-[#4ADE80]">
                                      {st.completed ? 'Committed' : 'Pending'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Portable State Capsules */}
      {subTab === 'capsules' && (
        <div className="divide-y divide-[#E5E9F0] overflow-hidden rounded-xl border border-[#E2E6EC] bg-white dark:divide-[#282D37] dark:border-[#2A2F3A] dark:bg-[#1A1D23]">
          {capsules.length === 0 ? (
            <div className="px-6 py-12 text-center text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              <p>No portable state capsules created yet.</p>
              <button
                type="button"
                onClick={onOpenCreateCapsule}
                className="mt-3 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white"
              >
                Create First Capsule
              </button>
            </div>
          ) : (
            capsules.map((cap) => {
              const showReg = expandedCapsuleId === cap.id;
              return (
                <div key={cap.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Archive className="h-4 w-4 shrink-0 text-[#0067C0] dark:text-[#60CDFF]" />
                        <span className="font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                          {cap.appDisplayName}
                        </span>
                        <span className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                          · {cap.publisher}
                        </span>
                      </div>
                      <div className="font-mono text-[11.5px] text-[#5E6775] dark:text-[#9AA4B2]">
                        {cap.archivePath}
                      </div>
                      <div className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                        <span className="font-mono tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                          {formatBytes(cap.archiveBytes)}
                        </span>{' '}
                        compressed ({formatBytes(cap.uncompressedBytes)} state)
                        <span aria-hidden="true"> · </span>
                        <span>
                          {cap.cachesExcluded
                            ? 'Caches excluded'
                            : 'Full state included'}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {cap.registryExports.length} registry export
                          {cap.registryExports.length === 1 ? '' : 's'}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span
                          className={
                            cap.status === 'RestoredRedirected'
                              ? 'font-medium text-[#15803D] dark:text-[#4ADE80]'
                              : 'text-[#0067C0] dark:text-[#60CDFF]'
                          }
                        >
                          {cap.status === 'RestoredRedirected'
                            ? `Redirected -> ${cap.restoredRedirectedPath}`
                            : 'Ready for Redirected Restore'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCapsuleId(showReg ? null : cap.id)
                        }
                        className="whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
                      >
                        {showReg ? 'Hide .reg Preview' : 'Inspect .reg'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadCapsuleArchive(cap)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Download Archive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenRestoreCapsule(cap)}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md bg-[#0067C0] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A]"
                      >
                        <FolderSymlink className="h-3.5 w-3.5" />
                        <span>Restore Redirected</span>
                      </button>
                    </div>
                  </div>

                  {showReg && (
                    <div className="mt-4 rounded-lg border border-[#E5E9F0] bg-[#F8FAFC] p-3.5 dark:border-[#282D37] dark:bg-[#111317]">
                      <div className="mb-2 text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                        Bundled Registry Export (registry/state_export.reg)
                      </div>
                      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-[#171B21] dark:text-[#CBD5E1]">
                        {cap.regFilePreview}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
