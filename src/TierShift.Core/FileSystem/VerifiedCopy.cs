namespace TierShift.Core.FileSystem;

public enum CopyPhase
{
    /// <summary>Counting files and bytes in the source before copying.</summary>
    Scanning,
    /// <summary>Copying file contents.</summary>
    Copying,
    /// <summary>Re-measuring the target to verify file count and byte total.</summary>
    Verifying,
}

public sealed record CopyProgress(
    long FilesCopied,
    long TotalFiles,
    long BytesCopied,
    long TotalBytes,
    CopyPhase Phase = CopyPhase.Copying,
    string? CurrentFile = null)
{
    public double Fraction => TotalBytes > 0 ? Math.Clamp((double)BytesCopied / TotalBytes, 0, 1) : 0;
}

public sealed record DirectoryStats(long FileCount, long TotalBytes, DateTime LatestWriteUtc);

public static class VerifiedCopy
{
    public static DirectoryStats MeasureDirectory(string path, CancellationToken ct = default)
    {
        long fileCount = 0;
        long totalBytes = 0;
        var latestWrite = Directory.GetLastWriteTimeUtc(path);

        var stack = new Stack<string>();
        stack.Push(path);

        while (stack.Count > 0)
        {
            ct.ThrowIfCancellationRequested();
            var current = stack.Pop();

            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(current);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var file in files)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var fi = new FileInfo(file);
                    fileCount++;
                    totalBytes += fi.Length;
                    if (fi.LastWriteTimeUtc > latestWrite)
                        latestWrite = fi.LastWriteTimeUtc;
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                {
                    // Skip unreadable transient entries
                }
            }

            IEnumerable<string> subdirs;
            try
            {
                subdirs = Directory.EnumerateDirectories(current);
            }
            catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
            {
                continue;
            }

