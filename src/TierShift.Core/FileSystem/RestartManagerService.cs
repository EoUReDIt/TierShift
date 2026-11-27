using System.Runtime.InteropServices;

namespace TierShift.Core.FileSystem;

public sealed record LockingProcessInfo(int Pid, string AppName, string ServiceShortName, bool IsClosable);

/// <summary>
/// Wraps Windows Restart Manager (rstrtmgr.dll) to detect and optionally shut down
/// user processes holding open handles inside a directory slated for relocation.
/// </summary>
public static class RestartManagerService
{
    private const int ERROR_MORE_DATA = 234;
    private const int CCH_RM_MAX_APP_NAME = 255;
    private const int CCH_RM_MAX_SVC_NAME = 63;

    public static IReadOnlyList<LockingProcessInfo> FindLockingProcesses(string directoryPath, int maxFilesToProbe = 256)
    {
        if (!Directory.Exists(directoryPath))
            return [];

        var files = new List<string>(maxFilesToProbe);
        try
        {
            foreach (var f in Directory.EnumerateFiles(directoryPath, "*", SearchOption.AllDirectories))
            {
                files.Add(f);
                if (files.Count >= maxFilesToProbe)
                    break;
            }
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            // Probe whatever files were enumerable
        }

        if (files.Count == 0)
            return [];

        string sessionKey = Guid.NewGuid().ToString("N");
        int startRes = RmStartSession(out uint handle, 0, sessionKey);
        if (startRes != 0)
            return [];

        try
        {
            var resources = files.ToArray();
            int regRes = RmRegisterResources(handle, (uint)resources.Length, resources, 0, null, 0, null);
            if (regRes != 0)
                return [];

            uint pnProcInfoNeeded = 0;
            uint pnProcInfo = 0;
            uint rebootReasons = 0;

            int listRes = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, null, ref rebootReasons);
            if (listRes != ERROR_MORE_DATA || pnProcInfoNeeded == 0)
                return [];

            var processInfo = new RM_PROCESS_INFO[pnProcInfoNeeded];
            pnProcInfo = pnProcInfoNeeded;

            listRes = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, processInfo, ref rebootReasons);
            if (listRes != 0)
                return [];

            var results = new List<LockingProcessInfo>();
            var seen = new HashSet<int>();

            for (int i = 0; i < pnProcInfo; i++)
            {
                var info = processInfo[i];
                int pid = info.Process.dwProcessId;
                if (!seen.Add(pid)) continue;

                bool isClosable = info.ApplicationType is RM_APP_TYPE.RmMainWindow or RM_APP_TYPE.RmOtherWindow or RM_APP_TYPE.RmConsole
                                  && info.ApplicationType != RM_APP_TYPE.RmCritical;

                results.Add(new LockingProcessInfo(
                    pid,
                    string.IsNullOrWhiteSpace(info.strAppName) ? $"PID {pid}" : info.strAppName,
                    info.strServiceShortName ?? string.Empty,
                    isClosable));
            }

            return results;
        }
        finally
        {
            RmEndSession(handle);
        }
    }

    public static bool TryShutdownClosableProcesses(string directoryPath)
    {
        var locks = FindLockingProcesses(directoryPath);
        if (locks.Count == 0) return true;
        if (locks.Any(l => !l.IsClosable)) return false;

        foreach (var proc in locks)
        {
            try
            {
                using var p = System.Diagnostics.Process.GetProcessById(proc.Pid);
                if (!p.HasExited)
                {
                    p.CloseMainWindow();
                    if (!p.WaitForExit(3500))
                        p.Kill(entireProcessTree: true);
                }
            }
            catch
            {
                // Process may have already exited
            }
        }

        return FindLockingProcesses(directoryPath).Count == 0;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RM_UNIQUE_PROCESS
    {
        public int dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    private enum RM_APP_TYPE
    {
        RmUnknownApp = 0,
        RmMainWindow = 1,
        RmOtherWindow = 2,
        RmService = 3,
        RmExplorer = 4,
        RmConsole = 5,
        RmCritical = 1000
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct RM_PROCESS_INFO
    {
        public RM_UNIQUE_PROCESS Process;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)]
        public string strAppName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)]
        public string strServiceShortName;

        public RM_APP_TYPE ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;

        [MarshalAs(UnmanagedType.Bool)]
        public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmEndSession(uint pSessionHandle);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    private static extern int RmRegisterResources(
        uint pSessionHandle,
        uint nFiles,
        string[] rgsFileNames,
        uint nApplications,
        RM_UNIQUE_PROCESS[]? rgApplications,
        uint nServices,
        string[]? rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    private static extern int RmGetList(
        uint dwSessionHandle,
        out uint pnProcInfoNeeded,
        ref uint pnProcInfo,
        [In, Out] RM_PROCESS_INFO[]? rgAffectedApps,
        ref uint lpdwRebootReasons);
}
