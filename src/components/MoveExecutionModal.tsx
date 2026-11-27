import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  HardDrive,
  Lock,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  DriveVolume,
  LockingProcess,
  MoveType,
  PathGuardCheckResult,
} from '../engine/types';
import { formatBytes, validatePathGuard } from '../engine/pathGuard';

export interface MoveRequest {
  id: string;
  displayName: string;
  moveType: MoveType;
  sourcePath: string;
  targetRelativeSubpath: string;
  sizeBytes: number;
  fileCount: number;
  isSourceReparsePoint?: boolean;
  isMsixNativeMove?: boolean;
  packageFamilyName?: string;
  activeLocks: LockingProcess[];
  linkedAppId?: string;
  linkedFolderId?: string;
}

interface MoveExecutionModalProps {
  request: MoveRequest | null;
  drives: DriveVolume[];
  selectedTargetLetter: string;
  onSelectTargetLetter: (letter: string) => void;
  onClose: () => void;
  onCommitMove: (payload: {
    request: MoveRequest;
    targetDrive: DriveVolume;
    targetPath: string;
    closedProcesses: number[];
  }) => void;
}

type ExecutionPhase =
  | 'preflight'
  | 'locks'
  | 'copying'
  | 'swapping'
  | 'completed';

export const MoveExecutionModal: React.FC<MoveExecutionModalProps> = ({
  request,
  drives,
  selectedTargetLetter,
  onSelectTargetLetter,
  onClose,
  onCommitMove,
}) => {
  const [phase, setPhase] = useState<ExecutionPhase>('preflight');
  const [remainingLocks, setRemainingLocks] = useState<LockingProcess[]>([]);
  const [closedPids, setClosedPids] = useState<number[]>([]);
  const [copyProgress, setCopyProgress] = useState(0);
  const [swapStep, setSwapStep] = useState(0);
  const [committed, setCommitted] = useState(false);

  const targetDrives = useMemo(
    () => drives.filter((d) => d.letter !== 'C:'),
    [drives]
  );

  const targetDrive = useMemo(
    () =>
      targetDrives.find((d) => d.letter === selectedTargetLetter) ||
      targetDrives[0],
    [targetDrives, selectedTargetLetter]
  );

  const targetPath = useMemo(() => {
    if (!request || !targetDrive) return '';
    if (request.isMsixNativeMove && request.packageFamilyName) {
      return `${targetDrive.letter}\\WindowsApps\\${request.packageFamilyName}`;
    }
    return `${targetDrive.letter}\\TierShift\\${request.targetRelativeSubpath}`;
  }, [request, targetDrive]);

  const guardResult: PathGuardCheckResult | null = useMemo(() => {
    if (!request || !targetDrive) return null;
    return validatePathGuard({
      sourcePath: request.sourcePath,
      targetPath,
      sourceSizeBytes: request.sizeBytes,
      targetDrive,
      isSourceReparsePoint: request.isSourceReparsePoint,
      isMsixNativeMove: request.isMsixNativeMove,
    });
  }, [request, targetDrive, targetPath]);

  useEffect(() => {
    if (request) {
      setPhase('preflight');
      setRemainingLocks(request.activeLocks);
      setClosedPids([]);
      setCopyProgress(0);
      setSwapStep(0);
      setCommitted(false);
    }
  }, [request]);

  useEffect(() => {
    if (phase !== 'copying') return;
    const interval = window.setInterval(() => {
      setCopyProgress((prev) => {
        if (prev >= 100) {
          window.clearInterval(interval);
          setPhase('swapping');
          return 100;
        }
        return Math.min(100, prev + 14);
      });
    }, 110);
    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'swapping' || !request || !targetDrive) return;
    const totalSubSteps = request.isMsixNativeMove ? 2 : 4;
    if (swapStep >= totalSubSteps) {
      setPhase('completed');
      if (!committed) {
        setCommitted(true);
        onCommitMove({
          request,
          targetDrive,
          targetPath,
          closedProcesses: closedPids,
        });
      }
      return;
    }
    const timer = window.setTimeout(() => {
      setSwapStep((s) => s + 1);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [phase, swapStep, request, targetDrive, targetPath, closedPids, committed, onCommitMove]);

  if (!request || !targetDrive || !guardResult) return null;

  const hasNonClosableLock = remainingLocks.some((l) => !l.closable);
  const closableLocks = remainingLocks.filter((l) => l.closable);

  const handleBeginMigration = () => {
    if (!guardResult.allowed) return;
    if (remainingLocks.length > 0) {
      setPhase('locks');
    } else {
      setPhase('copying');
    }
  };

  const handleRmShutdown = () => {
    const pids = closableLocks.map((l) => l.pid);
    setClosedPids(pids);
    const stillLocked = remainingLocks.filter((l) => !l.closable);
    setRemainingLocks(stillLocked);
    if (stillLocked.length === 0) {
      setPhase('copying');
    }
  };

  const swapSubSteps = request.isMsixNativeMove
    ? [
        `Invoke PackageManager.MovePackageToVolumeAsync(${request.packageFamilyName})`,
        `Verify WindowsApps package registration on ${targetDrive.letter}`,
      ]
    : [
        `Rename source -> ${request.sourcePath}.tiershift_bak`,
        `Create NTFS Junction (FSCTL_SET_REPARSE_POINT / IO_REPARSE_TAG_MOUNT_POINT)`,
        `Verify GetFinalPathNameByHandle resolves -> ${targetPath}`,
        `Remove temporary backup folder & commit SQLite MoveLedger`,
      ];

  const copiedFilesCount = Math.round((request.fileCount * copyProgress) / 100);
  const copiedBytesCount = Math.round((request.sizeBytes * copyProgress) / 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[#D8DEE6] bg-white shadow-2xl dark:border-[#2C323D] dark:bg-[#1A1D23]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E9F0] px-6 py-4 dark:border-[#282D37]">
          <div className="min-w-0">
            <h2
              id="move-modal-title"
              className="font-display text-lg font-semibold text-[#171B21] dark:text-[#EEF1F5]"
            >
              {request.isMsixNativeMove
                ? 'Native MSIX Volume Relocation'
                : 'Junction-Anchored Relocation'}
            </h2>
            <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              {request.displayName} · {formatBytes(request.sizeBytes)} ·{' '}
              <span className="tabular-nums">
                {request.fileCount.toLocaleString()}
              </span>{' '}
              files
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'copying' || phase === 'swapping'}
            className="rounded-lg p-1.5 text-[#5E6775] transition-colors hover:bg-[#F1F4F8] hover:text-[#171B21] disabled:opacity-40 dark:text-[#9AA4B2] dark:hover:bg-[#252A34] dark:hover:text-white"
            aria-label="Close relocation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Path Route Summary */}
          <div className="space-y-2.5 border-b border-[#E5E9F0] pb-4 dark:border-[#282D37]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                Target Volume
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-[#F1F4F8] p-1 dark:bg-[#111317]">
                {targetDrives.map((drive) => {
                  const active = drive.letter === targetDrive.letter;
                  const freeBytes = drive.totalBytes - drive.usedBytes;
                  return (
                    <button
                      key={drive.letter}
                      type="button"
                      disabled={phase !== 'preflight'}
                      onClick={() => onSelectTargetLetter(drive.letter)}
                      className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#252A34] dark:text-white'
                          : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
                      } disabled:opacity-50`}
                    >
                      {drive.letter} {drive.label} ({drive.fileSystem} ·{' '}
                      {formatBytes(freeBytes)} free)
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#5E6775] dark:text-[#9AA4B2]">
                <span className="w-14 shrink-0 font-medium">Source</span>
                <code className="truncate font-mono text-[#171B21] dark:text-[#EEF1F5]">
                  {request.sourcePath}
                </code>
              </div>
              <div className="flex items-center gap-2 text-[#5E6775] dark:text-[#9AA4B2]">
                <span className="w-14 shrink-0 font-medium">Target</span>
                <code className="truncate font-mono text-[#0067C0] dark:text-[#60CDFF]">
                  {targetPath}
                </code>
              </div>
            </div>
          </div>

          {/* Step 1: PathGuard Pre-Flight */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                1. PathGuard Pre-Flight Validation
              </span>
              <span
                className={`text-xs font-medium ${
                  guardResult.allowed
                    ? 'text-[#15803D] dark:text-[#4ADE80]'
                    : 'text-[#B91C1C] dark:text-[#F87171]'
                }`}
              >
                {guardResult.allowed ? 'Passed' : `Blocked · ${guardResult.code}`}
              </span>
            </div>
            <div
              className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed ${
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
              <div>
                <p>{guardResult.message}</p>
                {guardResult.ruleMatched && (
                  <p className="mt-1 font-mono text-[11px] opacity-80">
                    Rule: {guardResult.ruleMatched}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 2: Restart Manager Lock Detection */}
          {phase === 'locks' && (
            <div className="space-y-2.5 border-t border-[#E5E9F0] pt-4 dark:border-[#282D37]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                  2. Restart Manager Lock Detection (RmGetList)
                </span>
                <span className="text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
                  {remainingLocks.length} locking process
                  {remainingLocks.length === 1 ? '' : 'es'} detected
                </span>
              </div>
              <div className="divide-y divide-[#E5E9F0] rounded-lg border border-[#E5E9F0] dark:divide-[#282D37] dark:border-[#282D37]">
                {remainingLocks.map((proc) => (
                  <div
                    key={proc.pid}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
                      <div className="min-w-0">
                        <div className="font-mono font-medium text-[#171B21] dark:text-[#EEF1F5]">
                          {proc.imageName}{' '}
                          <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                            (PID {proc.pid})
                          </span>
                        </div>
                        <div className="truncate text-[#5E6775] dark:text-[#9AA4B2]">
                          {proc.reason || proc.description}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-medium ${
                        proc.closable
                          ? 'text-[#0067C0] dark:text-[#60CDFF]'
                          : 'text-[#B91C1C] dark:text-[#F87171]'
                      }`}
                    >
                      {proc.closable ? 'Closable via RmShutdown' : 'System-Locked'}
                    </span>
                  </div>
                ))}
              </div>
              {hasNonClosableLock && (
                <div className="flex items-start gap-2 text-xs text-[#B91C1C] dark:text-[#FCA5A5]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    A non-closable SYSTEM service holds active file handles. Abort and stop the Windows Service before retrying.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Verified Copy */}
          {(phase === 'copying' || phase === 'swapping' || phase === 'completed') && (
            <div className="space-y-2 border-t border-[#E5E9F0] pt-4 dark:border-[#282D37]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                  {request.isMsixNativeMove
                    ? '2. MSIX Package Volume Transfer'
                    : '2. Verified Recursive Copy (Timestamps & ACLs)'}
                </span>
                <span className="font-mono tabular-nums text-[#5E6775] dark:text-[#9AA4B2]">
                  {copiedFilesCount.toLocaleString()} /{' '}
                  {request.fileCount.toLocaleString()} files ·{' '}
                  {formatBytes(copiedBytesCount)} / {formatBytes(request.sizeBytes)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E9F0] dark:bg-[#282D37]">
                <div
                  className="h-full bg-[#0067C0] transition-all duration-150 dark:bg-[#60CDFF]"
                  style={{ width: `${copyProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Step 4: Atomic Swap & Reparse Point */}
          {(phase === 'swapping' || phase === 'completed') && (
            <div className="space-y-2 border-t border-[#E5E9F0] pt-4 dark:border-[#282D37]">
              <span className="text-xs font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                {request.isMsixNativeMove
                  ? '3. AppModel Registration & Ledger Commit'
                  : '3. Atomic Swap & NTFS Junction Verification'}
              </span>
              <div className="space-y-1.5">
                {swapSubSteps.map((label, idx) => {
                  const done = swapStep > idx || phase === 'completed';
                  const active = swapStep === idx && phase === 'swapping';
                  return (
                    <div
                      key={label}
                      className="flex items-center gap-2.5 text-xs"
                    >
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
                              : 'text-[#8792A2] dark:text-[#64748B]'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Summary */}
          {phase === 'completed' && (
            <div className="flex items-center justify-between rounded-lg border border-[#D1E7DD] bg-[#F4FBF7] px-4 py-3 text-xs text-[#14532D] dark:border-[#1E3A2A] dark:bg-[#132219] dark:text-[#86EFAC]">
              <div className="flex items-center gap-2.5">
                <HardDrive className="h-4 w-4 shrink-0" />
                <span>
                  Reclaimed <strong>{formatBytes(request.sizeBytes)}</strong> on{' '}
                  <code className="font-mono">C:</code> NVMe. Windows Uninstall and updaters remain transparent.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[#E5E9F0] px-6 py-3.5 dark:border-[#282D37]">
          {phase === 'preflight' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-4 py-2 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB] dark:hover:bg-[#2A2F3A]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!guardResult.allowed}
                onClick={handleBeginMigration}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
              >
                <span>
                  {request.isMsixNativeMove
                    ? `Move MSIX to ${targetDrive.letter}`
                    : `Execute Junction Move`}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {phase === 'locks' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-4 py-2 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F3F5F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB] dark:hover:bg-[#2A2F3A]"
              >
                Abort Cleanly
              </button>
              {closableLocks.length > 0 && !hasNonClosableLock && (
                <button
                  type="button"
                  onClick={handleRmShutdown}
                  className="whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
                >
                  Close {closableLocks.length} App Process
                  {closableLocks.length > 1 ? 'es' : ''} & Continue
                </button>
              )}
            </>
          )}

          {(phase === 'copying' || phase === 'swapping') && (
            <span className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
              Executing verified transfer… do not close window.
            </span>
          )}

          {phase === 'completed' && (
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
