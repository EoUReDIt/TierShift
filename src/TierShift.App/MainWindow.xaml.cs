using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using TierShift.Core.Attribution;
using TierShift.Core.Capsules;
using TierShift.Core.Data;
using TierShift.Core.Discovery;
using TierShift.Core.FileSystem;
using TierShift.Core.Guardrails;
using TierShift.Core.Migration;
using TierShift.Core.Sorting;

namespace TierShift.App;

public sealed class VolumeRowViewModel
{
    public required VolumeInfo Source { get; init; }
    public string Title => $"{Source.DriveLetter}  {Source.VolumeLabel}";
    public string Meta => $"{Source.FileSystem} · {Source.DriveType} · {(Source.IsNtfsFixed ? "NTFS Junction Ready" : Source.IsJunctionEligible ? $"Junction Ready ({Source.FileSystem})" : "Not Eligible for Junctions")}";
    public string UsageSummary => $"{MainWindow.FormatBytes(Source.UsedBytes)} / {MainWindow.FormatBytes(Source.TotalBytes)} ({MainWindow.FormatBytes(Source.FreeBytes)} free)";
    public double UsedPercent => Source.UsedPercent;
}

public sealed class AppRowViewModel
{
    public required InstalledAppInfo Source { get; init; }
    public string DisplayName => Source.DisplayName;
    public string Subtitle => $"{Source.Publisher} · {Source.PackageKind}{(string.IsNullOrWhiteSpace(Source.DisplayVersion) ? "" : $" · v{Source.DisplayVersion}")} · Last touched {Source.LastUsedDaysAgo}d ago";
    public string InstallPath => Source.IsOffloaded && Source.OffloadedTargetPath != null
        ? $"{Source.InstallPath} -> {Source.OffloadedTargetPath}"
        : Source.InstallPath;
    public string SizeFormatted => MainWindow.FormatBytes(Source.InstallBytes);
    public string StatusText => Source.IsOffloaded ? "Offloaded" : Source.IsDormant ? $"Dormant ({Source.LastUsedDaysAgo}d)" : "On C: NVMe";
    public bool CanMove => !Source.IsOffloaded;
    public bool CanUninstall => !string.IsNullOrWhiteSpace(Source.UninstallString);
}

public sealed class FolderRowViewModel
{
    public required FolderAttributionInfo Source { get; init; }
    public string AttributionHeadline => $"{Source.ConfidenceScore}% · {Source.ResolvedAppName ?? Source.FolderName}";
    public string FolderPath => Source.IsOffloaded && Source.OffloadedTargetPath != null
        ? $"{Source.FolderPath} -> {Source.OffloadedTargetPath}"
        : Source.FolderPath;
    public string EvidenceLine => $"{Source.RootScope} · {Source.EvidenceSummary} · Untouched {Source.UntouchedDays}d";
    public string SizeFormatted => MainWindow.FormatBytes(Source.SizeBytes);
    public string ClassificationText => Source.IsOffloaded ? "Offloaded (Junction)" : Source.Classification;
    public bool CanOffload => !Source.IsOffloaded && !Source.Classification.Equals("Protected", StringComparison.OrdinalIgnoreCase);
    public Visibility OrphanDeleteVisibility =>
        !Source.IsOffloaded && Source.Classification.Equals("Orphaned", StringComparison.OrdinalIgnoreCase)
            ? Visibility.Visible
            : Visibility.Collapsed;
}

public sealed class LedgerRowViewModel
{
    public required MoveLedgerRecord Source { get; init; }
    public string AppDisplayName => Source.AppDisplayName;
    public string RouteText => $"{Source.SourcePath} -> {Source.TargetPath}";
    public string MetaText => $"{Source.MoveType} · {Source.CreatedAtUtc}";
    public string SizeFormatted => MainWindow.FormatBytes(Source.BytesMoved);
    public string Status => Source.Status;
    public bool CanRollback => Source.Status.Equals("Active", StringComparison.OrdinalIgnoreCase)
        && !Source.MoveType.Equals("MsixNative", StringComparison.OrdinalIgnoreCase);
}

public sealed class CapsuleRowViewModel
{
    public required CapsuleInfo Source { get; init; }
    public string AppDisplayName => Source.AppDisplayName;
    public string ArchivePath => Source.ArchivePath;
    public string MetaText => $"{(Source.CachesExcluded ? "Caches excluded" : "Full state")} · Created {Source.CreatedAtUtc}";
    public string SizeFormatted => MainWindow.FormatBytes(Source.ArchiveBytes);
}

public sealed class SortArtifactRowViewModel
{
    public required ClassifiedSortArtifact Source { get; init; }
    public string FileName => Source.FileName;
    public string DestinationFolder => Source.DestinationFolder;
    public string MetaLine => $"{Source.Category} · {Source.SubCategory}{(Source.ClusterLabel != null ? $" · {Source.ClusterLabel}" : "")}";
    public string ConfidenceText => $"{Source.Confidence} / 100";
    public string DispositionText => $"{Source.Status} · {Source.MoveAction}";
}

public sealed partial class MainWindow : Window
{
    private readonly SqliteLedger _ledger;
    private readonly JunctionMoveService _moveService;
    private readonly JunctionSweepService _sweepService;
    private readonly AttributionEngine _attributionEngine;
    private readonly CapsuleService _capsuleService;
    private readonly InferenceSortingEngine _sortingEngine = new();

