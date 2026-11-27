import React, { useState } from 'react';
import { Archive, Check, FolderSymlink, X } from 'lucide-react';
import { InstalledApp, StateCapsule } from '../engine/types';
import { formatBytes } from '../engine/pathGuard';

interface CreateCapsuleModalProps {
  mode: 'create';
  apps: InstalledApp[];
  preselectedAppId?: string;
  onClose: () => void;
  onCreateCapsule: (app: InstalledApp, excludeCaches: boolean) => void;
}

interface RestoreCapsuleModalProps {
  mode: 'restore';
  capsule: StateCapsule;
  onClose: () => void;
  onRestoreRedirected: (capsule: StateCapsule, targetRoot: string) => void;
}

export type CapsuleModalProps =
  | CreateCapsuleModalProps
  | RestoreCapsuleModalProps;

export const CapsuleModal: React.FC<CapsuleModalProps> = (props) => {
  const [selectedAppId, setSelectedAppId] = useState(
    props.mode === 'create'
      ? props.preselectedAppId || props.apps[0]?.id || ''
      : ''
  );
  const [excludeCaches, setExcludeCaches] = useState(true);
  const [restoringStep, setRestoringStep] = useState<number>(0);

  if (props.mode === 'create') {
    const selectedApp =
      props.apps.find((a) => a.id === selectedAppId) || props.apps[0];
    if (!selectedApp) return null;

    const rawStateBytes =
      selectedApp.programDataBytes + selectedApp.appDataBytes;
    const effectiveBytes = excludeCaches
      ? Math.max(180 * 1024 * 1024, Math.round(rawStateBytes * 0.28))
      : Math.max(240 * 1024 * 1024, rawStateBytes);

    const dateStamp = new Date().toISOString().slice(0, 10);
    const safeName = selectedApp.displayName.replace(/[^a-zA-Z0-9._-]+/g, '');
    const archivePath = `D:\\TierShift\\Capsules\\${safeName}_${dateStamp}.tiercapsule`;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capsule-create-title"
      >
        <div className="w-full max-w-xl rounded-xl border border-[#D8DEE6] bg-white shadow-2xl dark:border-[#2C323D] dark:bg-[#1A1D23]">
          <div className="flex items-start justify-between border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
            <div>
              <h2
                id="capsule-create-title"
                className="font-display text-lg font-semibold text-[#171B21] dark:text-[#EEF1F5]"
              >
                Create Portable State Capsule
              </h2>
              <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                Bundle ProgramData, AppData, and HKCU/HKLM registry keys to D: before clean reinstall.
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg p-1.5 text-[#5E6775] hover:bg-[#F1F4F8] dark:text-[#9AA4B2] dark:hover:bg-[#252A34]"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-6 py-5 text-xs">
            <div>
              <label
                htmlFor="capsule-app-select"
                className="mb-1.5 block font-medium text-[#171B21] dark:text-[#EEF1F5]"
              >
                Application
              </label>
              <select
                id="capsule-app-select"
                value={selectedApp.id}
                onChange={(e) => setSelectedAppId(e.target.value)}
                className="w-full rounded-lg border border-[#D8DEE6] bg-white px-3 py-2 text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#111317] dark:text-[#EEF1F5] dark:focus:border-[#60CDFF]"
              >
                {props.apps
                  .filter((a) => !a.isKernelProtected)
                  .map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.displayName} ({app.publisher})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-2 border-y border-[#E5E9F0] py-3.5 dark:border-[#282D37]">
              <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                Included State Paths & Registry Exports
              </div>
              {selectedApp.programDataPath && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#5E6775] dark:text-[#9AA4B2]">%ProgramData%</span>
                  <code className="truncate font-mono text-[#171B21] dark:text-[#EEF1F5]">
                    {selectedApp.programDataPath}
                  </code>
                </div>
              )}
              {selectedApp.appDataPath && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[#5E6775] dark:text-[#9AA4B2]">%AppData%</span>
                  <code className="truncate font-mono text-[#171B21] dark:text-[#EEF1F5]">
                    {selectedApp.appDataPath}
                  </code>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-[#5E6775] dark:text-[#9AA4B2]">Registry (.reg)</span>
                <div className="text-right font-mono text-[11px] text-[#171B21] dark:text-[#EEF1F5]">
                  {selectedApp.registryKeys.length > 0
                    ? selectedApp.registryKeys.map((k) => <div key={k}>{k}</div>)
                    : `HKCU\\Software\\${selectedApp.displayName}`}
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={excludeCaches}
                onChange={(e) => setExcludeCaches(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] accent-[#0067C0]"
              />
              <div>
                <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                  Exclude rebuildable caches (GPUCache, Code Cache, Temp)
                </div>
                <div className="text-[#5E6775] dark:text-[#9AA4B2]">
                  Keeps configuration, presets, plugins, and licenses compact. Estimated archive:{' '}
                  <span className="font-mono font-medium tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                    {formatBytes(effectiveBytes)}
                  </span>
                </div>
              </div>
            </label>

            <div className="flex items-center justify-between rounded-lg bg-[#F3F5F8] px-3.5 py-2.5 dark:bg-[#111317]">
              <span className="text-[#5E6775] dark:text-[#9AA4B2]">Output Archive</span>
              <code className="truncate font-mono text-[11px] text-[#0067C0] dark:text-[#60CDFF]">
                {archivePath}
              </code>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-[#E5E9F0] px-6 py-3.5 dark:border-[#282D37]">
            <button
              type="button"
              onClick={props.onClose}
              className="whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => props.onCreateCapsule(selectedApp, excludeCaches)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A]"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Export .tiercapsule</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Restore Redirected mode
  const { capsule } = props;
  const targetRoot = `D:\\TierShift\\State\\${capsule.appDisplayName}`;

  const steps = [
    `Extract archive -> ${targetRoot}\\ProgramData & AppData`,
    `Create NTFS Junctions on C: pointing to ${targetRoot}`,
    `Import ${capsule.registryExports.length} HKCU/HKLM registry keys (.reg)`,
    `Commit StateCapsule redirect entries to SQLite MoveLedger`,
  ];

  const handleRunRedirectedRestore = () => {
    setRestoringStep(1);
    let step = 1;
    const interval = window.setInterval(() => {
      step += 1;
      setRestoringStep(step);
      if (step > steps.length) {
        window.clearInterval(interval);
        props.onRestoreRedirected(capsule, targetRoot);
      }
    }, 280);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capsule-restore-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-[#D8DEE6] bg-white shadow-2xl dark:border-[#2C323D] dark:bg-[#1A1D23]">
        <div className="flex items-start justify-between border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
          <div>
            <h2
              id="capsule-restore-title"
              className="font-display text-lg font-semibold text-[#171B21] dark:text-[#EEF1F5]"
            >
              Restore Redirected to Cold Storage
            </h2>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              {capsule.fileName} · Prevents AppData re-bloat on C: NVMe
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            disabled={restoringStep > 0 && restoringStep <= steps.length}
            className="rounded-lg p-1.5 text-[#5E6775] hover:bg-[#F1F4F8] disabled:opacity-40 dark:text-[#9AA4B2] dark:hover:bg-[#252A34]"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#5E6775] dark:text-[#9AA4B2]">Extraction Target</span>
              <code className="font-mono text-[#0067C0] dark:text-[#60CDFF]">
                {targetRoot}
              </code>
            </div>
            {capsule.includedPaths.programData && (
              <div className="flex items-center justify-between">
                <span className="text-[#5E6775] dark:text-[#9AA4B2]">C: ProgramData Junction</span>
                <code className="truncate font-mono text-[#171B21] dark:text-[#EEF1F5]">
                  {capsule.includedPaths.programData}
                </code>
              </div>
            )}
            {(capsule.includedPaths.roamingAppData || capsule.includedPaths.localAppData) && (
              <div className="flex items-center justify-between">
                <span className="text-[#5E6775] dark:text-[#9AA4B2]">C: AppData Junction</span>
                <code className="truncate font-mono text-[#171B21] dark:text-[#EEF1F5]">
                  {capsule.includedPaths.roamingAppData || capsule.includedPaths.localAppData}
                </code>
              </div>
            )}
          </div>

          <div className="space-y-1.5 border-t border-[#E5E9F0] pt-3.5 dark:border-[#282D37]">
            <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
              Redirected Restore Sequence
            </div>
            {steps.map((s, idx) => {
              const done = restoringStep > idx + 1;
              const active = restoringStep === idx + 1;
              return (
                <div key={s} className="flex items-center gap-2.5">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? 'border-[#15803D] bg-[#15803D] text-white dark:border-[#4ADE80] dark:bg-[#4ADE80] dark:text-[#0F172A]'
                        : active
                          ? 'border-[#0067C0] text-[#0067C0] dark:border-[#60CDFF] dark:text-[#60CDFF]'
                          : 'border-[#CBD5E1] text-transparent dark:border-[#3A4150]'
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span
                    className={`font-mono text-[11.5px] ${
                      done
                        ? 'text-[#171B21] dark:text-[#EEF1F5]'
                        : active
                          ? 'font-medium text-[#0067C0] dark:text-[#60CDFF]'
                          : 'text-[#5E6775] dark:text-[#9AA4B2]'
                    }`}
                  >
                    {s}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[#E5E9F0] px-6 py-3.5 dark:border-[#282D37]">
          <button
            type="button"
            onClick={props.onClose}
            disabled={restoringStep > 0 && restoringStep <= steps.length}
            className="whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-4 py-2 text-xs font-medium text-[#374151] hover:bg-[#F3F5F8] disabled:opacity-40 dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={restoringStep > 0}
            onClick={handleRunRedirectedRestore}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white hover:bg-[#0055A0] disabled:opacity-50 dark:bg-[#60CDFF] dark:text-[#0F172A]"
          >
            <FolderSymlink className="h-3.5 w-3.5" />
            <span>Restore Redirected to D:</span>
          </button>
        </div>
      </div>
    </div>
  );
};
