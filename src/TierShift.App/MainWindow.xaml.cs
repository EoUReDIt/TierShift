using Microsoft.UI.Xaml;
using TierShift.Core.Data;

namespace TierShift.App;

public sealed partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        _ = InitializeLedgerAsync();
    }

    private async Task InitializeLedgerAsync()
    {
        try
        {
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "TierShift");
            Directory.CreateDirectory(dataDir);
            await new SqliteLedger(Path.Combine(dataDir, "tiershift.db")).InitializeAsync();
            StatusText.Text = $"Move ledger ready at {dataDir}.";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Failed to initialize move ledger: {ex.Message}";
        }
    }
}
