import React from 'react';
import { FolderSymlink, ShieldAlert, Trash2, X } from 'lucide-react';
import { AppDataFolderItem } from '../engine/types';
import { formatBytes } from '../engine/pathGuard';

interface EvidenceDrawerProps {
  folder: AppDataFolderItem | null;
  onClose: () => void;
  onOffloadFolder: (folder: AppDataFolderItem) => void;
  onDeleteOrphan: (folder: AppDataFolderItem) => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  folder,
  onClose,
  onOffloadFolder,
  onDeleteOrphan,
}) => {
  if (!folder) return null;

  const { attribution } = folder;
  const isProtected = attribution.classification === 'Protected';
  const isOrphaned = attribution.classification === 'Orphaned';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-drawer-title"
    >
      <div className="flex h-full w-full max-w-lg flex-col border-l border-[#D8DEE6] bg-white shadow-2xl dark:border-[#2C323D] dark:bg-[#1A1D23]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
          <div className="min-w-0">
            <h2
              id="evidence-drawer-title"
              className="font-display text-base font-semibold text-[#171B21] dark:text-[#EEF1F5]"
            >
              5-Stage Attribution Evidence
            </h2>
            <p className="mt-1 truncate font-mono text-[11.5px] text-[#5E6775] dark:text-[#9AA4B2]">
              {folder.folderPath}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#5E6775] hover:bg-[#F1F4F8] dark:text-[#9AA4B2] dark:hover:bg-[#252A34]"
            aria-label="Close evidence inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-3 divide-x divide-[#E5E9F0] border-b border-[#E5E9F0] bg-[#F8FAFC] dark:divide-[#282D37] dark:border-[#282D37] dark:bg-[#14171C]">
          <div className="px-4 py-3">
            <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
              Confidence
            </div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
              {attribution.confidenceScore}%
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
              Classification
            </div>
            <div
              className={`mt-0.5 text-sm font-semibold ${
                isOrphaned
                  ? 'text-[#B91C1C] dark:text-[#F87171]'
                  : isProtected
                    ? 'text-[#475569] dark:text-[#94A3B8]'
                    : attribution.classification === 'Dormant'
                      ? 'text-[#B45309] dark:text-[#FBBF24]'
                      : 'text-[#15803D] dark:text-[#4ADE80]'
              }`}
            >
              {attribution.classification}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
              Footprint
            </div>
            <div className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
              {formatBytes(folder.sizeBytes)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-xs">
          {/* Resolved Parent Identity */}
          <div className="space-y-1">
            <div className="text-[#5E6775] dark:text-[#9AA4B2]">
              Resolved Application
            </div>
            <div className="text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              {attribution.resolvedAppName || 'Unattributed Directory'}
            </div>
            <div className="text-[#5E6775] dark:text-[#9AA4B2]">
              {attribution.publisher || 'Unknown publisher'} · Untouched{' '}
              <span className="font-mono tabular-nums">
                {folder.lastModifiedDaysAgo}d
              </span>{' '}
              ·{' '}
              <span className="font-mono tabular-nums">
                {folder.fileCount.toLocaleString()}
              </span>{' '}
              files
            </div>
            <div className="pt-1 font-mono text-[11px] text-[#0067C0] dark:text-[#60CDFF]">
              {attribution.evidenceSummary}
            </div>
          </div>

          {folder.isReparsePoint && folder.offloadedTargetPath && (
            <div className="rounded-lg border border-[#D1E7DD] bg-[#F4FBF7] px-3.5 py-2.5 text-[#14532D] dark:border-[#1E3A2A] dark:bg-[#132219] dark:text-[#86EFAC]">
              Active NTFS Junction points transparently to{' '}
              <code className="font-mono">{folder.offloadedTargetPath}</code>
            </div>
          )}

          {/* 5 Stages Breakdown */}
          <div className="space-y-3 border-t border-[#E5E9F0] pt-4 dark:border-[#282D37]">
            <div className="font-semibold text-[#171B21] dark:text-[#EEF1F5]">
              Heuristic Pipeline Trace
            </div>

            <div className="divide-y divide-[#E5E9F0] border-y border-[#E5E9F0] dark:divide-[#282D37] dark:border-[#282D37]">
              {attribution.stages.map((st) => (
                <div key={st.stage} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                      Stage {st.stage}. {st.stageTitle}
                    </span>
                    <span
                      className={`font-mono text-[11px] font-semibold tabular-nums ${
                        st.deferred
                          ? 'text-[#64748B] dark:text-[#94A3B8]'
                          : st.points > 0
                            ? 'text-[#15803D] dark:text-[#4ADE80]'
                            : 'text-[#5E6775] dark:text-[#9AA4B2]'
                      }`}
                    >
                      {st.deferred
                        ? 'Phase 2 Stub (0)'
                        : st.points > 0
                          ? `+${st.points} pts`
                          : st.stage === 5
                            ? attribution.classification
                            : '0 pts'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                    {st.source}
                  </div>
                  <p className="mt-1 leading-relaxed text-[#374151] dark:text-[#CBD5E1]">
                    {st.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {attribution.fuzzyMatch && (
            <div className="rounded-lg bg-[#F3F5F8] px-3.5 py-2.5 dark:bg-[#111317]">
              <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                Jaro-Winkler Normalization Detail
              </div>
              <div className="mt-1 font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                token(&quot;{folder.folderName}&quot;) =&gt; &quot;
                {attribution.fuzzyMatch.normalizedToken}&quot; vs &quot;
                {attribution.fuzzyMatch.matchedTarget}&quot; ={' '}
                <strong className="text-[#0067C0] dark:text-[#60CDFF]">
                  {attribution.fuzzyMatch.similarity.toFixed(3)}
                </strong>
              </div>
            </div>
          )}

          {isProtected && (
            <div className="flex items-start gap-2.5 rounded-lg border border-[#E2E6EC] bg-[#F8FAFC] px-3.5 py-2.5 text-[#475569] dark:border-[#2C323D] dark:bg-[#14171C] dark:text-[#94A3B8]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This directory is on the Protected Whitelist. TierShift prevents offloading GPU shader caches and WebView2 runtimes to avoid frame stutters or OS regressions.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2.5 border-t border-[#E5E9F0] px-6 py-3.5 dark:border-[#282D37]">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {isOrphaned && !folder.isReparsePoint && (
              <button
                type="button"
                onClick={() => {
                  onDeleteOrphan(folder);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#F5C2C7] bg-[#FDF2F2] px-3.5 py-2 text-xs font-medium text-[#B91C1C] hover:bg-[#FCE4E4] dark:border-[#4A1E24] dark:bg-[#241316] dark:text-[#FCA5A5]"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Remove Orphan</span>
              </button>
            )}

            {!folder.isReparsePoint && (
              <button
                type="button"
                disabled={isProtected}
                onClick={() => {
                  onClose();
                  onOffloadFolder(folder);
                }}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white hover:bg-[#0055A0] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#60CDFF] dark:text-[#0F172A]"
              >
                <FolderSymlink className="h-3.5 w-3.5" />
                <span>Offload via Junction</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
