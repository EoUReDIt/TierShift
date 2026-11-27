import {
  AttributionClassification,
  AttributionResult,
  FolderForensicInputs,
  InstalledApp,
  StageEvidence,
} from './types';
import { ECOSYSTEM_KB_RULES, PROTECTED_WHITELIST } from './ecosystemKb';

/**
 * Phase 2 interface stub for Stage 3 Deep Telemetry
 * (Prefetch *.pf parsing, NTFS MFT/USN Journal, NtQuerySystemInformation).
 */
export interface ITelemetrySignalProvider {
  getTelemetryScore(folderPath: string): {
    points: number;
    detail: string;
    deferred: boolean;
  };
}

export const phase1TelemetryStub: ITelemetrySignalProvider = {
  getTelemetryScore: () => ({
    points: 0,
    detail:
      'ITelemetrySignalProvider stub active (Prefetch *.pf, NTFS USN Journal & live handles deferred to Phase 2).',
    deferred: true,
  }),
};

/**
 * Strip noise prefixes/suffixes before Jaro-Winkler fuzzy comparison per spec:
 * strips `com.`, `{GUID}`, `-updater`, `Temp`, `_Cache`, etc.
 */
export function normalizeFolderToken(rawName: string): string {
  return rawName
    .replace(/\{[0-9a-fA-F-]{8,36}\}/g, '')
    .replace(/^com\./i, '')
    .replace(/^org\./i, '')
    .replace(/[-_.]updater$/i, '')
    .replace(/[-_.]cache$/i, '')
    .replace(/[-_.]temp$/i, '')
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Genuine Jaro-Winkler string similarity (0.0 to 1.0)
 * Used in Stage 4 with threshold >= 0.85 against ARP DisplayName / Publisher.
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  const a = s1.toLowerCase().trim();
  const b = s2.toLowerCase().trim();
  if (!a || !b) return 0;
  if (a === b) return 1;

  const lenA = a.length;
  const lenB = b.length;
  const matchWindow = Math.max(0, Math.floor(Math.max(lenA, lenB) / 2) - 1);

  const aMatches = new Array<boolean>(lenA).fill(false);
  const bMatches = new Array<boolean>(lenB).fill(false);

  let matches = 0;
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, lenB);
    for (let j = start; j < end; j++) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < lenA; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / lenA +
      matches / lenB +
      (matches - transpositions / 2) / matches) /
    3;

  // Winkler prefix bonus (up to 4 chars, p = 0.1)
  let prefix = 0;
  const maxPrefix = Math.min(4, lenA, lenB);
  for (let i = 0; i < maxPrefix; i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return Math.min(1, jaro + prefix * 0.1 * (1 - jaro));
}

function isProtectedWhitelistPath(folderPath: string, folderName: string): string | null {
  const normPath = folderPath.toLowerCase();
  const normName = folderName.toLowerCase();
  for (const entry of PROTECTED_WHITELIST) {
    const normEntry = entry.toLowerCase();
    if (
      normName === normEntry ||
      normPath.endsWith('\\' + normEntry) ||
      normPath.includes('\\' + normEntry + '\\')
    ) {
      return entry;
    }
  }
  return null;
}

/**
 * Executes the 5-Stage Mystery Folder Attribution Engine per Section 6 of the spec.
 */
