namespace TierShift.Core.FileSystem;

public sealed record CopyProgress(long FilesCopied, long TotalFiles, long BytesCopied, long TotalBytes);

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

    public static async Task<DirectoryStats> CopyDirectoryVerifiedAsync(
        string sourceDir,
        string targetDir,
        IProgress<CopyProgress>? progress = null,
        CancellationToken ct = default)
    {
        var sourceStats = MeasureDirectory(sourceDir, ct);
        Directory.CreateDirectory(targetDir);

        long filesCopied = 0;
        long bytesCopied = 0;

        await Task.Run(() =>
        {
            CopyRecursive(sourceDir, targetDir, ref filesCopied, ref bytesCopied, sourceStats, progress, ct);
        }, ct);

        var targetStats = MeasureDirectory(targetDir, ct);
        if (targetStats.FileCount != sourceStats.FileCount || targetStats.TotalBytes != sourceStats.TotalBytes)
        {
            throw new IOException(
                $"Verified copy mismatch: source has {sourceStats.FileCount} files ({sourceStats.TotalBytes:N0} bytes), " +
                $"target has {targetStats.FileCount} files ({targetStats.TotalBytes:N0} bytes).");
        }

        progress?.Report(new CopyProgress(sourceStats.FileCount, sourceStats.FileCount, sourceStats.TotalBytes, sourceStats.TotalBytes));
        return targetStats;
    }

    private static void CopyRecursive(
        string sourceDir,
        string targetDir,
        ref long filesCopied,
        ref long bytesCopied,
        DirectoryStats totals,
        IProgress<CopyProgress>? progress,
        CancellationToken ct)
    {
        Directory.CreateDirectory(targetDir);

        foreach (var filePath in Directory.EnumerateFiles(sourceDir))
        {
            ct.ThrowIfCancellationRequested();
            var fileName = Path.GetFileName(filePath);
            var destPath = Path.Combine(targetDir, fileName);

            File.Copy(filePath, destPath, overwrite: true);

            var srcInfo = new FileInfo(filePath);
            File.SetCreationTimeUtc(destPath, srcInfo.CreationTimeUtc);
            File.SetLastWriteTimeUtc(destPath, srcInfo.LastWriteTimeUtc);

            filesCopied++;
            bytesCopied += srcInfo.Length;

            if (filesCopied % 25 == 0 || filesCopied == totals.FileCount)
            {
                progress?.Report(new CopyProgress(filesCopied, totals.FileCount, bytesCopied, totals.TotalBytes));
            }
        }

        foreach (var subDir in Directory.EnumerateDirectories(sourceDir))
        {
            ct.ThrowIfCancellationRequested();
            if ((File.GetAttributes(subDir) & FileAttributes.ReparsePoint) != 0)
                continue;

            var dirName = Path.GetFileName(subDir);
            var destSubDir = Path.Combine(targetDir, dirName);
            CopyRecursive(subDir, destSubDir, ref filesCopied, ref bytesCopied, totals, progress, ct);

            var srcDirInfo = new DirectoryInfo(subDir);
            Directory.SetCreationTimeUtc(destSubDir, srcDirInfo.CreationTimeUtc);
            Directory.SetLastWriteTimeUtc(destSubDir, srcDirInfo.LastWriteTimeUtc);
        }
    }
}
