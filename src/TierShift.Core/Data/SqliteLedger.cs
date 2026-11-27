using Microsoft.Data.Sqlite;

namespace TierShift.Core.Data;

public sealed record MoveLedgerRecord(
    string Id,
    string AppDisplayName,
    string MoveType,
    string SourcePath,
    string TargetPath,
    long BytesMoved,
    string Status,
    string CreatedAtUtc);

public sealed record TransactionJournalRecord(
    long Id,
    string MoveId,
    int StepOrder,
    string ActionType,
    string PayloadJson,
    bool Completed);

public sealed record AttributionCacheRecord(
    string FolderPath,
    string? ResolvedAppName,
    string? Publisher,
    int ConfidenceScore,
    string EvidenceSummary,
    string Classification,
    long SizeBytes,
    string LastScannedUtc);

public sealed class SqliteLedger(string dbPath)
{
    private readonly string _connectionString = new SqliteConnectionStringBuilder
    {
        DataSource = dbPath,
        Mode = SqliteOpenMode.ReadWriteCreate
    }.ToString();

    public string DbPath => dbPath;

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        var dir = Path.GetDirectoryName(dbPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

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

    public async Task InsertMoveAsync(MoveLedgerRecord record, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO MoveLedger (Id, AppDisplayName, MoveType, SourcePath, TargetPath, BytesMoved, Status, CreatedAtUtc)
            VALUES ($id, $app, $type, $src, $tgt, $bytes, $status, $created);
            """;
        cmd.Parameters.AddWithValue("$id", record.Id);
        cmd.Parameters.AddWithValue("$app", record.AppDisplayName);
        cmd.Parameters.AddWithValue("$type", record.MoveType);
        cmd.Parameters.AddWithValue("$src", record.SourcePath);
        cmd.Parameters.AddWithValue("$tgt", record.TargetPath);
        cmd.Parameters.AddWithValue("$bytes", record.BytesMoved);
        cmd.Parameters.AddWithValue("$status", record.Status);
        cmd.Parameters.AddWithValue("$created", record.CreatedAtUtc);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpdateMoveStatusAsync(string moveId, string status, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = "UPDATE MoveLedger SET Status = $status WHERE Id = $id;";
        cmd.Parameters.AddWithValue("$status", status);
        cmd.Parameters.AddWithValue("$id", moveId);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<IReadOnlyList<MoveLedgerRecord>> GetAllMovesAsync(CancellationToken ct = default)
    {
        var results = new List<MoveLedgerRecord>();
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT Id, AppDisplayName, MoveType, SourcePath, TargetPath, BytesMoved, Status, CreatedAtUtc
            FROM MoveLedger
            ORDER BY CreatedAtUtc DESC;
            """;
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new MoveLedgerRecord(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetInt64(5),
                reader.GetString(6),
                reader.GetString(7)));
        }
        return results;
    }

    public async Task<MoveLedgerRecord?> GetMoveByIdAsync(string moveId, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            SELECT Id, AppDisplayName, MoveType, SourcePath, TargetPath, BytesMoved, Status, CreatedAtUtc
            FROM MoveLedger
            WHERE Id = $id;
            """;
        cmd.Parameters.AddWithValue("$id", moveId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) return null;
        return new MoveLedgerRecord(
            reader.GetString(0),
            reader.GetString(1),
            reader.GetString(2),
            reader.GetString(3),
            reader.GetString(4),
            reader.GetInt64(5),
            reader.GetString(6),
            reader.GetString(7));
    }

    public async Task AddJournalStepAsync(
        string moveId,
        int stepOrder,
        string actionType,
        string payloadJson,
        bool completed,
        CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO TransactionJournal (MoveId, StepOrder, ActionType, PayloadJson, Completed)
            VALUES ($moveId, $order, $action, $payload, $completed);
            """;
        cmd.Parameters.AddWithValue("$moveId", moveId);
        cmd.Parameters.AddWithValue("$order", stepOrder);
        cmd.Parameters.AddWithValue("$action", actionType);
        cmd.Parameters.AddWithValue("$payload", payloadJson);
        cmd.Parameters.AddWithValue("$completed", completed ? 1 : 0);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task UpsertAttributionAsync(AttributionCacheRecord record, CancellationToken ct = default)
    {
        await using var conn = new SqliteConnection(_connectionString);
        await conn.OpenAsync(ct);
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO AttributionCache
                (FolderPath, ResolvedAppName, Publisher, ConfidenceScore, EvidenceSummary, Classification, SizeBytes, LastScannedUtc)
            VALUES ($path, $app, $pub, $score, $evidence, $cls, $size, $scanned)
            ON CONFLICT(FolderPath) DO UPDATE SET
                ResolvedAppName = excluded.ResolvedAppName,
                Publisher = excluded.Publisher,
                ConfidenceScore = excluded.ConfidenceScore,
                EvidenceSummary = excluded.EvidenceSummary,
                Classification = excluded.Classification,
                SizeBytes = excluded.SizeBytes,
                LastScannedUtc = excluded.LastScannedUtc;
            """;
        cmd.Parameters.AddWithValue("$path", record.FolderPath);
        cmd.Parameters.AddWithValue("$app", (object?)record.ResolvedAppName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$pub", (object?)record.Publisher ?? DBNull.Value);
        cmd.Parameters.AddWithValue("$score", record.ConfidenceScore);
        cmd.Parameters.AddWithValue("$evidence", record.EvidenceSummary);
        cmd.Parameters.AddWithValue("$cls", record.Classification);
        cmd.Parameters.AddWithValue("$size", record.SizeBytes);
        cmd.Parameters.AddWithValue("$scanned", record.LastScannedUtc);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