export function analyzeFolder(
  folder: FolderForensicInputs,
  arpApps: InstalledApp[],
  telemetryProvider: ITelemetrySignalProvider = phase1TelemetryStub
): AttributionResult {
  const stages: StageEvidence[] = [];
  const summaryParts: string[] = [];

  let totalScore = 0;
  let resolvedAppName: string | null = null;
  let publisher: string | null = null;
  let stage1Matched = false;

  // STAGE 1: OS & Installer Forensics (+90)
  if (folder.arpExactMatch) {
    stage1Matched = true;
    totalScore += 90;
    resolvedAppName = folder.arpExactMatch.displayName;
    publisher = folder.arpExactMatch.publisher;

    const labelMap = {
      InstallLocation: 'ARP InstallLocation',
      MSI_Folders: 'MSI Installer\\Folders',
      MSIX_PackageFamily: 'MSIX PackageFamilyName',
    };
    const srcLabel = labelMap[folder.arpExactMatch.matchedVia];
    summaryParts.push(`${srcLabel} (+90)`);

    stages.push({
      stage: 1,
      stageTitle: 'OS & Installer Forensics',
      source: srcLabel,
      detail: `Exact match via ${folder.arpExactMatch.uninstallKey} -> ${folder.arpExactMatch.displayName}`,
      points: 90,
      matched: true,
    });
  } else {
    stages.push({
      stage: 1,
      stageTitle: 'OS & Installer Forensics',
      source: 'ARP Uninstall / MSI Folders / MSIX Packages',
      detail: 'No exact registry InstallLocation, MSI component folder, or MSIX FamilyName match.',
      points: 0,
      matched: false,
    });
  }

  // STAGE 2: Shallow Binary Inspection (Max depth 3, header-only) (+75 or +15 boost)
  if (folder.binaryInspection) {
    const bi = folder.binaryInspection;
    const hasIdentity = Boolean(
      bi.productName ||
        bi.authenticodeSubjectCN ||
        bi.packageJsonProductName ||
        bi.logHeaderHint
    );

    if (hasIdentity) {
      const pts = stage1Matched ? 15 : 75;
      totalScore += pts;

      if (!resolvedAppName) {
        resolvedAppName =
          bi.productName || bi.packageJsonProductName || bi.logHeaderHint || null;
      }
      if (!publisher) {
        publisher = bi.companyName || bi.authenticodeSubjectCN || null;
      }

      const sourceLabel = bi.authenticodeSubjectCN
        ? 'Authenticode + PE Header'
        : bi.packageJsonProductName
          ? 'package.json metadata'
          : 'PE FileVersionInfo / Log';

      summaryParts.push(`${sourceLabel} (+${pts})`);

      const details: string[] = [`Scanned ${bi.scannedFile} (depth <= 3)`];
      if (bi.productName) details.push(`ProductName="${bi.productName}"`);
      if (bi.authenticodeSubjectCN)
        details.push(`Signer CN="${bi.authenticodeSubjectCN}"`);
      if (bi.packageJsonProductName)
        details.push(`package.json="${bi.packageJsonProductName}"`);
      if (bi.logHeaderHint) details.push(`Log header="${bi.logHeaderHint}"`);

      stages.push({
        stage: 2,
        stageTitle: 'Shallow Binary Inspection',
        source: sourceLabel,
        detail: details.join(' · '),
        points: pts,
        matched: true,
      });
    } else {
      stages.push({
        stage: 2,
        stageTitle: 'Shallow Binary Inspection',
        source: 'PE Headers / X509 Cert / package.json',
        detail: 'No signed PE binaries, package.json, or identifiable log headers found within depth 3.',
        points: 0,
        matched: false,
      });
    }
  } else {
    stages.push({
      stage: 2,
      stageTitle: 'Shallow Binary Inspection',
      source: 'PE Headers / X509 Cert / package.json',
      detail: 'Folder contains raw data/cache blobs without PE headers or package manifests.',
      points: 0,
      matched: false,
    });
  }

  // STAGE 3: Temporal & Telemetry (Phase 2 stub)
  const telemetry = telemetryProvider.getTelemetryScore(folder.folderPath);
  stages.push({
    stage: 3,
    stageTitle: 'Temporal & Telemetry',
    source: 'ITelemetrySignalProvider',
    detail: telemetry.detail,
    points: telemetry.points,
    matched: false,
    deferred: telemetry.deferred,
  });

  // STAGE 4: Knowledge Graph (ecosystem_kb.json +70) & Jaro-Winkler Fuzzy (+50)
  const normFolderName = folder.folderName.toLowerCase();
  const normFullPath = folder.folderPath.toLowerCase();

  const kbRule = ECOSYSTEM_KB_RULES.find((rule) => {
    const p = rule.pattern.toLowerCase();
    if (rule.matchType === 'exact') return normFolderName === p;
    if (rule.matchType === 'prefix') return normFolderName.startsWith(p);
    return normFolderName.includes(p) || normFullPath.includes(p);
  });

  let fuzzyResult: AttributionResult['fuzzyMatch'] | undefined;
  const cleanedToken = normalizeFolderToken(folder.folderName);

  // Check Jaro-Winkler against ARP DisplayNames & Publishers (threshold >= 0.85)
  let bestSim = 0;
  let bestApp: InstalledApp | null = null;
  let bestTarget = '';

  if (cleanedToken.length >= 3) {
    for (const app of arpApps) {
      const candidates = [
        app.displayName,
        app.publisher,
        app.displayName.split(' ')[0],
      ];
      for (const candidate of candidates) {
        const cleanCand = normalizeFolderToken(candidate);
        if (!cleanCand || cleanCand.length < 3) continue;
        const sim = jaroWinklerSimilarity(cleanedToken, cleanCand);
        if (sim > bestSim) {
          bestSim = sim;
          bestApp = app;
          bestTarget = candidate;
        }
      }
    }
  }

  if (kbRule) {
    const kbPoints = totalScore === 0 ? 70 : Math.min(20, 100 - totalScore);
    totalScore += kbPoints;
    if (!resolvedAppName) resolvedAppName = kbRule.appName;
    if (!publisher) publisher = kbRule.publisher;
    summaryParts.push(`ecosystem_kb.json (+${kbPoints})`);
    stages.push({
      stage: 4,
      stageTitle: 'Knowledge Graph & Fuzzy Match',
      source: 'ecosystem_kb.json',
      detail: `Matched rule "${kbRule.pattern}" -> ${kbRule.appName} (${kbRule.category}). ${kbRule.notes}`,
      points: kbPoints,
      matched: true,
    });
  } else if (bestSim >= 0.85 && bestApp) {
    const fuzzyPts = totalScore === 0 ? 50 : Math.min(15, 100 - totalScore);
    totalScore += fuzzyPts;
    if (!resolvedAppName) resolvedAppName = bestApp.displayName;
    if (!publisher) publisher = bestApp.publisher;
    fuzzyResult = {
      normalizedToken: cleanedToken,
      matchedTarget: bestTarget,
      similarity: Number(bestSim.toFixed(3)),
    };
    summaryParts.push(`Jaro-Winkler ${bestSim.toFixed(2)} (+${fuzzyPts})`);
    stages.push({
      stage: 4,
      stageTitle: 'Knowledge Graph & Fuzzy Match',
      source: 'Jaro-Winkler Similarity',
      detail: `Token "${cleanedToken}" matched ARP "${bestTarget}" with similarity ${bestSim.toFixed(3)} (>= 0.85 threshold).`,
      points: fuzzyPts,
      matched: true,
    });
  } else {
    stages.push({
      stage: 4,
      stageTitle: 'Knowledge Graph & Fuzzy Match',
      source: 'ecosystem_kb.json + Jaro-Winkler',
      detail:
        bestSim > 0
          ? `No KB rule match. Closest Jaro-Winkler candidate "${bestTarget}" scored ${bestSim.toFixed(2)} (below 0.85 threshold).`
          : 'No KB rule match and no fuzzy candidates above 0.85 threshold.',
      points: 0,
      matched: false,
    });
  }

  // Cap confidence score at 100
  const confidenceScore = Math.min(100, totalScore);

  // STAGE 5: Classification & Protection
  const protectedMatch = isProtectedWhitelistPath(
    folder.folderPath,
    folder.folderName
  );

  let classification: AttributionClassification = 'Unknown';
  let stage5Detail = '';

  const fiveHundredMB = 500 * 1024 * 1024;

  if (protectedMatch) {
    classification = 'Protected';
    if (!resolvedAppName) {
      resolvedAppName = protectedMatch.includes('NVIDIA')
        ? 'NVIDIA DirectX Shader Cache'
        : protectedMatch.includes('AMD')
          ? 'AMD DirectX Shader Cache'
          : protectedMatch === 'EBWebView'
            ? 'Microsoft Edge WebView2 Runtime'
            : `Windows Protected Cache (${protectedMatch})`;
    }
    if (!publisher) {
      publisher = protectedMatch.includes('NVIDIA')
        ? 'NVIDIA Corporation'
        : protectedMatch.includes('AMD')
          ? 'AMD Inc.'
          : 'Microsoft Corporation';
    }
    stage5Detail = `Matched Protected Whitelist entry "${protectedMatch}". Offloading disabled to protect GPU shader/runtime stability.`;
  } else if (
    confidenceScore >= 60 &&
    !folder.hasMatchingArpKey &&
    !folder.hasRunningService &&
    !folder.hasProgramFilesExe &&
    folder.lastModifiedDaysAgo >= 60
  ) {
    classification = 'Orphaned';
    stage5Detail = `Confidence ${confidenceScore}% >= 60%, zero matching ARP keys, zero services, zero Program Files executables, untouched ${folder.lastModifiedDaysAgo} days (>= 60d). Safe orphan candidate.`;
  } else if (
    folder.hasMatchingArpKey &&
    folder.lastModifiedDaysAgo >= 90 &&
    folder.sizeBytes >= fiveHundredMB
  ) {
    classification = 'Dormant';
    stage5Detail = `Parent app installed, untouched ${folder.lastModifiedDaysAgo} days (>= 90d), footprint >= 500 MB. Recommended for HDD offload.`;
  } else if (confidenceScore >= 50) {
    classification = 'Active';
    stage5Detail = `Parent app active (touched ${folder.lastModifiedDaysAgo}d ago). Eligible for transparent NTFS Junction offload to HDD.`;
  } else {
    classification = 'Unknown';
    stage5Detail = `Insufficient forensic confidence (${confidenceScore}%). Inspect contents manually before moving or deleting.`;
  }

  stages.push({
    stage: 5,
    stageTitle: 'Classification & Protection',
    source: 'Policy & Orphan Heuristics',
    detail: stage5Detail,
    points: 0,
    matched: true,
  });

  return {
    folderPath: folder.folderPath,
    resolvedAppName,
    publisher,
    confidenceScore: protectedMatch ? Math.max(confidenceScore, 95) : confidenceScore,
    evidenceSummary:
      summaryParts.length > 0
        ? summaryParts.join(', ')
        : protectedMatch
          ? `Protected Whitelist (${protectedMatch})`
          : 'No high-confidence signals',
    classification,
    sizeBytes: folder.sizeBytes,
    lastScannedUtc: new Date().toISOString(),
    stages,
    fuzzyMatch: fuzzyResult,
  };
}