    private IReadOnlyList<VolumeInfo> _volumes = [];
    private IReadOnlyList<InstalledAppInfo> _allApps = [];
    private IReadOnlyList<FolderAttributionInfo> _allFolders = [];
    private IReadOnlyList<MoveLedgerRecord> _ledgerMoves = [];
    private IReadOnlyList<ClassifiedSortArtifact> _sortArtifacts = [];
    private string _selectedTargetDrive = "D:";
    private bool _isBusy;

    public MainWindow()
    {
        InitializeComponent();

        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        try
        {
            AppWindow.Resize(new Windows.Graphics.SizeInt32(1240, 820));
        }
        catch { }

        var oneDrive = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive");
        SorterPathBox.Text = Directory.Exists(oneDrive)
            ? oneDrive
            : Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

        var dataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "TierShift");
        Directory.CreateDirectory(dataDir);

        _ledger = new SqliteLedger(Path.Combine(dataDir, "tiershift.db"));
        _moveService = new JunctionMoveService(_ledger);
        _sweepService = new JunctionSweepService(_ledger);
        _attributionEngine = new AttributionEngine(_ledger);
        _capsuleService = new CapsuleService(_ledger);

        _ = InitializeOnStartupAsync();
    }

    private async Task InitializeOnStartupAsync()
    {
        try
        {
            SetBusy(true, "Initializing", "Opening SQLite MoveLedger and scanning local volumes...");
            await _ledger.InitializeAsync();
            RefreshVolumes();

            var sweep = await _sweepService.RunSweepAsync();
            await RefreshLedgerAndCapsulesAsync();

            var sweepNote = sweep.CleanedTargets > 0
                ? $" Cleaned {sweep.CleanedTargets} orphaned target shell(s) on startup."
                : "";

            SetStatus(
                InfoBarSeverity.Success,
                "TierShift Ready",
                $"Ledger active at {_ledger.DbPath}.{sweepNote} Click 'Scan System' to inspect installed apps and AppData.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Startup Error", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void RefreshVolumes()
    {
        _volumes = AppDiscoveryService.GetLocalVolumes();
        VolumesItemsControl.ItemsSource = _volumes.Select(v => new VolumeRowViewModel { Source = v }).ToList();

        // Every ready volume is a candidate, including the OS drive (useful for moving apps back
        // or storing capsules there). PathGuard still blocks same-volume junction moves.
        var targetCandidates = _volumes.ToList();
        var systemDrive = GetSystemDriveLetter();

        TargetDriveCombo.Items.Clear();
        if (targetCandidates.Count == 0)
        {
            TargetDriveCombo.Items.Add(new ComboBoxItem { Content = "No drive detected", Tag = "" });
            TargetDriveCombo.SelectedIndex = 0;
            _selectedTargetDrive = "";
            return;
        }

        int preferredIndex = -1;
        int eligibleIndex = -1;
        int fallbackIndex = -1;
        for (int i = 0; i < targetCandidates.Count; i++)
        {
            var vol = targetCandidates[i];
            var isSystem = vol.DriveLetter.Equals(systemDrive, StringComparison.OrdinalIgnoreCase);
            TargetDriveCombo.Items.Add(new ComboBoxItem
            {
                Content = $"{vol.DriveLetter} {vol.VolumeLabel}{(isSystem ? " (OS drive)" : "")} ({vol.FileSystem} · {FormatBytes(vol.FreeBytes)} free)",
                Tag = vol.DriveLetter
            });

            // Default to a secondary drive: NTFS fixed first, then exFAT fixed, then any non-OS drive.
            if (isSystem)
                continue;
            if (vol.IsNtfsFixed && preferredIndex < 0)
                preferredIndex = i;
            if (vol.IsJunctionEligible && eligibleIndex < 0)
                eligibleIndex = i;
            if (fallbackIndex < 0)
                fallbackIndex = i;
        }

        if (preferredIndex < 0)
            preferredIndex = eligibleIndex >= 0 ? eligibleIndex : fallbackIndex >= 0 ? fallbackIndex : 0;

        TargetDriveCombo.SelectedIndex = preferredIndex;
        _selectedTargetDrive = targetCandidates[preferredIndex].DriveLetter;
    }

    private static string GetSystemDriveLetter()
    {
        var root = Path.GetPathRoot(Environment.GetFolderPath(Environment.SpecialFolder.Windows));
        return string.IsNullOrEmpty(root) ? "C:" : root.TrimEnd('\\');
    }

    private void TargetDriveCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (TargetDriveCombo.SelectedItem is ComboBoxItem item && item.Tag is string letter)
        {
            _selectedTargetDrive = letter;
            _ = RefreshCapsulesOnlyAsync();
        }
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag)
            return;

        SelectSection(tag);
    }

    private void SelectSection(string tag)
    {
        if (DashboardPanel == null || AppsPanel == null || AppDataPanel == null || SorterPanel == null || LedgerPanel == null || PageTitleText == null)
            return;

        DashboardPanel.Visibility = tag == "dashboard" ? Visibility.Visible : Visibility.Collapsed;
        AppsPanel.Visibility = tag == "apps" ? Visibility.Visible : Visibility.Collapsed;
        AppDataPanel.Visibility = tag == "appdata" ? Visibility.Visible : Visibility.Collapsed;
        SorterPanel.Visibility = tag == "sorter" ? Visibility.Visible : Visibility.Collapsed;
        LedgerPanel.Visibility = tag == "ledger" ? Visibility.Visible : Visibility.Collapsed;

        foreach (var menuItem in NavView.MenuItems.OfType<NavigationViewItem>())
        {
            if (menuItem.Tag is string t && t == tag)
            {
                if (!ReferenceEquals(NavView.SelectedItem, menuItem))
                    NavView.SelectedItem = menuItem;
                break;
            }
        }

        (PageTitleText.Text, PageSubtitleText.Text) = tag switch
        {
            "apps" => ("Apps & Advisor", "Installed Win32 and MSIX apps sorted by footprint. Relocate safely without breaking Windows Uninstall."),
            "appdata" => ("AppData & Mystery Inspector", "5-Stage heuristic attribution for Local, LocalLow, Roaming, and ProgramData folders."),
            "sorter" => ("Inference Sorting Engine (v37)", "Evidence-based OneDrive & archive reconstruction. Verified -> MOVE, Probable -> Staging-Probable, Unknown -> Unsorted."),
            "ledger" => ("Capsules & Ledger", "Active NTFS junctions with 1-click rollback, orphaned junction sweep, and portable .tiercapsule backups."),
            _ => ("Dashboard", "Inspect NVMe vs. cold storage capacity, scan apps, and safely relocate via NTFS junctions.")
        };
    }

    private void JumpToApps_Click(object sender, RoutedEventArgs e) => SelectSection("apps");
    private void JumpToAppData_Click(object sender, RoutedEventArgs e) => SelectSection("appdata");
    private void JumpToSorter_Click(object sender, RoutedEventArgs e) => SelectSection("sorter");
    private void JumpToLedger_Click(object sender, RoutedEventArgs e) => SelectSection("ledger");
    private void RefreshDrivesButton_Click(object sender, RoutedEventArgs e) => RefreshVolumes();

    private async void ScanAllButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        try
        {
            SetBusy(true, "Scanning System", "Discovering Win32 & MSIX apps and running 5-stage AppData attribution...");
            RefreshVolumes();
            _allApps = await AppDiscoveryService.DiscoverInstalledAppsAsync();
            ApplyAppsFilter();

            _allFolders = await _attributionEngine.ScanAppDataAndProgramDataAsync(_allApps);
            ApplyFoldersFilter();

            await RefreshLedgerAndCapsulesAsync();
            UpdateKpiCards();

            SetStatus(
                InfoBarSeverity.Success,
                "System Scan Complete",
                $"Found {_allApps.Count} installed apps and {_allFolders.Count} AppData/ProgramData folders (>= 5 MB).");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Scan Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void RescanAppsButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        try
        {
            SetBusy(true, "Scanning Applications", "Reading ARP Uninstall registry keys and MSIX PackageManager...");
            _allApps = await AppDiscoveryService.DiscoverInstalledAppsAsync();
            ApplyAppsFilter();
            UpdateKpiCards();
            SetStatus(InfoBarSeverity.Success, "App Scan Complete", $"Discovered {_allApps.Count} installed Win32/MSIX applications.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "App Scan Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void RescanFoldersButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        try
        {
            SetBusy(true, "Scanning AppData", "Running 5-stage attribution across Local, LocalLow, Roaming, and ProgramData...");
            if (_allApps.Count == 0)
            {
                _allApps = await AppDiscoveryService.DiscoverInstalledAppsAsync();
                ApplyAppsFilter();
            }
            _allFolders = await _attributionEngine.ScanAppDataAndProgramDataAsync(_allApps);
            ApplyFoldersFilter();
            UpdateKpiCards();
            SetStatus(InfoBarSeverity.Success, "Attribution Complete", $"Scored {_allFolders.Count} directories and updated SQLite AttributionCache.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Attribution Scan Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void AppsSearchBox_TextChanged(object sender, TextChangedEventArgs e) => ApplyAppsFilter();
    private void AppsFilterCombo_SelectionChanged(object sender, SelectionChangedEventArgs e) => ApplyAppsFilter();
    private void FoldersSearchBox_TextChanged(object sender, TextChangedEventArgs e) => ApplyFoldersFilter();
    private void FoldersFilterCombo_SelectionChanged(object sender, SelectionChangedEventArgs e) => ApplyFoldersFilter();

    private void ApplyAppsFilter()
    {
        if (AppsListView == null) return;

        var query = AppsSearchBox?.Text?.Trim() ?? string.Empty;
        var mode = (AppsFilterCombo?.SelectedItem as ComboBoxItem)?.Tag as string ?? "All";

        var filtered = _allApps
            .Where(a => mode switch
            {
                "OnC" => !a.IsOffloaded,
                "Offloaded" => a.IsOffloaded,
                "Dormant" => a.IsDormant,
                "MSIX" => a.PackageKind.Equals("MSIX", StringComparison.OrdinalIgnoreCase),
                _ => true
            })
            .Where(a => string.IsNullOrEmpty(query) ||
                        a.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                        a.Publisher.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                        a.InstallPath.Contains(query, StringComparison.OrdinalIgnoreCase))
            .Select(a => new AppRowViewModel { Source = a })
            .ToList();

        AppsListView.ItemsSource = filtered;
    }

    private void ApplyFoldersFilter()
    {
        if (FoldersListView == null) return;

        var query = FoldersSearchBox?.Text?.Trim() ?? string.Empty;
        var mode = (FoldersFilterCombo?.SelectedItem as ComboBoxItem)?.Tag as string ?? "All";

        var filtered = _allFolders
            .Where(f => mode switch
            {
                "Orphaned" => !f.IsOffloaded && f.Classification.Equals("Orphaned", StringComparison.OrdinalIgnoreCase),
                "Protected" => f.Classification.Equals("Protected", StringComparison.OrdinalIgnoreCase),
                "Offloaded" => f.IsOffloaded,
                "Offloadable" => !f.IsOffloaded &&
                                 !f.Classification.Equals("Protected", StringComparison.OrdinalIgnoreCase) &&
                                 !f.Classification.Equals("Orphaned", StringComparison.OrdinalIgnoreCase),
                _ => true
            })
            .Where(f => string.IsNullOrEmpty(query) ||
                        f.FolderPath.Contains(query, StringComparison.OrdinalIgnoreCase) ||
                        (f.ResolvedAppName?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false))
            .Select(f => new FolderRowViewModel { Source = f })
            .ToList();

        FoldersListView.ItemsSource = filtered;
    }

    private void UpdateKpiCards()
    {
        var dormant = _allApps.Where(a => a.IsDormant).ToList();
        KpiDormantValue.Text = FormatBytes(dormant.Sum(a => a.InstallBytes));
        KpiDormantSub.Text = $"{dormant.Count} app(s) untouched >= 90d";

        var orphans = _allFolders.Where(f => !f.IsOffloaded && f.Classification.Equals("Orphaned", StringComparison.OrdinalIgnoreCase)).ToList();
        KpiOrphanValue.Text = FormatBytes(orphans.Sum(f => f.SizeBytes));
        KpiOrphanSub.Text = $"{orphans.Count} verified orphan folder(s)";

        var offloadable = _allFolders.Where(f => !f.IsOffloaded && !f.Classification.Equals("Protected", StringComparison.OrdinalIgnoreCase) && !f.Classification.Equals("Orphaned", StringComparison.OrdinalIgnoreCase)).ToList();
        KpiAppDataValue.Text = FormatBytes(offloadable.Sum(f => f.SizeBytes));
        KpiAppDataSub.Text = $"{offloadable.Count} safe AppData candidate(s)";

        var activeMoves = _ledgerMoves.Count(m => m.Status.Equals("Active", StringComparison.OrdinalIgnoreCase));
        KpiLedgerValue.Text = activeMoves.ToString();
        KpiLedgerSub.Text = $"{_ledgerMoves.Count} total ledger record(s)";
    }

    private async Task RefreshLedgerAndCapsulesAsync()
    {
        _ledgerMoves = await _ledger.GetAllMovesAsync();
        LedgerListView.ItemsSource = _ledgerMoves.Select(m => new LedgerRowViewModel { Source = m }).ToList();
        await RefreshCapsulesOnlyAsync();
        UpdateKpiCards();
    }

    private Task RefreshCapsulesOnlyAsync()
    {
        if (CapsulesListView == null || _capsuleService == null)
            return Task.CompletedTask;

        if (string.IsNullOrWhiteSpace(_selectedTargetDrive))
        {
            CapsulesListView.ItemsSource = Array.Empty<CapsuleRowViewModel>();
            return Task.CompletedTask;
        }

        var capsules = _capsuleService.ListCapsules(_selectedTargetDrive);
        CapsulesListView.ItemsSource = capsules.Select(c => new CapsuleRowViewModel { Source = c }).ToList();
        return Task.CompletedTask;
    }

    private async void RefreshLedgerButton_Click(object sender, RoutedEventArgs e)
    {
        await RefreshLedgerAndCapsulesAsync();
        SetStatus(InfoBarSeverity.Informational, "Ledger Refreshed", $"Loaded {_ledgerMoves.Count} ledger record(s).");
    }

    private async void SweepJunctions_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        try
        {
            SetBusy(true, "Sweeping Junctions", "Checking active MoveLedger entries for orphaned empty target directories...");
            var report = await _sweepService.RunSweepAsync();
            await RefreshLedgerAndCapsulesAsync();
            RefreshVolumes();

            SetStatus(
                InfoBarSeverity.Success,
                "Orphaned Junction Sweep Complete",
                $"Checked {report.CheckedActiveMoves} active junction(s); removed {report.CleanedTargets} empty target shell(s).");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Sweep Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void MoveAppButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: AppRowViewModel vm }) return;
        if (!EnsureTargetDriveSelected()) return;

        var app = vm.Source;
        bool isMsix = app.PackageKind.Equals("MSIX", StringComparison.OrdinalIgnoreCase);
        var safeName = SanitizeFolderName(app.DisplayName);
        var targetPath = isMsix
            ? $@"{_selectedTargetDrive}\WindowsApps\{safeName}"
            : $@"{_selectedTargetDrive}\TierShift\Apps\{safeName}";

        var guard = PathGuard.Validate(app.InstallPath, targetPath, app.InstallBytes, isMsixNativeMove: isMsix);
        if (!guard.Allowed)
        {
            await ShowMessageDialogAsync("PathGuard Blocked Relocation", $"{guard.Code}\n\n{guard.Message}");
            return;
        }

        bool closeLocks = false;
        if (!isMsix)
        {
            var locks = RestartManagerService.FindLockingProcesses(app.InstallPath);
            if (locks.Count > 0)
            {
                if (locks.Any(l => !l.IsClosable))
                {
                    var lockedNames = string.Join("\n", locks.Select(l => $"• {l.AppName} (PID {l.Pid})"));
                    await ShowMessageDialogAsync("System Process Lock Detected", $"Cannot relocate while system-locked processes hold open handles:\n\n{lockedNames}");
                    return;
                }

                var lockList = string.Join("\n", locks.Select(l => $"• {l.AppName} (PID {l.Pid})"));
                if (!await ConfirmDialogAsync("Close Running Processes?", $"Restart Manager detected running processes locking this folder:\n\n{lockList}\n\nClose them cleanly and continue moving to {_selectedTargetDrive}?", "Close & Move"))
                    return;
                closeLocks = true;
            }
            else if (!await ConfirmDialogAsync("Confirm App Relocation", $"Relocate '{app.DisplayName}' ({FormatBytes(app.InstallBytes)}) via NTFS Junction?\n\nSource: {app.InstallPath}\nTarget: {targetPath}", "Move to " + _selectedTargetDrive))
            {
                return;
            }
        }
        else if (!await ConfirmDialogAsync("Confirm Native MSIX Move", $"Move Store app '{app.DisplayName}' ({FormatBytes(app.InstallBytes)}) to {_selectedTargetDrive} using Windows PackageManager?", "Move MSIX"))
        {
            return;
        }

        try
        {
            SetBusy(true, $"Relocating {app.DisplayName}", $"Transferring {FormatBytes(app.InstallBytes)} to {_selectedTargetDrive}...");

            if (isMsix && !string.IsNullOrWhiteSpace(app.PackageFullName))
            {
                BusyProgressText.Visibility = Visibility.Visible;
                BusyProgressText.Text = "Windows is moving the package...";
                await AppDiscoveryService.MoveMsixPackageToVolumeAsync(
                    app.PackageFullName,
                    _selectedTargetDrive,
                    percentProgress: new Progress<double>(pct =>
                    {
                        if (!_isBusy) return;
                        BusyProgressBar.IsIndeterminate = false;
                        BusyProgressBar.Maximum = 100;
                        BusyProgressBar.Value = pct;
                        BusyProgressText.Text = $"{pct:0}%  ·  Windows is moving the package (no time estimate available for Store apps)";
                    }));
                await _ledger.InsertMoveAsync(new MoveLedgerRecord(
                    Guid.NewGuid().ToString(),
                    app.DisplayName,
                    "MsixNative",
                    app.InstallPath,
                    targetPath,
                    app.InstallBytes,
                    "Active",
                    DateTime.UtcNow.ToString("O")));
            }
            else
            {
                await _moveService.ExecuteAsync(
                    app.DisplayName,
                    "Win32Junction",
                    app.InstallPath,
                    targetPath,
                    app.InstallBytes,
                    CreateCopyProgress(),
                    closeLockingApps: closeLocks);
            }

            RefreshVolumes();
            _allApps = await AppDiscoveryService.DiscoverInstalledAppsAsync();
            ApplyAppsFilter();
            await RefreshLedgerAndCapsulesAsync();
            SetStatus(InfoBarSeverity.Success, "Relocation Complete", $"Successfully moved {app.DisplayName} to {_selectedTargetDrive}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Relocation Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void OffloadFolderButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: FolderRowViewModel vm }) return;
        if (!EnsureTargetDriveSelected()) return;

        var folder = vm.Source;
        var safeName = SanitizeFolderName(folder.FolderName);
        var targetPath = $@"{_selectedTargetDrive}\TierShift\AppData\{folder.RootScope}\{safeName}";

        var guard = PathGuard.Validate(folder.FolderPath, targetPath, folder.SizeBytes);
        if (!guard.Allowed)
        {
            await ShowMessageDialogAsync("PathGuard Blocked Offload", $"{guard.Code}\n\n{guard.Message}");
            return;
        }

        if (!await ConfirmDialogAsync("Offload AppData via NTFS Junction", $"Offload '{folder.FolderName}' ({FormatBytes(folder.SizeBytes)}) to {_selectedTargetDrive}?\n\nSource: {folder.FolderPath}\nTarget: {targetPath}", "Offload Junction"))
            return;

        try
        {
            SetBusy(true, $"Offloading {folder.FolderName}", $"Moving {FormatBytes(folder.SizeBytes)} to {targetPath}...");
            await _moveService.ExecuteAsync(
                $"{folder.ResolvedAppName ?? folder.FolderName} ({folder.RootScope})",
                "AppDataJunction",
                folder.FolderPath,
                targetPath,
                folder.SizeBytes,
                CreateCopyProgress(),
                closeLockingApps: false);

            RefreshVolumes();
            _allFolders = await _attributionEngine.ScanAppDataAndProgramDataAsync(_allApps);
            ApplyFoldersFilter();
            await RefreshLedgerAndCapsulesAsync();
            SetStatus(InfoBarSeverity.Success, "AppData Offloaded", $"Created transparent NTFS junction at {folder.FolderPath}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Offload Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void InspectFolderButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: FolderRowViewModel vm }) return;
        var f = vm.Source;
        var body = $"Path: {f.FolderPath}\n" +
                   $"Resolved App: {f.ResolvedAppName ?? "Unattributed"}\n" +
                   $"Publisher: {f.Publisher ?? "Unknown"}\n" +
                   $"Confidence: {f.ConfidenceScore}% ({f.Classification})\n" +
                   $"Size: {FormatBytes(f.SizeBytes)} ({f.FileCount:N0} files, untouched {f.UntouchedDays}d)\n\n" +
                   "5-Stage Forensic Pipeline:\n" +
                   string.Join("\n", f.StageTrace.Select(t => $"• {t}"));
        await ShowMessageDialogAsync("5-Stage Attribution Evidence", body);
    }

    private async void DeleteOrphanButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: FolderRowViewModel vm }) return;
        var f = vm.Source;

        if (!await ConfirmDialogAsync("Delete Verified Orphan Folder?", $"Permanently delete '{f.FolderPath}' ({FormatBytes(f.SizeBytes)})?\n\nConfidence: {f.ConfidenceScore}% · Untouched {f.UntouchedDays} days.", "Delete Permanently"))
            return;

        try
        {
            SetBusy(true, "Deleting Orphan", $"Removing {f.FolderPath}...");
            await Task.Run(() => Directory.Delete(f.FolderPath, recursive: true));
            RefreshVolumes();
            _allFolders = await _attributionEngine.ScanAppDataAndProgramDataAsync(_allApps);
            ApplyFoldersFilter();
            UpdateKpiCards();
            SetStatus(InfoBarSeverity.Success, "Orphan Deleted", $"Reclaimed {FormatBytes(f.SizeBytes)} from {f.FolderName}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Delete Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void CreateAppCapsuleButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: AppRowViewModel vm }) return;
        if (!EnsureTargetDriveSelected()) return;

        var app = vm.Source;
        if (!await ConfirmDialogAsync("Export Portable State Capsule", $"Export ProgramData, AppData (caches excluded), and HKCU/HKLM registry keys for '{app.DisplayName}' to {_selectedTargetDrive}\\TierShift\\Capsules\\?", "Create Capsule"))
            return;

        try
        {
            SetBusy(true, "Exporting State Capsule", $"Packaging settings for {app.DisplayName}...");
            var cap = await _capsuleService.ExportCapsuleAsync(app.DisplayName, _selectedTargetDrive, excludeCaches: true);
            await RefreshLedgerAndCapsulesAsync();
            SetStatus(InfoBarSeverity.Success, "State Capsule Created", $"Saved {cap.ArchivePath} ({FormatBytes(cap.ArchiveBytes)}).");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Capsule Export Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void RestoreCapsuleButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: CapsuleRowViewModel vm }) return;
        if (!EnsureTargetDriveSelected()) return;

        var cap = vm.Source;
        if (!await ConfirmDialogAsync("Restore Redirected to Cold Storage", $"Extract '{cap.FileName}' to {_selectedTargetDrive}\\TierShift\\State\\{cap.AppDisplayName}, create NTFS junctions on C:, and import registry keys?", "Restore Redirected"))
            return;

        try
        {
            SetBusy(true, "Restoring Capsule", $"Redirecting state for {cap.AppDisplayName} to {_selectedTargetDrive}...");
            var stateRoot = await _capsuleService.RestoreRedirectedAsync(cap.ArchivePath, _selectedTargetDrive);
            await RefreshLedgerAndCapsulesAsync();
            SetStatus(InfoBarSeverity.Success, "Redirected Restore Complete", $"Restored settings to {stateRoot} with transparent C: NTFS junctions.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Restore Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void RollbackMoveButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy || sender is not Button { Tag: LedgerRowViewModel vm }) return;
        var row = vm.Source;

        if (!await ConfirmDialogAsync("Restore to NVMe (1-Click Rollback)", $"Copy '{row.AppDisplayName}' ({FormatBytes(row.BytesMoved)}) back to C: and remove the NTFS junction?\n\nSource: {row.SourcePath}\nTarget: {row.TargetPath}", "Rollback to C:"))
            return;

        try
        {
            SetBusy(true, "Rolling Back Move", $"Restoring {row.AppDisplayName} to {row.SourcePath}...");
            await _moveService.RollbackAsync(row.Id, CreateCopyProgress());
            RefreshVolumes();
            await RefreshLedgerAndCapsulesAsync();
            SetStatus(InfoBarSeverity.Success, "Rollback Complete", $"Restored {row.AppDisplayName} back to {row.SourcePath}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Rollback Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private async void UninstallAppButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AppRowViewModel vm }) return;
        var app = vm.Source;
        if (string.IsNullOrWhiteSpace(app.UninstallString)) return;

        if (!await ConfirmDialogAsync("Launch Native Windows Uninstaller", $"Start the registered Windows uninstaller for '{app.DisplayName}'?\n\nIf offloaded via junction, run 'Sweep Orphaned Junctions' afterward to clean up the empty cold-storage folder.", "Launch Uninstaller"))
            return;

        try
        {
            AppDiscoveryService.LaunchNativeUninstaller(app.UninstallString);
            SetStatus(InfoBarSeverity.Informational, "Uninstaller Launched", $"Started native uninstaller for {app.DisplayName}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Uninstall Launch Failed", ex.Message);
        }
    }

    private async void ScanSorterButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        var rootPath = SorterPathBox.Text?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(rootPath) || !Directory.Exists(rootPath))
        {
            SetStatus(InfoBarSeverity.Warning, "Invalid Folder", "Specify an existing directory path (e.g. OneDrive or Documents) to run evidence-based sorting.");
            return;
        }

        try
        {
            SetBusy(true, "Running v37 Inference Sorter", $"Scanning '{rootPath}' for explicit, subject, cluster, temporal, and version signals...");
            var report = await _sortingEngine.ScanAndClassifyDirectoryAsync(rootPath);
            _sortArtifacts = report.Artifacts;
            ApplySorterFilter();

            int verified = _sortArtifacts.Count(a => a.Status == ClassificationStatus.Verified);
            int probable = _sortArtifacts.Count(a => a.Status == ClassificationStatus.Probable);
            int unknown = _sortArtifacts.Count(a => a.Status == ClassificationStatus.Unknown);

            SorterSummaryText.Text = $"Scanned {_sortArtifacts.Count:N0} files · Verified (MOVE): {verified} · Probable (REVIEW): {probable} · Unknown (HOLD): {unknown}";
            SetStatus(InfoBarSeverity.Success, "Inference Classification Complete", SorterSummaryText.Text);
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Inference Scan Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private void SorterFilterCombo_SelectionChanged(object sender, SelectionChangedEventArgs e) => ApplySorterFilter();

    private void ApplySorterFilter()
    {
        if (SorterListView == null) return;
        var mode = (SorterFilterCombo?.SelectedItem as ComboBoxItem)?.Tag as string ?? "All";

        var filtered = _sortArtifacts
            .Where(a => mode == "All" || a.Status.ToString().Equals(mode, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(a => a.Confidence)
            .Select(a => new SortArtifactRowViewModel { Source = a })
            .ToList();

        SorterListView.ItemsSource = filtered;
    }

    private async void InspectSortArtifactButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: SortArtifactRowViewModel vm }) return;
        var a = vm.Source;
        var s = a.Signals;
        var body = $"Source: {a.SourceFile}\n" +
                   $"Destination: {a.DestinationFolder}\n" +
                   $"Category: {a.Category} / {a.SubCategory}\n" +
                   (a.SecondaryClassification != null ? $"Secondary (Rule 4): {a.SecondaryClassification}\n" : string.Empty) +
                   $"Confidence: {a.Confidence} / 100 ({a.Status} · {a.MoveAction})\n\n" +
                   $"Formula Breakdown:\n" +
                   $"  Explicit: +{s.ExplicitAssignment} | Subject: +{s.SubjectMatch} | Cluster: +{s.ClusterMatch}\n" +
                   $"  Temporal: +{s.TemporalMatch} | Version: +{s.VersionMatch} | Contradiction: -{s.ContradictoryPenalty}\n\n" +
                   "Applied PoC Rules:\n" +
                   string.Join("\n", a.AppliedRules.Select(r => $"• {r}")) + "\n\n" +
                   $"Notes:\n{a.Notes}";
        await ShowMessageDialogAsync("v37 Inference Evidence", body);
    }

    private void ExportManifestButton_Click(object sender, RoutedEventArgs e)
    {
        if (_sortArtifacts.Count == 0)
        {
            SetStatus(InfoBarSeverity.Warning, "No Classification Results", "Run 'Scan & Classify' before exporting the Move Manifest CSV.");
            return;
        }

        try
        {
            var baseDir = !string.IsNullOrWhiteSpace(_selectedTargetDrive)
                ? Path.Combine(_selectedTargetDrive + "\\", "TierShift", "Manifests")
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "TierShift");
            Directory.CreateDirectory(baseDir);

            var outPath = Path.Combine(baseDir, $"MoveManifest_v37_{DateTime.Now:yyyyMMdd_HHmmss}.csv");
            var csv = InferenceSortingEngine.ExportMoveManifestCsv(_sortArtifacts);
            File.WriteAllText(outPath, csv);

            SetStatus(InfoBarSeverity.Success, "Move Manifest Exported", $"Saved 8-column v37 CSV manifest to {outPath}.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "CSV Export Failed", ex.Message);
        }
    }

    private async void ExecuteVerifiedMovesButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        var verifiedCount = _sortArtifacts.Count(a => a.MoveAction == MoveAction.MOVE);
        if (verifiedCount == 0)
        {
            SetStatus(InfoBarSeverity.Warning, "No Verified Files", "No Verified (MOVE) artifacts are queued. Classification confidence always overrides automation.");
            return;
        }

        var rootBase = !string.IsNullOrWhiteSpace(_selectedTargetDrive)
            ? Path.Combine(_selectedTargetDrive + "\\", "TierShift")
            : SorterPathBox.Text?.Trim() ?? Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

        if (!await ConfirmDialogAsync(
            "Execute Verified Moves Only?",
            $"Move {verifiedCount} Verified (Confidence 90–100) artifact(s) into '{rootBase}\\Verified Inventory'?\n\nProbable, Unknown, and Historical items will NOT be moved automatically.",
            "Move Verified Files"))
            return;

        try
        {
            SetBusy(true, "Organizing Verified Inventory", $"Moving {verifiedCount} verified artifact(s) into '{rootBase}\\Verified Inventory'...");
            int moved = await Task.Run(() => InferenceSortingEngine.ExecuteVerifiedMoves(_sortArtifacts, rootBase));
            SetStatus(InfoBarSeverity.Success, "Verified Moves Complete", $"Moved {moved} verified file(s) into '{rootBase}\\Verified Inventory'.");
        }
        catch (Exception ex)
        {
            SetStatus(InfoBarSeverity.Error, "Verified Move Failed", ex.Message);
        }
        finally
        {
            SetBusy(false);
        }
    }

    private bool EnsureTargetDriveSelected()
    {
        if (!string.IsNullOrWhiteSpace(_selectedTargetDrive)) return true;
        SetStatus(InfoBarSeverity.Warning, "No Secondary Drive", "Connect or select a local fixed NTFS or exFAT secondary drive (D:+) to relocate apps or create capsules.");
        return false;
    }

    /// <summary>
    /// Progress handler for long copies: drives the progress bar and a detail line showing
    /// percent, bytes, files, speed, time left and the file being copied. Created on the UI
    /// thread, so reports from the copy's worker thread are marshalled back automatically.
    /// </summary>
    private IProgress<CopyProgress> CreateCopyProgress()
    {
        var estimator = new TransferEstimator();
        var clock = new System.Diagnostics.Stopwatch();
        BusyProgressText.Visibility = Visibility.Visible;

        return new Progress<CopyProgress>(p =>
        {
            if (!_isBusy)
                return; // Late report after the operation finished.

            switch (p.Phase)
            {
                case CopyPhase.Scanning:
                    BusyProgressBar.IsIndeterminate = true;
                    BusyProgressText.Text = "Counting files and measuring size...";
                    return;

                case CopyPhase.Verifying:
                    BusyProgressBar.IsIndeterminate = false;
                    BusyProgressBar.Maximum = 100;
                    BusyProgressBar.Value = p.Fraction * 100;
                    BusyProgressText.Text = $"Verifying copy: checking {p.TotalFiles:N0} files ({FormatBytes(p.TotalBytes)})...";
                    return;
            }

            if (!clock.IsRunning)
            {
                estimator.Reset();
                clock.Start();
            }
            estimator.Update(p.BytesCopied, clock.Elapsed);

            BusyProgressBar.IsIndeterminate = false;
            BusyProgressBar.Maximum = 100;
            BusyProgressBar.Value = p.Fraction * 100;

            var parts = new List<string>
            {
                $"{p.Fraction * 100:0}%",
                $"{FormatBytes(p.BytesCopied)} of {FormatBytes(p.TotalBytes)}",
                $"{p.FilesCopied:N0} of {p.TotalFiles:N0} files",
            };
            if (estimator.BytesPerSecond is double rate && rate > 0)
                parts.Add($"{FormatBytes((long)rate)}/s");
            var eta = estimator.EstimateRemaining(p.BytesCopied, p.TotalBytes);
            parts.Add(eta is { } left ? $"about {TransferEstimator.FormatDuration(left)} left" : "estimating time left...");
            if (!string.IsNullOrEmpty(p.CurrentFile))
                parts.Add(Path.GetFileName(p.CurrentFile));

            BusyProgressText.Text = string.Join("  ·  ", parts);
        });
    }

    private void SetBusy(bool busy, string? title = null, string? message = null)
    {
        _isBusy = busy;
        ScanAllButton.IsEnabled = !busy;
        BusyProgressBar.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
        if (!busy)
        {
            BusyProgressBar.IsIndeterminate = true;
            BusyProgressBar.Value = 0;
            BusyProgressText.Text = "";
            BusyProgressText.Visibility = Visibility.Collapsed;
        }
        if (title != null && message != null)
            SetStatus(InfoBarSeverity.Informational, title, message);
    }

    private void SetStatus(InfoBarSeverity severity, string title, string message)
    {
        StatusBanner.Severity = severity;
        StatusBanner.Title = title;
        StatusBanner.Message = message;
        StatusBanner.IsOpen = true;
    }

    private async Task ShowMessageDialogAsync(string title, string content)
    {
        var xamlRoot = Content?.XamlRoot;
        if (xamlRoot == null)
        {
            SetStatus(InfoBarSeverity.Informational, title, content);
            return;
        }

        var dlg = new ContentDialog
        {
            Title = title,
            Content = new ScrollViewer
            {
                MaxHeight = 420,
                Content = new TextBlock { Text = content, TextWrapping = TextWrapping.Wrap }
            },
            CloseButtonText = "Close",
            XamlRoot = xamlRoot
        };
        await dlg.ShowAsync();
    }

    private async Task<bool> ConfirmDialogAsync(string title, string content, string primaryButtonText)
    {
        var xamlRoot = Content?.XamlRoot;
        if (xamlRoot == null)
            return false;

        var dlg = new ContentDialog
        {
            Title = title,
            Content = new TextBlock { Text = content, TextWrapping = TextWrapping.Wrap },
            PrimaryButtonText = primaryButtonText,
            CloseButtonText = "Cancel",
            DefaultButton = ContentDialogButton.Primary,
            XamlRoot = xamlRoot
        };
        return await dlg.ShowAsync() == ContentDialogResult.Primary;
    }

    private static string SanitizeFolderName(string raw)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(raw.Where(c => !invalid.Contains(c)).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "TierShiftItem" : cleaned;
    }

    public static string FormatBytes(long bytes)
    {
        if (bytes <= 0) return "0 B";
        string[] units = ["B", "KB", "MB", "GB", "TB"];
        double value = bytes;
        int idx = 0;
        while (value >= 1024.0 && idx < units.Length - 1)
        {
            value /= 1024.0;
            idx++;
        }
        return idx >= 3 ? $"{value:0.0} {units[idx]}" : $"{value:0.#} {units[idx]}";
    }
}
