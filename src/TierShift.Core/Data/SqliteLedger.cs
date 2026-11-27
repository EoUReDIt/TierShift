using Microsoft.Data.Sqlite;

namespace TierShift.Core.Data;

public sealed class SqliteLedger(string dbPath)
{
    private readonly string _connectionString = new SqliteConnectionStringBuilder
    {
        DataSource = dbPath,
        Mode = SqliteOpenMode.ReadWriteCreate
    }.ToString();

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            CREATE TABLE IF NOT EXISTS MoveLedger (
                Id TEXT PRIMARY KEY,
                AppDisplayName TEXT NOT NULL,
                MoveType TEXT NOT NULL,
                SourcePath TEXT NOT NULL,
                TargetPath TEXT NOT NULL,
                BytesMoved INTEGER NOT NULL,
                Status TEXT NOT NULL,
                CreatedAtUtc TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS TransactionJournal (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                MoveId TEXT NOT NULL,
                StepOrder INTEGER NOT NULL,
                ActionType TEXT NOT NULL,
                PayloadJson TEXT NOT NULL,
                Completed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS AttributionCache (
                FolderPath TEXT PRIMARY KEY,
                ResolvedAppName TEXT,
                Publisher TEXT,
                ConfidenceScore INTEGER NOT NULL,
                EvidenceSummary TEXT NOT NULL,
                Classification TEXT NOT NULL,
                SizeBytes INTEGER NOT NULL,
                LastScannedUtc TEXT NOT NULL
            );
            """;
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
