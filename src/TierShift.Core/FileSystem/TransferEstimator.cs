namespace TierShift.Core.FileSystem;

/// <summary>
/// Turns a stream of "bytes done so far" samples into a smoothed transfer speed and a
/// time-remaining estimate. Time is passed in by the caller so the maths is deterministic
/// and testable.
/// </summary>
public sealed class TransferEstimator
{
    private readonly double _smoothing;
    private readonly TimeSpan _minSampleInterval;
    private readonly TimeSpan _warmUp;
    private long _lastBytes;
    private TimeSpan _lastElapsed;
    private TimeSpan _latestElapsed;
    private double? _bytesPerSecond;

    /// <param name="smoothing">Weight of the newest sample (0–1). Lower is steadier.</param>
    /// <param name="minSampleInterval">Samples closer together than this are skipped.</param>
    /// <param name="warmUp">No time estimate is given before this much time has passed.</param>
    public TransferEstimator(double smoothing = 0.25, TimeSpan? minSampleInterval = null, TimeSpan? warmUp = null)
    {
        if (smoothing is <= 0 or > 1)
            throw new ArgumentOutOfRangeException(nameof(smoothing), "Smoothing must be in (0, 1].");
        _smoothing = smoothing;
        _minSampleInterval = minSampleInterval ?? TimeSpan.FromMilliseconds(500);
        _warmUp = warmUp ?? TimeSpan.FromSeconds(2);
    }

    /// <summary>Smoothed transfer speed, or null until there is enough data.</summary>
    public double? BytesPerSecond => _bytesPerSecond;

    public void Reset()
    {
        _lastBytes = 0;
        _lastElapsed = TimeSpan.Zero;
        _latestElapsed = TimeSpan.Zero;
        _bytesPerSecond = null;
    }

    /// <summary>Adds a sample: total bytes done, and time elapsed since the transfer started.</summary>
    public void Update(long bytesDone, TimeSpan elapsed)
    {
        _latestElapsed = elapsed;
        var dt = (elapsed - _lastElapsed).TotalSeconds;
        if (dt < _minSampleInterval.TotalSeconds)
            return;

        var delta = bytesDone - _lastBytes;
        _lastBytes = bytesDone;
        _lastElapsed = elapsed;
        if (delta < 0)
            return; // Counter went backwards (new transfer); re-baseline only.

        var instant = delta / dt;
        _bytesPerSecond = _bytesPerSecond is null
            ? instant
            : _smoothing * instant + (1 - _smoothing) * _bytesPerSecond.Value;
    }

    /// <summary>Estimated time left, or null while warming up or when speed is unknown or zero.</summary>
    public TimeSpan? EstimateRemaining(long bytesDone, long totalBytes)
    {
        if (_latestElapsed < _warmUp || _bytesPerSecond is not > 0)
            return null;
        var remaining = Math.Max(0, totalBytes - bytesDone);
        var seconds = remaining / _bytesPerSecond.Value;
        return seconds > TimeSpan.MaxValue.TotalSeconds / 2 ? null : TimeSpan.FromSeconds(Math.Ceiling(seconds));
    }

    /// <summary>Short human-readable duration: "45s", "4m 05s", "2h 07m".</summary>
    public static string FormatDuration(TimeSpan t)
    {
        if (t < TimeSpan.Zero)
            t = TimeSpan.Zero;
        if (t.TotalHours >= 1)
            return $"{(int)t.TotalHours}h {t.Minutes:00}m";
        if (t.TotalMinutes >= 1)
            return $"{t.Minutes}m {t.Seconds:00}s";
        return $"{Math.Max(1, (int)Math.Ceiling(t.TotalSeconds))}s";
    }
}
