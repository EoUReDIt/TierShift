import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  ClassificationStatus,
  ClassifiedArtifact,
  generateMoveManifestCsv,
  HISTORICAL_NEGATIVE_EVIDENCE,
  INITIAL_ONEDRIVE_ARTIFACTS,
  MoveAction,
  RawArtifactInput,
  RECOVERED_COURSES_CATALOG,
  runInferenceSortingEngine,
} from '../engine/inferenceSortingEngine';
import { formatBytes } from '../engine/pathGuard';

type SorterTab = 'queue' | 'clusters' | 'historical' | 'manifest';
type StatusFilter = 'All' | ClassificationStatus;

interface InferenceSorterViewProps {
  onNotify: (message: string) => void;
}

const STATUS_TEXT_CLASS: Record<ClassificationStatus, string> = {
  Verified: 'text-emerald-700 dark:text-emerald-400',
  Probable: 'text-amber-700 dark:text-amber-400',
  Unknown: 'text-[#5E6775] dark:text-[#9AA4B2]',
  Historical: 'text-[#0067C0] dark:text-[#60CDFF]',
};

export const InferenceSorterView: React.FC<InferenceSorterViewProps> = ({
  onNotify,
}) => {
  const [rawInputs, setRawInputs] = useState<RawArtifactInput[]>(
    INITIAL_ONEDRIVE_ARTIFACTS
  );
  const [overrides, setOverrides] = useState<
    Record<
      string,
      {
        status: ClassificationStatus;
        moveAction: MoveAction;
        destinationFolder?: string;
      }
    >
  >({});

  const [activeTab, setActiveTab] = useState<SorterTab>('queue');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    INITIAL_ONEDRIVE_ARTIFACTS[1].id
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedCsv, setCopiedCsv] = useState(false);

  // Custom artifact intake form state
  const [draftName, setDraftName] = useState('');
  const [draftFolder, setDraftFolder] = useState('OneDrive\\Recovered');
  const [draftDate, setDraftDate] = useState('2025-02-20');
  const [draftExcerpt, setDraftExcerpt] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const report = useMemo(
    () => runInferenceSortingEngine(rawInputs, overrides),
    [rawInputs, overrides]
  );

  const counts = useMemo(() => {
    const verified = report.artifacts.filter(
      (a) => a.status === 'Verified'
    ).length;
    const probable = report.artifacts.filter(
      (a) => a.status === 'Probable'
    ).length;
    const unknown = report.artifacts.filter(
      (a) => a.status === 'Unknown'
    ).length;
    const historical =
      report.artifacts.filter((a) => a.status === 'Historical').length +
      HISTORICAL_NEGATIVE_EVIDENCE.length;
    return { verified, probable, unknown, historical };
  }, [report.artifacts]);

  const categories = useMemo(() => {
    const set = new Set<string>(report.artifacts.map((a) => a.category));
    return ['All', ...Array.from(set).sort()];
  }, [report.artifacts]);

  const filteredArtifacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return report.artifacts.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && a.category !== categoryFilter)
        return false;
      if (!q) return true;
      return (
        a.fileName.toLowerCase().includes(q) ||
        a.destinationFolder.toLowerCase().includes(q) ||
        a.subCategory.toLowerCase().includes(q) ||
        a.notes.toLowerCase().includes(q)
      );
    });
  }, [report.artifacts, statusFilter, categoryFilter, searchQuery]);

  const selectedArtifact: ClassifiedArtifact | undefined = useMemo(() => {
    return (
      report.artifacts.find((a) => a.id === selectedId) ||
      filteredArtifacts[0] ||
      report.artifacts[0]
    );
  }, [report.artifacts, selectedId, filteredArtifacts]);

  const csvOutput = useMemo(
    () => generateMoveManifestCsv(report.artifacts),
    [report.artifacts]
  );

  const handleOverride = (
    artifact: ClassifiedArtifact,
    nextStatus: ClassificationStatus,
    nextAction: MoveAction
  ) => {
    setOverrides((prev) => ({
      ...prev,
      [artifact.id]: {
        status: nextStatus,
        moveAction: nextAction,
      },
    }));
    onNotify(
      `Updated "${artifact.fileName}" -> ${nextStatus} (${nextAction}). Confidence always overrides automation.`
    );
  };

  const handleAddCustomArtifact = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = draftName.trim();
    if (!trimmedName) return;

    const nextBatch =
      Math.max(3, ...rawInputs.map((i) => i.batchNumber ?? 1)) + 1;
    const newId = `art-custom-${Date.now()}`;
    const cleanFolder = draftFolder.trim() || 'OneDrive\\Intake';
    const parentName = cleanFolder.split(/[\\/]/).filter(Boolean).pop() || 'Intake';

    const newArtifact: RawArtifactInput = {
      id: newId,
      fileName: trimmedName,
      sourcePath: `${cleanFolder.replace(/[\\/]+$/, '')}\\${trimmedName}`,
      parentFolder: parentName,
      modifiedDate: draftDate || new Date().toISOString().slice(0, 10),
      sizeBytes: Math.max(4096, draftExcerpt.length * 64),
      contentExcerpt: draftExcerpt.trim(),
      topics: [],
      batchNumber: nextBatch,
    };

    setRawInputs((prev) => [newArtifact, ...prev]);
    setSelectedId(newId);
    setDraftName('');
    setDraftExcerpt('');
    setShowAddForm(false);
    setActiveTab('queue');
    onNotify(
      `Evaluated "${trimmedName}" through the v37 8-rule inference pipeline (Batch ${nextBatch}).`
    );
  };

  const handleImportLocalFiles = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const nextBatch =
      Math.max(3, ...rawInputs.map((i) => i.batchNumber ?? 1)) + 1;
    const imported: RawArtifactInput[] = [];
    const textExts = /\.(txt|md|java|py|cs|html?|json|csv|xml|rtf|mht|sql|ts|js)$/i;

    const limit = Math.min(fileList.length, 40);
    for (let i = 0; i < limit; i++) {
      const f = fileList[i];
      let excerpt = '';
      if (textExts.test(f.name) && f.size <= 512 * 1024) {
        try {
          excerpt = (await f.text()).slice(0, 1200);
        } catch {
          excerpt = '';
        }
      }
      const relPath = f.webkitRelativePath || `LocalImport\\${f.name}`;
      const parts = relPath.split(/[\\/]/);
      const parent = parts.length > 1 ? parts[parts.length - 2] : 'LocalImport';

      imported.push({
        id: `art-local-${Date.now()}-${i}`,
        fileName: f.name,
        sourcePath: relPath.replace(/\//g, '\\'),
        parentFolder: parent,
        modifiedDate: new Date(f.lastModified).toISOString().slice(0, 10),
        sizeBytes: f.size,
        contentExcerpt: excerpt,
        topics: [],
        batchNumber: nextBatch,
      });
    }

    if (imported.length > 0) {
      setRawInputs((prev) => [...imported, ...prev]);
      setSelectedId(imported[0].id);
      setActiveTab('queue');
      onNotify(
        `Scanned ${imported.length} local file${imported.length > 1 ? 's' : ''} using content & folder evidence (Batch ${nextBatch}).`
      );
    }

    e.target.value = '';
  };

  const handleResetInventory = () => {
    setRawInputs(INITIAL_ONEDRIVE_ARTIFACTS);
    setOverrides({});
    setSelectedId(INITIAL_ONEDRIVE_ARTIFACTS[1].id);
    onNotify('Reset inference queue to v37 reconstructed baseline.');
  };

  const handleDownloadCsv = () => {
    const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TierShift_MoveManifest_v37_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('Downloaded v37 Move Manifest CSV (8-column standard).');
  };

  const handleCopyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csvOutput);
      setCopiedCsv(true);
      onNotify('Copied Move Manifest CSV to clipboard.');
      window.setTimeout(() => setCopiedCsv(false), 2000);
    } catch {
      onNotify('Clipboard copy blocked by browser; use Download CSV instead.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight text-[#171B21] dark:text-white">
            Evidence-Based Inference Sorting Engine
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
            Recovery First · Verification Second · Organization Third ·
            Automation Last. Files are never moved by filename alone —
            classification requires convergent Explicit, Subject, Cluster,
            Temporal, and Version evidence.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleImportLocalFiles}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#1E222B] dark:text-[#EEF1F5] dark:hover:bg-[#262B36]"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Scan Local Files</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((s) => !s)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] transition-colors hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#1E222B] dark:text-[#EEF1F5] dark:hover:bg-[#262B36]"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Test Artifact</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#0067C0] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A] dark:hover:bg-[#4BBDF2]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Manifest CSV</span>
          </button>
        </div>
      </div>

      {/* Collapsible Custom Artifact Intake Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddCustomArtifact}
          className="rounded-xl border border-[#DCE2EA] bg-white p-5 dark:border-[#2A303C] dark:bg-[#1B1F27]"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#171B21] dark:text-white">
              Evaluate Custom Artifact Through v37 Pipeline
            </h3>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-xs text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                Filename
              </label>
              <input
                type="text"
                required
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="e.g. Week 4 Notes.html or content.rtf"
                className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-1.5 text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#14171D] dark:text-[#EEF1F5]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                Source Folder Path
              </label>
              <input
                type="text"
                value={draftFolder}
                onChange={(e) => setDraftFolder(e.target.value)}
                className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-1.5 font-mono text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#14171D] dark:text-[#EEF1F5]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                Modified Date
              </label>
              <input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-1.5 font-mono text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#14171D] dark:text-[#EEF1F5]"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
              Content Excerpt / Subject Evidence (leave blank to test filename-only rejection)
            </label>
            <textarea
              rows={2}
              value={draftExcerpt}
              onChange={(e) => setDraftExcerpt(e.target.value)}
              placeholder="Paste course code, subject terms (e.g. Recursive Descent, PK/FK, JavaFX, Revature PET, Sherweb), or project references..."
              className="w-full rounded-lg border border-[#D8DEE6] bg-[#F8FAFC] px-3 py-2 text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#323846] dark:bg-[#14171D] dark:text-[#EEF1F5]"
            />
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0067C0] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Run Evidence Classifier</span>
            </button>
          </div>
        </form>
      )}

      {/* 4-Column v37 Disposition KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-[#E2E6EC] bg-white p-4 dark:border-[#262C38] dark:bg-[#1B1F27]">
          <div className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            Verified · Move Eligible
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {counts.verified}
          </div>
          <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
            Confidence 90–100 · Action: MOVE
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E6EC] bg-white p-4 dark:border-[#262C38] dark:bg-[#1B1F27]">
          <div className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            Probable · Staging Review
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {counts.probable}
          </div>
          <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
            Confidence 75–89 · Action: REVIEW
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E6EC] bg-white p-4 dark:border-[#262C38] dark:bg-[#1B1F27]">
          <div className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            Unknown · Held in Unsorted
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
            {counts.unknown}
          </div>
          <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
            Confidence &lt; 75 · Action: HOLD
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E6EC] bg-white p-4 dark:border-[#262C38] dark:bg-[#1B1F27]">
          <div className="text-xs text-[#5E6775] dark:text-[#9AA4B2]">
            Historical · Reference Only
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[#0067C0] dark:text-[#60CDFF]">
            {counts.historical}
          </div>
          <div className="mt-1 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
            {report.stopConditionReached
              ? 'Stop Condition Met (2 zero-yield passes)'
              : 'Active reconstruction passes'}
          </div>
        </div>
      </div>

      {/* Segmented Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E6EC] pb-3 dark:border-[#262C38]">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-[#EDF1F6] p-1 dark:bg-[#15181E]">
          {(
            [
              { id: 'queue', label: `Artifact Queue (${report.artifacts.length})` },
              { id: 'clusters', label: `Clusters & Versions (${report.clusters.length})` },
              { id: 'historical', label: 'Course Ledger & Stop Condition' },
              { id: 'manifest', label: 'Move Manifest CSV' },
            ] as { id: SorterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-[#171B21] shadow-xs dark:bg-[#242933] dark:text-white'
                  : 'text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleResetInventory}
          className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[#5E6775] hover:text-[#171B21] dark:text-[#9AA4B2] dark:hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Baseline</span>
        </button>
      </div>

      {/* TAB 1: ARTIFACT QUEUE & LIVE EVIDENCE BREAKDOWN */}
      {activeTab === 'queue' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          {/* Left 7 cols: Search, Filters & High-Density Table */}
          <div className="space-y-3 xl:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#5E6775]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by filename, course ID, destination, or evidence..."
                  className="w-full rounded-lg border border-[#D8DEE6] bg-white py-1.5 pr-3 pl-8 text-xs text-[#171B21] focus:border-[#0067C0] focus:outline-none dark:border-[#2E3440] dark:bg-[#1B1F27] dark:text-[#EEF1F5]"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                aria-label="Filter by classification status"
                className="rounded-lg border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs text-[#171B21] dark:border-[#2E3440] dark:bg-[#1B1F27] dark:text-[#EEF1F5]"
              >
                <option value="All">All Statuses</option>
                <option value="Verified">Verified (MOVE)</option>
                <option value="Probable">Probable (REVIEW)</option>
                <option value="Unknown">Unknown (HOLD)</option>
                <option value="Historical">Historical (REFERENCE)</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by inventory category"
                className="rounded-lg border border-[#D8DEE6] bg-white px-2.5 py-1.5 text-xs text-[#171B21] dark:border-[#2E3440] dark:bg-[#1B1F27] dark:text-[#EEF1F5]"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#E2E6EC] bg-white dark:border-[#262C38] dark:bg-[#1B1F27]">
              <div className="max-h-[580px] overflow-y-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-[#E2E6EC] bg-[#F8FAFC] text-[11px] font-medium text-[#5E6775] dark:border-[#262C38] dark:bg-[#15181E] dark:text-[#9AA4B2]">
                    <tr>
                      <th className="px-3.5 py-2.5">Artifact &amp; Destination</th>
                      <th className="px-3 py-2.5 text-right">Score</th>
                      <th className="px-3 py-2.5">Disposition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
                    {filteredArtifacts.map((item) => {
                      const isSelected = selectedArtifact?.id === item.id;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#EAF3FC] dark:bg-[#1F2D3D]'
                              : 'hover:bg-[#F8FAFC] dark:hover:bg-[#212630]'
                          }`}
                        >
                          <td className="px-3.5 py-2.5">
                            <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                              {item.fileName}
                            </div>
                            <div className="mt-0.5 truncate max-w-[360px] font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                              {item.destinationFolder}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                              <span>{item.category}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {item.modifiedDate}
                              </span>
                              {item.clusterLabel && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{item.clusterLabel}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right align-top font-mono font-semibold tabular-nums text-[#171B21] dark:text-[#EEF1F5]">
                            {item.confidence}
                          </td>
                          <td className="px-3 py-2.5 align-top whitespace-nowrap">
                            <div
                              className={`font-medium ${STATUS_TEXT_CLASS[item.status]}`}
                            >
                              {item.status}
                            </div>
                            <div className="font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                              {item.moveAction}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredArtifacts.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-10 text-center text-xs text-[#5E6775] dark:text-[#9AA4B2]"
                        >
                          No artifacts match the active search or filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right 5 cols: Multi-Signal Evidence Inspector & Manual Review Controls */}
          <div className="xl:col-span-5">
            {selectedArtifact ? (
              <div className="space-y-4 rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#262C38] dark:bg-[#1B1F27]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                      Batch {selectedArtifact.batchNumber} ·{' '}
                      {formatBytes(selectedArtifact.sizeBytes)} ·{' '}
                      {selectedArtifact.modifiedDate}
                    </div>
                    <h3 className="mt-0.5 break-all font-display text-base font-bold text-[#171B21] dark:text-white">
                      {selectedArtifact.fileName}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-2xl font-bold tabular-nums text-[#171B21] dark:text-white">
                      {selectedArtifact.confidence}
                    </div>
                    <div
                      className={`text-xs font-medium ${STATUS_TEXT_CLASS[selectedArtifact.status]}`}
                    >
                      {selectedArtifact.status} · {selectedArtifact.moveAction}
                    </div>
                  </div>
                </div>

                {/* Source & Destination Paths */}
                <div className="space-y-2 border-t border-[#EEF1F5] pt-3 text-xs dark:border-[#262C38]">
                  <div>
                    <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                      Source File
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-[#171B21] dark:text-[#D1D5DB]">
                      {selectedArtifact.sourceFile}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                      Assigned Verified Inventory Destination
                    </div>
                    <div className="mt-0.5 break-all font-mono text-[11px] font-medium text-[#0067C0] dark:text-[#60CDFF]">
                      {selectedArtifact.destinationFolder}
                    </div>
                  </div>
                  {selectedArtifact.secondaryClassification && (
                    <div>
                      <div className="text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                        Secondary Classification (Rule 4 Inheritance)
                      </div>
                      <div className="mt-0.5 text-xs text-[#171B21] dark:text-[#EEF1F5]">
                        {selectedArtifact.secondaryClassification}
                      </div>
                    </div>
                  )}
                </div>

                {/* Confidence Formula Signal Breakdown */}
                <div className="border-t border-[#EEF1F5] pt-3 dark:border-[#262C38]">
                  <div className="mb-2 text-xs font-semibold text-[#171B21] dark:text-white">
                    Confidence Signal Breakdown
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Explicit Assignment
                      </span>
                      <span className="font-mono tabular-nums">
                        +{selectedArtifact.signals.explicitAssignment}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Subject Match
                      </span>
                      <span className="font-mono tabular-nums">
                        +{selectedArtifact.signals.subjectMatch}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Cluster Relationship
                      </span>
                      <span className="font-mono tabular-nums">
                        +{selectedArtifact.signals.clusterMatch}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Temporal Window
                      </span>
                      <span className="font-mono tabular-nums">
                        +{selectedArtifact.signals.temporalMatch}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Version Match
                      </span>
                      <span className="font-mono tabular-nums">
                        +{selectedArtifact.signals.versionMatch}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5E6775] dark:text-[#9AA4B2]">
                        Contradictory Penalty
                      </span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        -{selectedArtifact.signals.contradictoryPenalty}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Triggered Proof-of-Concept Rules */}
                <div className="border-t border-[#EEF1F5] pt-3 dark:border-[#262C38]">
                  <div className="mb-1.5 text-xs font-semibold text-[#171B21] dark:text-white">
                    Convergent Inference Rules Applied
                  </div>
                  <ul className="space-y-1 text-xs text-[#374151] dark:text-[#CBD5E1]">
                    {selectedArtifact.appliedRules.map((rule) => (
                      <li key={rule} className="leading-snug">
                        · {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Supporting Evidence Log */}
                <div className="border-t border-[#EEF1F5] pt-3 dark:border-[#262C38]">
                  <div className="mb-1.5 text-xs font-semibold text-[#171B21] dark:text-white">
                    Supporting Evidence
                  </div>
                  <ul className="space-y-1.5 text-xs leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
                    {selectedArtifact.evidenceNotes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>

                {/* Human Verification Gate ("Classification confidence always overrides automation") */}
                <div className="border-t border-[#EEF1F5] pt-3 dark:border-[#262C38]">
                  <div className="mb-2 text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                    Manual Verification Gate
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleOverride(selectedArtifact, 'Verified', 'MOVE')
                      }
                      className="rounded-lg bg-[#0067C0] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A]"
                    >
                      Verify (MOVE)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleOverride(selectedArtifact, 'Probable', 'REVIEW')
                      }
                      className="rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5]"
                    >
                      Stage Probable
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleOverride(selectedArtifact, 'Unknown', 'HOLD')
                      }
                      className="rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#5E6775] hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#9AA4B2]"
                    >
                      Hold Unsorted
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 2: CLUSTERS & VERSION FAMILIES (RULES 3, 5, 6) */}
      {activeTab === 'clusters' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {report.clusters.map((cluster) => (
            <div
              key={cluster.clusterId}
              className="rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#262C38] dark:bg-[#1B1F27]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                    <Layers className="h-3.5 w-3.5" />
                    <span>
                      {cluster.category} · {cluster.memberFiles.length} linked
                      files
                    </span>
                  </div>
                  <h3 className="mt-1 font-display text-base font-bold text-[#171B21] dark:text-white">
                    {cluster.label}
                  </h3>
                </div>
                <div className="text-right font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {cluster.clusterConfidence} · {cluster.status}
                </div>
              </div>

              <div className="mt-2 font-mono text-[11px] text-[#0067C0] dark:text-[#60CDFF]">
                {cluster.destinationFolder}
              </div>

              <div className="mt-3 border-t border-[#EEF1F5] pt-3 dark:border-[#262C38]">
                <div className="mb-1.5 text-[11px] font-medium text-[#5E6775] dark:text-[#9AA4B2]">
                  Reconstructed Cluster Members
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-[#171B21] dark:text-[#EEF1F5]">
                  {cluster.memberFiles.map((file) => (
                    <span key={file}>{file}</span>
                  ))}
                </div>
              </div>

              <div className="mt-3 border-t border-[#EEF1F5] pt-2.5 text-[11px] text-[#5E6775] dark:border-[#262C38] dark:text-[#9AA4B2]">
                {cluster.sharedSignals.slice(0, 3).join(' · ')}
              </div>
            </div>
          ))}

          {/* Verified Inventory Hierarchy Reference */}
          <div className="rounded-xl border border-[#E2E6EC] bg-white p-5 lg:col-span-2 dark:border-[#262C38] dark:bg-[#1B1F27]">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#171B21] dark:text-white">
              <FolderOpen className="h-4 w-4 text-[#0067C0] dark:text-[#60CDFF]" />
              <span>Verified Inventory Root &amp; Category Priority Hierarchy (Rule 7)</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 text-xs md:grid-cols-3">
              <div>
                <div className="font-semibold text-[#171B21] dark:text-white">
                  1. Academic Hierarchy
                </div>
                <pre className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
{`Verified Inventory/Academic/
├── University Coursework (Priority 1)
├── Professional Training (Priority 2)
├── Self-Paced Learning (Priority 3)
├── Self-Directed Practice (Priority 4)
└── Academic Support Material`}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-[#171B21] dark:text-white">
                  2. Career Structure
                </div>
                <pre className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
{`Verified Inventory/Career/
├── Resume Workspace (Newest Wins)
├── Applications / Interviews
├── Employers (SherWeb Library)
├── Security Clearance (SF-86)
└── References & Employment History`}
                </pre>
              </div>
              <div>
                <div className="font-semibold text-[#171B21] dark:text-white">
                  3. Hold &amp; Review Buckets
                </div>
                <pre className="mt-1.5 font-mono text-[11px] leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
{`Verified Inventory/
├── Staging-Probable (75–89 REVIEW)
├── Unsorted (<75 HOLD)
└── Reference Only (Historical)`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RECOVERED COURSES, NEGATIVE EVIDENCE & STOP CONDITION (RULE 8) */}
      {activeTab === 'historical' && (
        <div className="space-y-5">
          {/* Batch Yield & Stop Condition Table */}
          <div className="rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#262C38] dark:bg-[#1B1F27]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[#171B21] dark:text-white">
                  Batch Reconstruction Yield &amp; Stop Condition Monitor
                </h3>
                <p className="mt-0.5 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                  Reconstruction terminates when 2 consecutive batches produce
                  zero new course mappings, zero new category mappings, and zero
                  new verified artifacts.
                </p>
              </div>
              <div
                className={`font-mono text-xs font-semibold ${
                  report.stopConditionReached
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {report.stopConditionReached
                  ? 'STOP CONDITION REACHED — RECONSTRUCTION COMPLETE'
                  : 'RECONSTRUCTION IN PROGRESS'}
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="border-b border-[#E2E6EC] text-[11px] text-[#5E6775] dark:border-[#262C38] dark:text-[#9AA4B2]">
                  <tr>
                    <th className="py-2 pr-4">Batch</th>
                    <th className="py-2 px-3 text-right">Processed</th>
                    <th className="py-2 px-3 text-right">New Courses</th>
                    <th className="py-2 px-3 text-right">New Categories</th>
                    <th className="py-2 px-3 text-right">New Verified</th>
                    <th className="py-2 pl-3 text-right">Yield</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF1F5] dark:divide-[#242933]">
                  {report.batches.map((b) => (
                    <tr key={b.batchNumber}>
                      <td className="py-2 pr-4 font-medium text-[#171B21] dark:text-[#EEF1F5]">
                        {b.label}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {b.artifactsProcessed}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {b.newCourseMappings}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {b.newCategoryMappings}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">
                        {b.newVerifiedArtifacts}
                      </td>
                      <td
                        className={`py-2 pl-3 text-right font-mono text-[11px] ${
                          b.zeroYield
                            ? 'text-[#5E6775] dark:text-[#9AA4B2]'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {b.zeroYield ? 'Zero Yield' : 'Active Yield'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recovered vs Partially / Not Recovered Courses + Negative Evidence */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="rounded-xl border border-[#E2E6EC] bg-white p-5 lg:col-span-7 dark:border-[#262C38] dark:bg-[#1B1F27]">
              <h3 className="text-sm font-semibold text-[#171B21] dark:text-white">
                University Course Recovery Matrix
              </h3>
              <div className="mt-3 divide-y divide-[#EEF1F5] text-xs dark:divide-[#242933]">
                {RECOVERED_COURSES_CATALOG.map((course) => (
                  <div
                    key={course.code}
                    className="flex items-start justify-between gap-4 py-2"
                  >
                    <div>
                      <div className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                        <span className="font-mono">{course.code}</span> ·{' '}
                        {course.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                        {course.evidenceSummary}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 font-mono text-[11px] font-medium ${
                        course.status === 'Recovered'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : course.status === 'Partially Recovered'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#5E6775] dark:text-[#9AA4B2]'
                      }`}
                    >
                      {course.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#E2E6EC] bg-white p-5 lg:col-span-5 dark:border-[#262C38] dark:bg-[#1B1F27]">
              <h3 className="text-sm font-semibold text-[#171B21] dark:text-white">
                Rule 8 · Negative Evidence (Historical Reference)
              </h3>
              <p className="mt-1 text-xs text-[#5E6775] dark:text-[#9AA4B2]">
                Repeated failed recovery passes become evidence themselves —
                preserved as Reference Only instead of making unsupported
                assignments.
              </p>
              <div className="mt-3 divide-y divide-[#EEF1F5] dark:divide-[#242933]">
                {HISTORICAL_NEGATIVE_EVIDENCE.map((rec) => (
                  <div key={rec.id} className="py-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-[#171B21] dark:text-[#EEF1F5]">
                        {rec.label}
                      </span>
                      <span className="font-mono text-[11px] text-[#0067C0] dark:text-[#60CDFF]">
                        REFERENCE
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                      {rec.domain} · {rec.state} · {rec.passesCompleted} passes
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#5E6775] dark:text-[#9AA4B2]">
                      {rec.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MOVE MANIFEST STANDARD CSV */}
      {activeTab === 'manifest' && (
        <div className="rounded-xl border border-[#E2E6EC] bg-white p-5 dark:border-[#262C38] dark:bg-[#1B1F27]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#171B21] dark:text-white">
                v37 Move Manifest Standard (CSV)
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-[#5E6775] dark:text-[#9AA4B2]">
                SourceFile,DestinationFolder,Category,SubCategory,Confidence,Status,MoveAction,Notes
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8DEE6] bg-white px-3 py-1.5 text-xs font-medium text-[#171B21] hover:bg-[#F1F4F8] dark:border-[#323846] dark:bg-[#22262F] dark:text-[#EEF1F5]"
              >
                {copiedCsv ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy CSV</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0067C0] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#0055A0] dark:bg-[#60CDFF] dark:text-[#0F172A]"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download .csv</span>
              </button>
            </div>
          </div>

          <pre className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-[#E2E6EC] bg-[#F8FAFC] p-4 font-mono text-[11px] leading-relaxed text-[#171B21] dark:border-[#262C38] dark:bg-[#12151B] dark:text-[#CBD5E1]">
            {csvOutput}
          </pre>
        </div>
      )}
    </div>
  );
};