            foreach (var sub in subdirs)
            {
                try
                {
                    if ((File.GetAttributes(sub) & FileAttributes.ReparsePoint) != 0)
                        continue; // Do not recurse across nested junctions/symlinks
                    stack.Push(sub);
                }
                catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
                {
                }
            }
        }

        return new DirectoryStats(fileCount, totalBytes, latestWrite);
    }

    /// <summary>Files at least this large are copied in chunks so progress moves during the file.</summary>
    public const long ChunkedCopyThresholdBytes = 8L * 1024 * 1024;
    private const int ChunkSizeBytes = 1024 * 1024;
    private static readonly TimeSpan DefaultReportInterval = TimeSpan.FromMilliseconds(200);

    public static async Task<DirectoryStats> CopyDirectoryVerifiedAsync(
        string sourceDir,
        string targetDir,
        IProgress<CopyProgress>? progress = null,
        CancellationToken ct = default,
        TimeSpan? reportInterval = null)
    {
        progress?.Report(new CopyProgress(0, 0, 0, 0, CopyPhase.Scanning));
        var sourceStats = await Task.Run(() => MeasureDirectory(sourceDir, ct), ct);
        Directory.CreateDirectory(targetDir);

        var state = new CopyState(sourceStats, progress, reportInterval ?? DefaultReportInterval);
        state.Report(force: true);

        await Task.Run(() => CopyRecursive(sourceDir, targetDir, state, ct), ct);
        state.Report(force: true);

        progress?.Report(new CopyProgress(state.FilesCopied, sourceStats.FileCount, state.BytesCopied, sourceStats.TotalBytes, CopyPhase.Verifying));
        var targetStats = await Task.Run(() => MeasureDirectory(targetDir, ct), ct);
        if (targetStats.FileCount != sourceStats.FileCount || targetStats.TotalBytes != sourceStats.TotalBytes)
        {
            throw new IOException(
                $"Verified copy mismatch: source has {sourceStats.FileCount} files ({sourceStats.TotalBytes:N0} bytes), " +
                $"target has {targetStats.FileCount} files ({targetStats.TotalBytes:N0} bytes).");
        }

        progress?.Report(new CopyProgress(sourceStats.FileCount, sourceStats.FileCount, sourceStats.TotalBytes, sourceStats.TotalBytes, CopyPhase.Verifying));
        return targetStats;
    }

    private sealed class CopyState(DirectoryStats totals, IProgress<CopyProgress>? progress, TimeSpan reportInterval)
    {
        private readonly System.Diagnostics.Stopwatch _sinceReport = System.Diagnostics.Stopwatch.StartNew();

        public long FilesCopied;
        public long BytesCopied;
        public string? CurrentFile;

        /// <summary>Reports at most once per report interval unless forced.</summary>
        public void Report(bool force = false)
        {
            if (progress == null || (!force && _sinceReport.Elapsed < reportInterval))
                return;
            _sinceReport.Restart();
            progress.Report(new CopyProgress(FilesCopied, totals.FileCount, BytesCopied, totals.TotalBytes, CopyPhase.Copying, CurrentFile));
        }
    }

    private static void CopyRecursive(string sourceDir, string targetDir, CopyState state, CancellationToken ct)
    {
        Directory.CreateDirectory(targetDir);

        foreach (var filePath in Directory.EnumerateFiles(sourceDir))
        {
            ct.ThrowIfCancellationRequested();
            var destPath = Path.Combine(targetDir, Path.GetFileName(filePath));
            var srcInfo = new FileInfo(filePath);
            state.CurrentFile = filePath;

            if (srcInfo.Length >= ChunkedCopyThresholdBytes)
            {
                CopyFileChunked(filePath, destPath, state, ct);
                // Carry over the simple attributes that File.Copy would; ReadOnly is applied last.
                const FileAttributes copyable = FileAttributes.Hidden | FileAttributes.System | FileAttributes.Archive;
                var attrs = srcInfo.Attributes & copyable;
                File.SetAttributes(destPath, attrs == 0 ? FileAttributes.Normal : attrs);
            }
            else
            {
                File.Copy(filePath, destPath, overwrite: true);
                state.BytesCopied += srcInfo.Length;
            }

            File.SetCreationTimeUtc(destPath, srcInfo.CreationTimeUtc);
            File.SetLastWriteTimeUtc(destPath, srcInfo.LastWriteTimeUtc);
            if ((srcInfo.Attributes & FileAttributes.ReadOnly) != 0)
                File.SetAttributes(destPath, File.GetAttributes(destPath) | FileAttributes.ReadOnly);

            state.FilesCopied++;
            state.Report();
        }

        foreach (var subDir in Directory.EnumerateDirectories(sourceDir))
        {
            ct.ThrowIfCancellationRequested();
            if ((File.GetAttributes(subDir) & FileAttributes.ReparsePoint) != 0)
                continue;

            var destSubDir = Path.Combine(targetDir, Path.GetFileName(subDir));
            CopyRecursive(subDir, destSubDir, state, ct);

            var srcDirInfo = new DirectoryInfo(subDir);
            Directory.SetCreationTimeUtc(destSubDir, srcDirInfo.CreationTimeUtc);
            Directory.SetLastWriteTimeUtc(destSubDir, srcDirInfo.LastWriteTimeUtc);
        }
    }

    /// <summary>
    /// Copies one large file in 1 MB chunks, reporting progress as it goes. If the copy fails or
    /// is cancelled, the partial destination file is removed.
    /// </summary>
    private static void CopyFileChunked(string sourcePath, string destPath, CopyState state, CancellationToken ct)
    {
        var buffer = new byte[ChunkSizeBytes];
        try
        {
            using var src = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, ChunkSizeBytes, FileOptions.SequentialScan);
            using var dst = new FileStream(destPath, FileMode.Create, FileAccess.Write, FileShare.None, ChunkSizeBytes, FileOptions.SequentialScan);
            dst.SetLength(src.Length);

            int read;
            while ((read = src.Read(buffer, 0, buffer.Length)) > 0)
            {
                ct.ThrowIfCancellationRequested();
                dst.Write(buffer, 0, read);
                state.BytesCopied += read;
                state.Report();
            }
        }
        catch
        {
            try { File.Delete(destPath); } catch { /* best effort */ }
            throw;
        }
    }
}
