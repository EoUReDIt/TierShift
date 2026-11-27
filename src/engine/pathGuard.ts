import { DriveVolume, PathGuardCheckResult } from './types';

export interface PathGuardInput {
  sourcePath: string;
  targetPath: string;
  sourceSizeBytes: number;
  targetDrive: DriveVolume;
  isSourceReparsePoint?: boolean;
  isMsixNativeMove?: boolean;
}

const SYSTEM_PREFIXES = [
  'c:\\windows',
  '%systemroot%',
  'c:\\$recycle.bin',
  'c:\\system volume information',
  'c:\\boot',
  'c:\\efi',
  'c:\\recovery',
  'c:\\perflogs',
];

const EXACT_CONTAINER_ROOTS = [
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
  'c:\\users',
];

const KERNEL_ANTICHEAT_PATTERNS = [
  'riot vanguard',
  'easyanticheat',
  'easyanticheat_eos',
  'battleye',
  'faceit ac',
  'vgc.sys',
  'vgk.sys',
  'ricochet',
  'npggnt',
];

export function normalizeWindowsPath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase();
}

export function validatePathGuard(input: PathGuardInput): PathGuardCheckResult {
  const normSource = normalizeWindowsPath(input.sourcePath);
  const normTarget = normalizeWindowsPath(input.targetPath);

  if (!normSource) {
    return {
      allowed: false,
      code: 'BLOCKED_DRIVE_ROOT',
      message: 'Source path cannot be empty.',
      ruleMatched: 'PathGuard.EmptyPath',
    };
  }

  // 1. Drive roots (e.g., C: or C:\ or D:)
  if (/^[a-z]:$/.test(normSource)) {
    return {
      allowed: false,
      code: 'BLOCKED_DRIVE_ROOT',
      message: `Cannot relocate a drive root (${input.sourcePath}). Select an application or child directory.`,
      ruleMatched: 'Blocklist.DriveRoot',
    };
  }

  // 2. %SystemRoot% & OS reserved folders
  for (const sysPrefix of SYSTEM_PREFIXES) {
    if (normSource === sysPrefix || normSource.startsWith(sysPrefix + '\\')) {
      return {
        allowed: false,
        code: 'BLOCKED_SYSTEM_ROOT',
        message: `Path "${input.sourcePath}" is inside a protected Windows OS root (${sysPrefix.toUpperCase()}).`,
        ruleMatched: 'Blocklist.SystemRoot',
      };
    }
  }

  // 3. C:\Users\<User> root (profile root forbidden, only AppData subdirectories allowed)
  const userProfileRootRegex = /^[a-z]:\\users\\[^\\]+$/;
  if (userProfileRootRegex.test(normSource)) {
    return {
      allowed: false,
      code: 'BLOCKED_PROFILE_ROOT',
      message:
        'Cannot relocate a Windows user profile root (C:\\Users\\<User>). Target specific AppData subdirectories instead.',
      ruleMatched: 'Blocklist.UserProfileRoot',
    };
  }

  // 4. AppData container roots themselves
  const appDataRootRegex =
    /^[a-z]:\\users\\[^\\]+\\appdata(\\(local|locallow|roaming))?$/;
  if (appDataRootRegex.test(normSource)) {
    return {
      allowed: false,
      code: 'BLOCKED_CONTAINER_ROOT',
      message:
        'Cannot relocate the AppData, Local, LocalLow, or Roaming container root itself. Select a specific child folder.',
      ruleMatched: 'Blocklist.AppDataContainerRoot',
    };
  }

  // 5. C:\Program Files\WindowsApps — must route via native MSIX PackageManager
  if (
    normSource === 'c:\\program files\\windowsapps' ||
    normSource.startsWith('c:\\program files\\windowsapps\\')
  ) {
    if (!input.isMsixNativeMove) {
      return {
        allowed: false,
        routeViaMsix: true,
        code: 'BLOCKED_WINDOWSAPPS_MSIX_ONLY',
        message:
          'WindowsApps cannot be relocated with NTFS Junctions. Route via Windows.Management.Deployment.PackageManager.MovePackageToVolumeAsync.',
        ruleMatched: 'Blocklist.WindowsAppsMsixOnly',
      };
    }
  }

  // 6. Program Files / ProgramData container roots themselves
  if (EXACT_CONTAINER_ROOTS.includes(normSource)) {
    return {
      allowed: false,
      code: 'BLOCKED_CONTAINER_ROOT',
      message: `Container root "${input.sourcePath}" cannot be relocated. Only child application folders are permitted.`,
      ruleMatched: 'Blocklist.ContainerRoot',
    };
  }

  // 7. Kernel Anti-Cheat / Driver folders
  for (const antiCheat of KERNEL_ANTICHEAT_PATTERNS) {
    if (normSource.includes(antiCheat)) {
      return {
        allowed: false,
        code: 'BLOCKED_KERNEL_ANTICHEAT',
        message: `Kernel-level anti-cheat or boot driver path detected ("${antiCheat}"). Relocation is hard-blocked to prevent BSOD or driver signature failures.`,
        ruleMatched: `Blocklist.KernelDriver(${antiCheat})`,
      };
    }
  }

  // 8. Source already a Reparse Point
  if (input.isSourceReparsePoint) {
    return {
      allowed: false,
      code: 'BLOCKED_ALREADY_REPARSE_POINT',
      message:
        'Source path already has FileAttributes.ReparsePoint set. Nested junctions are disallowed.',
      ruleMatched: 'PreFlight.ReparsePointCheck',
    };
  }

  // 9. Same volume check
  const sourceDriveLetter = normSource.slice(0, 2);
  const targetDriveLetter = input.targetDrive.letter.toLowerCase();
  if (sourceDriveLetter === targetDriveLetter) {
    return {
      allowed: false,
      code: 'BLOCKED_SAME_VOLUME',
      message: `Target volume (${input.targetDrive.letter}) is the same as the source volume (${sourceDriveLetter.toUpperCase()}). Choose a secondary HDD tier.`,
      ruleMatched: 'PreFlight.DistinctVolume',
    };
  }

  // 10. Target drive must be local fixed disk
  if (input.targetDrive.driveType !== 'Fixed') {
    return {
      allowed: false,
      code: 'BLOCKED_TARGET_DRIVE_TYPE',
      message: `Target drive ${input.targetDrive.letter} is "${input.targetDrive.driveType}". NTFS junctions and MSIX volume moves require a local Fixed disk.`,
      ruleMatched: 'PreFlight.FixedDiskOnly',
    };
  }

  // 11. Target drive must be NTFS
  if (input.targetDrive.fileSystem !== 'NTFS') {
    return {
      allowed: false,
      code: 'BLOCKED_TARGET_FILESYSTEM',
      message: `Target drive ${input.targetDrive.letter} is formatted as ${input.targetDrive.fileSystem}. NTFS is strictly required for ACL preservation and reparse targets.`,
      ruleMatched: 'PreFlight.NtfsRequired',
    };
  }

  // 12. Target free space must be >= SourceSizeBytes * 1.10
  const requiredBytes = Math.ceil(input.sourceSizeBytes * 1.1);
  const availableBytes = Math.max(
    0,
    input.targetDrive.totalBytes - input.targetDrive.usedBytes
  );
  if (availableBytes < requiredBytes) {
    return {
      allowed: false,
      code: 'BLOCKED_INSUFFICIENT_SPACE',
      message: `Insufficient free space on ${input.targetDrive.letter}. Requires 110% safety headroom (${formatBytes(requiredBytes)}), but only ${formatBytes(availableBytes)} is available.`,
      ruleMatched: 'PreFlight.FreeSpace110Percent',
      requiredBytes,
      availableBytes,
    };
  }

  // Target path sanity
  if (!normTarget.startsWith(targetDriveLetter + '\\')) {
    return {
      allowed: false,
      code: 'BLOCKED_DRIVE_ROOT',
      message: `Target path must be a subdirectory on ${input.targetDrive.letter}.`,
      ruleMatched: 'PreFlight.TargetSubdir',
    };
  }

  return {
    allowed: true,
    code: 'OK',
    message: `All PathGuard blocklist rules and pre-flight checks passed (NTFS Fixed volume, 110% free headroom verified).`,
    requiredBytes,
    availableBytes,
  };
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(abs) / Math.log(k))
  );
  const value = abs / Math.pow(k, i);
  return `${sign}${value.toFixed(i >= 3 ? Math.max(dm, 1) : dm)} ${sizes[i]}`;
}
