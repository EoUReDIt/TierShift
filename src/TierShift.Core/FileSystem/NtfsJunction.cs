using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace TierShift.Core.FileSystem;

/// <summary>
/// Creates, inspects, verifies, and deletes NTFS Directory Junctions (IO_REPARSE_TAG_MOUNT_POINT)
/// using Win32 DeviceIoControl and GetFinalPathNameByHandleW.
/// </summary>
public static class NtfsJunction
{
    public const uint IO_REPARSE_TAG_MOUNT_POINT = 0xA0000003;
    private const uint FSCTL_SET_REPARSE_POINT = 0x000900A4;
    private const uint FSCTL_DELETE_REPARSE_POINT = 0x000900AC;
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint FILE_NAME_NORMALIZED = 0x0;

    public static bool IsJunction(string path)
    {
        if (!Directory.Exists(path)) return false;
        return (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;
    }

    public static void Create(string junctionPath, string targetPath)
    {
        var fullJunction = Path.GetFullPath(junctionPath).TrimEnd('\\');
        var fullTarget = Path.GetFullPath(targetPath).TrimEnd('\\');

        if (!Directory.Exists(fullJunction))
            Directory.CreateDirectory(fullJunction);

        var substituteName = @"\??\" + fullTarget;
        var printName = fullTarget;

        var substituteBytes = Encoding.Unicode.GetBytes(substituteName);
        var printBytes = Encoding.Unicode.GetBytes(printName);

        // REPARSE_DATA_BUFFER layout for MountPointReparseBuffer:
        // [0..3]   uint   ReparseTag
        // [4..5]   ushort ReparseDataLength
        // [6..7]   ushort Reserved
        // [8..9]   ushort SubstituteNameOffset
        // [10..11] ushort SubstituteNameLength
        // [12..13] ushort PrintNameOffset
        // [14..15] ushort PrintNameLength
        // [16..]   PathBuffer (SubstituteName + \0 + PrintName + \0)
        int pathBufferLength = substituteBytes.Length + 2 + printBytes.Length + 2;
        ushort reparseDataLength = checked((ushort)(8 + pathBufferLength));
        int totalLength = 8 + reparseDataLength;

        var buffer = new byte[totalLength];
        BitConverter.GetBytes(IO_REPARSE_TAG_MOUNT_POINT).CopyTo(buffer, 0);
        BitConverter.GetBytes(reparseDataLength).CopyTo(buffer, 4);
        BitConverter.GetBytes((ushort)0).CopyTo(buffer, 6);
        BitConverter.GetBytes((ushort)0).CopyTo(buffer, 8);
        BitConverter.GetBytes((ushort)substituteBytes.Length).CopyTo(buffer, 10);
        BitConverter.GetBytes((ushort)(substituteBytes.Length + 2)).CopyTo(buffer, 12);
        BitConverter.GetBytes((ushort)printBytes.Length).CopyTo(buffer, 14);
        substituteBytes.CopyTo(buffer, 16);
        printBytes.CopyTo(buffer, 16 + substituteBytes.Length + 2);

        using var handle = OpenDirectoryHandle(fullJunction, GENERIC_WRITE, openReparsePoint: true);
        if (handle.IsInvalid)
            throw new Win32Exception(Marshal.GetLastWin32Error(), $"Failed to open directory for junction creation: {fullJunction}");

        if (!DeviceIoControl(
            handle,
            FSCTL_SET_REPARSE_POINT,
            buffer,
            (uint)buffer.Length,
            IntPtr.Zero,
            0,
            out _,
            IntPtr.Zero))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), $"FSCTL_SET_REPARSE_POINT failed on {fullJunction}");
        }
    }

    public static void Delete(string junctionPath)
    {
        var fullJunction = Path.GetFullPath(junctionPath).TrimEnd('\\');
        if (!Directory.Exists(fullJunction))
            return;

        if (IsJunction(fullJunction))
        {
            var header = new byte[8];
            BitConverter.GetBytes(IO_REPARSE_TAG_MOUNT_POINT).CopyTo(header, 0);
            using var handle = OpenDirectoryHandle(fullJunction, GENERIC_WRITE, openReparsePoint: true);
            if (!handle.IsInvalid)
            {
                DeviceIoControl(
                    handle,
                    FSCTL_DELETE_REPARSE_POINT,
                    header,
                    (uint)header.Length,
                    IntPtr.Zero,
                    0,
                    out _,
                    IntPtr.Zero);
            }
        }

        Directory.Delete(fullJunction, recursive: false);
    }

    public static string? ResolveFinalPath(string path)
    {
        var fullPath = Path.GetFullPath(path).TrimEnd('\\');
        using var handle = OpenDirectoryHandle(fullPath, GENERIC_READ, openReparsePoint: false);
        if (handle.IsInvalid)
            return null;

        var sb = new StringBuilder(1024);
        uint len = GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, FILE_NAME_NORMALIZED);
        if (len == 0)
            return null;

        if (len >= sb.Capacity)
        {
            sb = new StringBuilder((int)len + 1);
            len = GetFinalPathNameByHandleW(handle, sb, (uint)sb.Capacity, FILE_NAME_NORMALIZED);
            if (len == 0) return null;
        }

        var resolved = sb.ToString();
        if (resolved.StartsWith(@"\\?\", StringComparison.Ordinal))
            resolved = resolved[4..];
        return resolved.TrimEnd('\\');
    }

    public static bool VerifyResolvesTo(string junctionPath, string expectedTarget)
    {
        if (!Directory.Exists(junctionPath) || !IsJunction(junctionPath))
            return false;

        var resolvedJunction = ResolveFinalPath(junctionPath);
        if (string.IsNullOrEmpty(resolvedJunction))
            return false;

        var resolvedExpected = ResolveFinalPath(expectedTarget)
            ?? Path.GetFullPath(expectedTarget).TrimEnd('\\');

        return resolvedJunction.Equals(resolvedExpected, StringComparison.OrdinalIgnoreCase);
    }

    private static SafeFileHandle OpenDirectoryHandle(string path, uint desiredAccess, bool openReparsePoint)
    {
        uint flags = FILE_FLAG_BACKUP_SEMANTICS | (openReparsePoint ? FILE_FLAG_OPEN_REPARSE_POINT : 0);
        return CreateFileW(
            path,
            desiredAccess,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flags,
            IntPtr.Zero);
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DeviceIoControl(
        SafeFileHandle hDevice,
        uint dwIoControlCode,
        byte[] lpInBuffer,
        uint nInBufferSize,
        IntPtr lpOutBuffer,
        uint nOutBufferSize,
        out uint lpBytesReturned,
        IntPtr lpOverlapped);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle hFile,
        StringBuilder lpszFilePath,
        uint cchFilePath,
        uint dwFlags);
}
