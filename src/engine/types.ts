export type MoveType =
  | 'Win32Junction'
  | 'AppDataJunction'
  | 'MsixNative'
  | 'StateCapsule';

export type MoveStatus =
  | 'Active'
  | 'RolledBack'
  | 'OrphanedTargetCleaned'
  | 'Failed';

export type JournalActionType =
  | 'CopyDir'
  | 'DeleteSource'
  | 'CreateJunction'
  | 'RegBackup'
  | 'MsixVolumeMove'
  | 'CapsuleRestore';

export type AttributionClassification =
  | 'Active'
  | 'Dormant'
  | 'Orphaned'
  | 'Protected'
  | 'Unknown';

export type AppPackageKind = 'Win32' | 'MSIX';

export type AppDataRootScope = 'Local' | 'LocalLow' | 'Roaming' | 'ProgramData';

export interface DriveVolume {
  letter: string; // e.g. 'C:'
  label: string;
  model: string;
  tier: 'NVMe' | 'HDD' | 'Removable';
  fileSystem: 'NTFS' | 'exFAT' | 'FAT32';
  driveType: 'Fixed' | 'Removable' | 'Network';
  totalBytes: number;
  usedBytes: number;
  offloadedBytes: number; // Bytes stored here via TierShift junctions/MSIX moves
}

export interface LockingProcess {
  pid: number;
  imageName: string;
  description: string;
  closable: boolean;
  reason?: string;
}

export interface InstalledApp {
  id: string;
  displayName: string;
  publisher: string;
  version: string;
  packageKind: AppPackageKind;
  packageFamilyName?: string; // MSIX only
  installPath: string;
  programDataPath?: string;
  appDataPath?: string;
  installBytes: number;
  programDataBytes: number;
  appDataBytes: number;
  fileCount: number;
  lastUsedDaysAgo: number;
  status: 'OnNVMe' | 'Offloaded' | 'Uninstalled';
  offloadedTargetPath?: string;
  activeLocks: LockingProcess[];
  isKernelProtected?: boolean;
  registryKeys: string[];
  uninstallString?: string;
  hasActiveCapsule?: boolean;
}

export interface FolderForensicInputs {
  id: string;
  folderPath: string;
  folderName: string;
  rootScope: AppDataRootScope;
  sizeBytes: number;
  fileCount: number;
  lastModifiedDaysAgo: number;
  isReparsePoint: boolean;
  offloadedTargetPath?: string;
  activeLocks: LockingProcess[];
  // Stage 1 signals
  arpExactMatch?: {
    displayName: string;
    publisher: string;
    uninstallKey: string;
    matchedVia: 'InstallLocation' | 'MSI_Folders' | 'MSIX_PackageFamily';
  };
  // Stage 2 signals
  binaryInspection?: {
    scannedFile: string;
    productName?: string;
    companyName?: string;
    authenticodeSubjectCN?: string;
    packageJsonProductName?: string;
    logHeaderHint?: string;
  };
  // Stage 5 orphan verification facts
  hasMatchingArpKey: boolean;
  hasRunningService: boolean;
  hasProgramFilesExe: boolean;
}

export interface StageEvidence {
  stage: 1 | 2 | 3 | 4 | 5;
  stageTitle: string;
  source: string;
  detail: string;
  points: number;
  matched: boolean;
  deferred?: boolean;
}

export interface AttributionResult {
  folderPath: string;
  resolvedAppName: string | null;
  publisher: string | null;
  confidenceScore: number; // 0-100
  evidenceSummary: string;
  classification: AttributionClassification;
  sizeBytes: number;
  lastScannedUtc: string;
  stages: StageEvidence[];
  fuzzyMatch?: {
    normalizedToken: string;
    matchedTarget: string;
    similarity: number;
  };
}

export interface AppDataFolderItem extends FolderForensicInputs {
  attribution: AttributionResult;
}

export interface TransactionJournalRow {
  id: number;
  moveId: string;
  stepOrder: number;
  actionType: JournalActionType;
  payloadJson: string;
  completed: boolean;
}

export interface MoveLedgerRow {
  id: string;
  appDisplayName: string;
  moveType: MoveType;
  sourcePath: string;
  targetPath: string;
  bytesMoved: number;
  status: MoveStatus;
  createdAtUtc: string;
  // Simulation flags for JunctionSweepService
  sourceJunctionMissing?: boolean;
  targetDirEmpty?: boolean;
  linkedAppId?: string;
  linkedFolderId?: string;
}

export interface StateCapsule {
  id: string;
  fileName: string;
  archivePath: string;
  appId: string;
  appDisplayName: string;
  publisher: string;
  createdAtUtc: string;
  archiveBytes: number;
  uncompressedBytes: number;
  cachesExcluded: boolean;
  includedPaths: {
    programData?: string;
    roamingAppData?: string;
    localAppData?: string;
  };
  registryExports: string[];
  regFilePreview: string;
  restoredRedirectedPath?: string;
  status: 'Ready' | 'RestoredRedirected';
}

export interface PathGuardCheckResult {
  allowed: boolean;
  routeViaMsix?: boolean;
  code:
    | 'OK'
    | 'BLOCKED_SYSTEM_ROOT'
    | 'BLOCKED_DRIVE_ROOT'
    | 'BLOCKED_PROFILE_ROOT'
    | 'BLOCKED_WINDOWSAPPS_MSIX_ONLY'
    | 'BLOCKED_CONTAINER_ROOT'
    | 'BLOCKED_KERNEL_ANTICHEAT'
    | 'BLOCKED_ALREADY_REPARSE_POINT'
    | 'BLOCKED_TARGET_FILESYSTEM'
    | 'BLOCKED_TARGET_DRIVE_TYPE'
    | 'BLOCKED_INSUFFICIENT_SPACE'
    | 'BLOCKED_SAME_VOLUME'
    | 'BLOCKED_NESTED_PATH';
  message: string;
  ruleMatched?: string;
  requiredBytes?: number;
  availableBytes?: number;
}
