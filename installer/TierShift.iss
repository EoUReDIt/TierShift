; TierShift Recommended Windows Installer (Inno Setup 6)
; Tailored for Unpackaged WinUI 3 (.NET 8 self-contained win-x64) with Administrator elevation.

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

#ifndef PublishDir
  #define PublishDir "..\src\TierShift.App\bin\Release\net8.0-windows10.0.22621.0\win-x64\publish"
#endif

#ifndef OutputDir
  #define OutputDir "..\artifacts\release"
#endif

#define MyAppName "TierShift"
#define MyAppPublisher "TierShift Project"
#define MyAppExeName "TierShift.App.exe"

[Setup]
AppId={{9F4C28E1-6D4B-4C7A-A420-81B32F09C512}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Require Windows 10 22H2 (19045) / Windows 11 x64
MinVersion=10.0.19045
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; Elevated install matches requireAdministrator manifest for NTFS Junction & HKLM access
PrivilegesRequired=admin
OutputDir={#OutputDir}
OutputBaseFilename=TierShift-Setup-{#MyAppVersion}-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent runascurrentuser

[UninstallDelete]
; Preserve user SQLite MoveLedger and State Capsules in ProgramData/D:\TierShift during uninstall
Type: dirifempty; Name: "{app}"
