/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  FolderSearch,
  HardDrive,
  LayoutGrid,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import {
  AppDataFolderItem,
  DriveVolume,
  InstalledApp,
  MoveLedgerRow,
  StateCapsule,
  TransactionJournalRow,
} from './engine/types';
import {
  buildInitialFolders,
  INITIAL_APPS,
  INITIAL_CAPSULES,
  INITIAL_DRIVES,
  INITIAL_JOURNAL,
  INITIAL_LEDGER,
} from './engine/initialData';
import { formatBytes } from './engine/pathGuard';
import { DashboardView, NavSection } from './components/DashboardView';
import { AppsAdvisorView } from './components/AppsAdvisorView';
import { AppDataInspectorView } from './components/AppDataInspectorView';
import { CapsulesLedgerView } from './components/CapsulesLedgerView';
import { WorkbenchView } from './components/WorkbenchView';
import {
  MoveExecutionModal,
  MoveRequest,
} from './components/MoveExecutionModal';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { CapsuleModal } from './components/CapsuleModal';

function makeGuid(): string {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-4${s4().slice(1)}-${s4()}-${s4()}${s4()}${s4()}`;
}

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [navPresetFilter, setNavPresetFilter] = useState<string | undefined>(
    undefined
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Core TierShift persisted-equivalent state
  const [drives, setDrives] = useState<DriveVolume[]>(INITIAL_DRIVES);
  const [selectedTargetLetter, setSelectedTargetLetter] =
    useState<string>('D:');
  const [apps, setApps] = useState<InstalledApp[]>(INITIAL_APPS);
  const [folders, setFolders] = useState<AppDataFolderItem[]>(() =>
    buildInitialFolders(INITIAL_APPS)
  );
  const [ledger, setLedger] = useState<MoveLedgerRow[]>(INITIAL_LEDGER);
  const [journal, setJournal] =
    useState<TransactionJournalRow[]>(INITIAL_JOURNAL);
  const [capsules, setCapsules] = useState<StateCapsule[]>(INITIAL_CAPSULES);

  // Interactive modals, drawers, scan & notifications
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [inspectedFolder, setInspectedFolder] =
    useState<AppDataFolderItem | null>(null);
  const [capsuleModalState, setCapsuleModalState] = useState<
    | { mode: 'create'; preselectedAppId?: string }
    | { mode: 'restore'; capsule: StateCapsule }
    | null
  >(null);

  const [isScanning, setIsScanning] = useState(false);
  const [lastScannedLabel, setLastScannedLabel] = useState('Just now');
  const [lastSweepReport, setLastSweepReport] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 4200);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const handleNavigate = useCallback(
    (section: NavSection, presetFilter?: string) => {
      setActiveNav(section);
      setNavPresetFilter(presetFilter);
      setMobileMenuOpen(false);
    },
    []
  );

  const handleQuickScan = useCallback(() => {
    setIsScanning(true);
    window.setTimeout(() => {
      setIsScanning(false);
      setLastScannedLabel(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      const pendingSweeps = ledger.filter(
        (l) => l.status === 'Active' && l.sourceJunctionMissing && l.targetDirEmpty
      ).length;
      showToast(
        pendingSweeps > 0
          ? `Scan complete. ${pendingSweeps} orphaned D: junction target ready to sweep.`
          : 'Scan complete. Attribution cache and NTFS junction integrity verified.'
      );
    }, 650);
  }, [ledger, showToast]);

  // Initiate Win32 or MSIX App Relocation
  const handleStartAppMove = useCallback((app: InstalledApp) => {
    const cleanName = app.displayName.replace(/[<>:"/\\|?*]+/g, '');
    setMoveRequest({
      id: app.id,
      displayName: app.displayName,
      moveType: app.packageKind === 'MSIX' ? 'MsixNative' : 'Win32Junction',
      sourcePath: app.installPath,
      targetRelativeSubpath: `Apps\\${cleanName}`,
      sizeBytes: app.installBytes,
      fileCount: app.fileCount,
      isSourceReparsePoint: app.status === 'Offloaded',
      isMsixNativeMove: app.packageKind === 'MSIX',
      packageFamilyName: app.packageFamilyName,
      activeLocks: app.activeLocks,
      linkedAppId: app.id,
    });
  }, []);

  // Initiate AppData / ProgramData Junction Offload
  const handleStartFolderOffload = useCallback((folder: AppDataFolderItem) => {
    const relFolder = folder.folderName.replace(/[<>:"/|?*]+/g, '');
    setMoveRequest({
      id: folder.id,
      displayName: `${folder.attribution.resolvedAppName || folder.folderName} (${folder.rootScope})`,
      moveType: 'AppDataJunction',
      sourcePath: folder.folderPath,
      targetRelativeSubpath: `AppData\\${folder.rootScope}\\${relFolder}`,
      sizeBytes: folder.sizeBytes,
      fileCount: folder.fileCount,
      isSourceReparsePoint: folder.isReparsePoint,
      isMsixNativeMove: false,
      activeLocks: folder.activeLocks,
      linkedFolderId: folder.id,
    });
  }, []);

  // Commit Move to Drives, Apps/Folders, MoveLedger & TransactionJournal
  const handleCommitMove = useCallback(
    ({
      request,
      targetDrive,
      targetPath,
    }: {
      request: MoveRequest;
      targetDrive: DriveVolume;
      targetPath: string;
      closedProcesses: number[];
    }) => {
      const moveId = makeGuid();
      const nowUtc = new Date().toISOString();

      // Update Drive usage
      setDrives((prev) =>
        prev.map((d) => {
          if (d.letter === 'C:') {
            return {
              ...d,
              usedBytes: Math.max(0, d.usedBytes - request.sizeBytes),
            };
          }
          if (d.letter === targetDrive.letter) {
            return {
              ...d,
              usedBytes: d.usedBytes + request.sizeBytes,
              offloadedBytes: d.offloadedBytes + request.sizeBytes,
            };
          }
          return d;
        })
      );

      // Update App or Folder
      if (request.linkedAppId) {
        setApps((prev) =>
          prev.map((a) =>
            a.id === request.linkedAppId
              ? {
                  ...a,
                  status: 'Offloaded',
                  offloadedTargetPath: targetPath,
                  activeLocks: [],
                }
              : a
          )
        );
      }

      if (request.linkedFolderId) {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === request.linkedFolderId
              ? {
                  ...f,
                  isReparsePoint: true,
                  offloadedTargetPath: targetPath,
                  activeLocks: [],
                }
              : f
          )
        );
      }

      // Append MoveLedger record
      const newLedgerRow: MoveLedgerRow = {
        id: moveId,
        appDisplayName: request.displayName,
        moveType: request.moveType,
        sourcePath: request.sourcePath,
        targetPath,
        bytesMoved: request.sizeBytes,
        status: 'Active',
        createdAtUtc: nowUtc,
        linkedAppId: request.linkedAppId,
        linkedFolderId: request.linkedFolderId,
      };
      setLedger((prev) => [newLedgerRow, ...prev]);

      // Append TransactionJournal steps
      setJournal((prev) => {
        const nextId = prev.reduce((max, r) => Math.max(max, r.id), 0) + 1;
        const steps: TransactionJournalRow[] = request.isMsixNativeMove
          ? [
              {
                id: nextId,
                moveId,
                stepOrder: 1,
                actionType: 'MsixVolumeMove',
                payloadJson: JSON.stringify({
                  packageFamilyName: request.packageFamilyName,
                  targetVolume: targetDrive.letter + '\\',
                }),
                completed: true,
              },
            ]
          : [
              {
                id: nextId,
                moveId,
                stepOrder: 1,
                actionType: 'CopyDir',
                payloadJson: JSON.stringify({
                  source: request.sourcePath,
                  target: targetPath,
                  verifiedFiles: request.fileCount,
                }),
                completed: true,
              },
              {
                id: nextId + 1,
                moveId,
                stepOrder: 2,
                actionType: 'CreateJunction',
                payloadJson: JSON.stringify({
                  junction: request.sourcePath,
                  target: targetPath,
                  reparseTag: 'IO_REPARSE_TAG_MOUNT_POINT',
                }),
                completed: true,
              },
              {
                id: nextId + 2,
                moveId,
                stepOrder: 3,
                actionType: 'DeleteSource',
                payloadJson: JSON.stringify({
                  backupDeleted: `${request.sourcePath}.tiershift_bak`,
                }),
                completed: true,
              },
            ];
        return [...prev, ...steps];
      });

      showToast(
        `Relocated ${request.displayName} (${formatBytes(request.sizeBytes)}) to ${targetDrive.letter}.`
      );
    },
    [showToast]
  );

  // 1-Click Rollback from MoveLedger
  const handleRollbackLedgerRow = useCallback(
    (row: MoveLedgerRow) => {
      const targetLetter = row.targetPath.slice(0, 2).toUpperCase();

      setDrives((prev) =>
        prev.map((d) => {
          if (d.letter === 'C:') {
            return { ...d, usedBytes: d.usedBytes + row.bytesMoved };
          }
          if (d.letter === targetLetter) {
            return {
              ...d,
              usedBytes: Math.max(0, d.usedBytes - row.bytesMoved),
              offloadedBytes: Math.max(0, d.offloadedBytes - row.bytesMoved),
            };
          }
          return d;
        })
      );

      if (row.linkedAppId) {
        setApps((prev) =>
          prev.map((a) =>
            a.id === row.linkedAppId
              ? { ...a, status: 'OnNVMe', offloadedTargetPath: undefined }
              : a
          )
        );
      }

      if (row.linkedFolderId) {
        setFolders((prev) =>
          prev.map((f) =>
            f.id === row.linkedFolderId
              ? {
                  ...f,
                  isReparsePoint: false,
                  offloadedTargetPath: undefined,
                }
              : f
          )
        );
      }

      setLedger((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, status: 'RolledBack' } : item
        )
      );

      showToast(
        `Rolled back ${row.appDisplayName} (${formatBytes(row.bytesMoved)}) to C: NVMe.`
      );
    },
    [showToast]
  );

  // JunctionSweepService.RunSweep()
  const handleSweepOrphanedJunctions = useCallback(() => {
    const candidates = ledger.filter(
      (r) => r.status === 'Active' && r.sourceJunctionMissing && r.targetDirEmpty
    );

    if (candidates.length === 0) {
      setLastSweepReport(
        'Verified all active ledger entries. Zero orphaned empty D: target directories found.'
      );
      showToast('Sweep complete: all active NTFS junctions are intact.');
      return;
    }

    const ids = new Set(candidates.map((c) => c.id));
    setLedger((prev) =>
      prev.map((r) =>
        ids.has(r.id)
          ? {
              ...r,
              status: 'OrphanedTargetCleaned',
              sourceJunctionMissing: false,
              targetDirEmpty: false,
            }
          : r
      )
    );

    const names = candidates.map((c) => c.targetPath).join(', ');
    setLastSweepReport(
      `Removed ${candidates.length} leftover empty target shell${candidates.length > 1 ? 's' : ''} (${names}) and marked Status = OrphanedTargetCleaned.`
    );
    showToast(
      `Cleaned ${candidates.length} orphaned cold-storage target folder${candidates.length > 1 ? 's' : ''}.`
    );
  }, [ledger, showToast]);

  // Remove Verified Orphan Folder
  const handleDeleteOrphan = useCallback(
    (folder: AppDataFolderItem) => {
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setDrives((prev) =>
        prev.map((d) =>
          d.letter === 'C:'
            ? { ...d, usedBytes: Math.max(0, d.usedBytes - folder.sizeBytes) }
            : d
        )
      );
      showToast(
        `Deleted orphaned folder "${folder.folderName}" and reclaimed ${formatBytes(folder.sizeBytes)} on C:.`
      );
    },
    [showToast]
  );

  // Simulate Native Windows Uninstall (traverses NTFS junction if offloaded!)
  const handleUninstallApp = useCallback(
    (app: InstalledApp) => {
      const wasOffloaded = app.status === 'Offloaded';
      const targetLetter = app.offloadedTargetPath?.slice(0, 2).toUpperCase();

      setApps((prev) =>
        prev.map((a) =>
          a.id === app.id ? { ...a, status: 'Uninstalled' } : a
        )
      );

      setDrives((prev) =>
        prev.map((d) => {
          if (!wasOffloaded && d.letter === 'C:') {
            return {
              ...d,
              usedBytes: Math.max(0, d.usedBytes - app.installBytes),
            };
          }
          if (wasOffloaded && d.letter === targetLetter) {
            return {
              ...d,
              usedBytes: Math.max(0, d.usedBytes - app.installBytes),
              offloadedBytes: Math.max(0, d.offloadedBytes - app.installBytes),
            };
          }
          return d;
        })
      );

      if (wasOffloaded) {
        // Windows Uninstaller deletes the C: junction & files on D:, leaving an empty D: shell for JunctionSweepService
        setLedger((prev) =>
          prev.map((l) =>
            l.linkedAppId === app.id && l.status === 'Active'
              ? {
                  ...l,
                  sourceJunctionMissing: true,
                  targetDirEmpty: true,
                }
              : l
          )
        );
        showToast(
          `Uninstalled ${app.displayName} transparently through NTFS junction. Run Sweep Orphaned Junctions in Ledger to remove empty target folder.`
        );
      } else {
        showToast(
          `Uninstalled ${app.displayName} via native Windows uninstaller (${formatBytes(app.installBytes)} freed on C:).`
        );
      }
    },
    [showToast]
  );

  // Create State Capsule
  const handleCreateCapsule = useCallback(
    (app: InstalledApp, excludeCaches: boolean) => {
      const dateStamp = new Date().toISOString().slice(0, 10);
      const safeName = app.displayName.replace(/[^a-zA-Z0-9._-]+/g, '');
      const fileName = `${safeName}_${dateStamp}.tiercapsule`;
      const rawBytes = Math.max(
        320 * 1024 * 1024,
        app.programDataBytes + app.appDataBytes
      );
      const archiveBytes = excludeCaches
        ? Math.round(rawBytes * 0.25)
        : Math.round(rawBytes * 0.62);

      const newCapsule: StateCapsule = {
        id: `cap-${Date.now()}`,
        fileName,
        archivePath: `D:\\TierShift\\Capsules\\${fileName}`,
        appId: app.id,
        appDisplayName: app.displayName,
        publisher: app.publisher,
        createdAtUtc: new Date().toISOString(),
        archiveBytes,
        uncompressedBytes: rawBytes,
        cachesExcluded: excludeCaches,
        includedPaths: {
          programData: app.programDataPath,
          roamingAppData: app.appDataPath?.includes('Roaming')
            ? app.appDataPath
            : undefined,
          localAppData: app.appDataPath?.includes('Local')
            ? app.appDataPath
            : undefined,
        },
        registryExports:
          app.registryKeys.length > 0
            ? app.registryKeys
            : [`HKCU\\Software\\${app.displayName}`],
        regFilePreview: `Windows Registry Editor Version 5.00\n\n[${(app.registryKeys[0] || `HKCU\\Software\\${app.displayName}`).replace('HKLM', 'HKEY_LOCAL_MACHINE').replace('HKCU', 'HKEY_CURRENT_USER')}]\n"Version"="${app.version}"\n"RedirectedStateRoot"="D:\\\\TierShift\\\\State\\\\${app.displayName}"`,
        status: 'Ready',
      };

      setCapsules((prev) => [newCapsule, ...prev]);
      setApps((prev) =>
        prev.map((a) =>
          a.id === app.id ? { ...a, hasActiveCapsule: true } : a
        )
      );
      setDrives((prev) =>
        prev.map((d) =>
          d.letter === 'D:'
            ? {
                ...d,
                usedBytes: d.usedBytes + archiveBytes,
                offloadedBytes: d.offloadedBytes + archiveBytes,
              }
            : d
        )
      );
      setCapsuleModalState(null);
      showToast(
        `Exported ${fileName} (${formatBytes(archiveBytes)}) to D:\\TierShift\\Capsules\\.`
      );
    },
    [showToast]
  );

  // Restore State Capsule Redirected to HDD
  const handleRestoreRedirected = useCallback(
    (capsule: StateCapsule, targetRoot: string) => {
      const moveId = makeGuid();
      const nowUtc = new Date().toISOString();

      setCapsules((prev) =>
        prev.map((c) =>
          c.id === capsule.id
            ? {
                ...c,
                status: 'RestoredRedirected',
                restoredRedirectedPath: targetRoot,
              }
            : c
        )
      );

      const sourcePath =
        capsule.includedPaths.programData ||
        capsule.includedPaths.roamingAppData ||
        capsule.includedPaths.localAppData ||
        `C:\\ProgramData\\${capsule.appDisplayName}`;

      setLedger((prev) => [
        {
          id: moveId,
          appDisplayName: `${capsule.appDisplayName} (State Capsule Redirect)`,
          moveType: 'StateCapsule',
          sourcePath,
          targetPath: targetRoot,
          bytesMoved: capsule.uncompressedBytes,
          status: 'Active',
          createdAtUtc: nowUtc,
        },
        ...prev,
      ]);

      setJournal((prev) => {
        const nextId = prev.reduce((m, r) => Math.max(m, r.id), 0) + 1;
        return [
          ...prev,
          {
            id: nextId,
            moveId,
            stepOrder: 1,
            actionType: 'CapsuleRestore',
            payloadJson: JSON.stringify({
              capsule: capsule.fileName,
              extractedTo: targetRoot,
            }),
            completed: true,
          },
          {
            id: nextId + 1,
            moveId,
            stepOrder: 2,
            actionType: 'CreateJunction',
            payloadJson: JSON.stringify({
              junction: sourcePath,
              target: targetRoot,
            }),
            completed: true,
          },
          {
            id: nextId + 2,
            moveId,
            stepOrder: 3,
            actionType: 'RegBackup',
            payloadJson: JSON.stringify({
              importedKeys: capsule.registryExports,
            }),
            completed: true,
          },
        ];
      });

      setCapsuleModalState(null);
      showToast(
        `Restored ${capsule.appDisplayName} state redirected to ${targetRoot} with NTFS junctions on C:.`
      );
    },
    [showToast]
  );

  const navItems: {
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'apps', label: 'Apps & Advisor', icon: HardDrive },
    { id: 'appdata', label: 'AppData & Inspector', icon: FolderSearch },
    { id: 'ledger', label: 'Capsules & Ledger', icon: Archive },
  ];

  const pageTitleMap: Record<NavSection, string> = {
    dashboard: 'Dashboard',
    apps: 'Apps & Advisor',
    appdata: 'AppData & Mystery Inspector',
    ledger: 'Capsules & Ledger',
    workbench: 'PathGuard & .NET 8 Source',
  };

  return (
    <div className="mica-canvas flex min-h-screen text-[#171B21] dark:text-[#EEF1F5]">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* WinUI 3 Left NavigationView Rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] shrink-0 flex-col border-r border-[#E2E6EC] bg-[#F8FAFC]/95 backdrop-blur-md transition-transform lg:static lg:translate-x-0 dark:border-[#242933] dark:bg-[#15181E]/95 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Single-line Brand Title */}
        <div className="flex h-14 items-center justify-between px-5">
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="font-display text-base font-bold tracking-tight text-[#171B21] whitespace-nowrap shrink-0 dark:text-white"
          >
            TierShift
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-md p-1 text-[#5E6775] lg:hidden dark:text-[#9AA4B2]"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Primary 4 Fluent Views */}
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-white text-[#0067C0] shadow-xs ring-1 ring-[#E2E6EC] dark:bg-[#222731] dark:text-[#60CDFF] dark:ring-[#2E3440]'
                    : 'text-[#4B5563] hover:bg-white/60 hover:text-[#171B21] dark:text-[#A3AEBE] dark:hover:bg-[#1E222B] dark:hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="my-3 border-t border-[#E5E9F0] dark:border-[#242933]" />

          <button
            type="button"
            onClick={() => handleNavigate('workbench')}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-colors ${
              activeNav === 'workbench'
                ? 'bg-white text-[#0067C0] shadow-xs ring-1 ring-[#E2E6EC] dark:bg-[#222731] dark:text-[#60CDFF] dark:ring-[#2E3440]'
                : 'text-[#4B5563] hover:bg-white/60 hover:text-[#171B21] dark:text-[#A3AEBE] dark:hover:bg-[#1E222B] dark:hover:text-white'
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>PathGuard &amp; Source</span>
          </button>
        </nav>

        {/* Quiet Volume Summary Footer */}
        <div className="border-t border-[#E5E9F0] px-4 py-3.5 text-[11px] text-[#5E6775] dark:border-[#242933] dark:text-[#9AA4B2]">
          <div className="flex items-center justify-between">
            <span>C: NVMe Free</span>
            <span className="font-mono font-medium tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
              {formatBytes(
                Math.max(0, drives[0].totalBytes - drives[0].usedBytes)
              )}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>D: Cold Offloaded</span>
            <span className="font-mono font-medium tabular-nums text-[#0067C0] dark:text-[#60CDFF]">
              {formatBytes(drives[1].offloadedBytes)}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar Contract: Breadcrumb Left — Primary Action Right */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-[#E2E6EC] bg-[#F8FAFC]/85 px-5 backdrop-blur-md lg:px-8 dark:border-[#242933] dark:bg-[#15181E]/85">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-1.5 text-[#5E6775] hover:bg-[#E8ECF2] lg:hidden dark:text-[#9AA4B2] dark:hover:bg-[#242933]"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-xs text-[#5E6775] dark:text-[#9AA4B2]"
            >
              <span className="whitespace-nowrap">TierShift</span>
              <span aria-hidden="true">/</span>
              <h1 className="truncate font-display text-sm font-semibold text-[#171B21] dark:text-[#EEF1F5]">
                {pageTitleMap[activeNav]}
              </h1>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#D1D5DB] dark:hover:bg-[#2A2F3A]"
              aria-label={darkMode ? 'Switch to Light Mica' : 'Switch to Dark Mica'}
            >
              {darkMode ? (
                <>
                  <Sun className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setCapsuleModalState({ mode: 'create' })}
              className="whitespace-nowrap shrink-0 rounded-lg bg-[#0067C0] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
            >
              New Capsule
            </button>
          </div>
        </header>

        {/* Active Page Viewport */}
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 py-6 lg:px-8">
          {activeNav === 'dashboard' && (
            <DashboardView
              drives={drives}
              selectedTargetLetter={selectedTargetLetter}
              onSelectTargetLetter={setSelectedTargetLetter}
              apps={apps}
              folders={folders}
              ledger={ledger}
              isScanning={isScanning}
              lastScannedLabel={lastScannedLabel}
              onQuickScan={handleQuickScan}
              onNavigate={handleNavigate}
              onStartAppMove={handleStartAppMove}
              onStartFolderOffload={handleStartFolderOffload}
              onInspectFolder={setInspectedFolder}
            />
          )}

          {activeNav === 'apps' && (
            <AppsAdvisorView
              apps={apps}
              targetDriveLetter={selectedTargetLetter}
              initialFilter={navPresetFilter}
              onMoveApp={handleStartAppMove}
              onCreateCapsule={(app) =>
                setCapsuleModalState({
                  mode: 'create',
                  preselectedAppId: app.id,
                })
              }
              onUninstallApp={handleUninstallApp}
            />
          )}

          {activeNav === 'appdata' && (
            <AppDataInspectorView
              folders={folders}
              initialFilter={navPresetFilter}
              onInspectEvidence={setInspectedFolder}
              onOffloadFolder={handleStartFolderOffload}
              onDeleteOrphan={handleDeleteOrphan}
            />
          )}

          {activeNav === 'ledger' && (
            <CapsulesLedgerView
              ledger={ledger}
              journal={journal}
              capsules={capsules}
              lastSweepReport={lastSweepReport}
              onRollbackLedgerRow={handleRollbackLedgerRow}
              onSweepOrphanedJunctions={handleSweepOrphanedJunctions}
              onOpenCreateCapsule={() =>
                setCapsuleModalState({ mode: 'create' })
              }
              onOpenRestoreCapsule={(capsule) =>
                setCapsuleModalState({ mode: 'restore', capsule })
              }
            />
          )}

          {activeNav === 'workbench' && (
            <WorkbenchView drives={drives} apps={apps} />
          )}
        </main>
      </div>

      {/* Move Execution Modal (PathGuard + Restart Manager + Verified Copy + Atomic Swap) */}
      <MoveExecutionModal
        request={moveRequest}
        drives={drives}
        selectedTargetLetter={selectedTargetLetter}
        onSelectTargetLetter={setSelectedTargetLetter}
        onClose={() => setMoveRequest(null)}
        onCommitMove={handleCommitMove}
      />

      {/* 5-Stage Attribution Evidence Drawer */}
      <EvidenceDrawer
        folder={inspectedFolder}
        onClose={() => setInspectedFolder(null)}
        onOffloadFolder={handleStartFolderOffload}
        onDeleteOrphan={handleDeleteOrphan}
      />

      {/* State Capsule Create / Restore Redirected Modal */}
      {capsuleModalState?.mode === 'create' && (
        <CapsuleModal
          mode="create"
          apps={apps.filter((a) => a.status !== 'Uninstalled')}
          preselectedAppId={capsuleModalState.preselectedAppId}
          onClose={() => setCapsuleModalState(null)}
          onCreateCapsule={handleCreateCapsule}
        />
      )}

      {capsuleModalState?.mode === 'restore' && (
        <CapsuleModal
          mode="restore"
          capsule={capsuleModalState.capsule}
          onClose={() => setCapsuleModalState(null)}
          onRestoreRedirected={handleRestoreRedirected}
        />
      )}

      {/* Non-intrusive Action Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-5 bottom-5 z-50 flex max-w-md items-center gap-3 rounded-lg border border-[#D8DEE6] bg-white px-4 py-3 text-xs text-[#171B21] shadow-lg dark:border-[#323846] dark:bg-[#1E222B] dark:text-[#EEF1F5]"
        >
          <span className="leading-snug">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="shrink-0 rounded p-0.5 text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
