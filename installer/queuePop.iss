; Inno Setup script for queuePop.
;
; Builds the installed flavour of the app (the portable zip is produced
; separately by build_release.py). Compile with the version baked in:
;
;     iscc /DMyAppVersion=1.2.0 installer\queuePop.iss
;
; build_release.py and the GitHub release workflow pass /DMyAppVersion from
; src/_version.py, so the installer version always matches the build.

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "queuePop"
#define MyAppExe "queuePop.exe"
#define MyAppPublisher "Brandon Harris"
#define MyAppUrl "https://github.com/brandon-relentnet/queuePop"

[Setup]
; AppId "queuePop" makes Inno write its uninstall data under
; ...\Uninstall\queuePop_is1 — the exact key src/updater.py probes to tell an
; installed build from a portable one. Don't rename it without updating
; _UNINSTALL_KEY there too.
AppId=queuePop
; All relative paths below (Source, SetupIconFile, OutputDir) resolve against
; this dir. The script lives in installer/, so ".." points at the project root
; where dist/, assets/, and releases/ actually are.
SourceDir=..
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}
AppUpdatesURL={#MyAppUrl}/releases

; Per-user install under %LocalAppData% so the silent auto-update never needs a
; UAC prompt (no admin rights required).
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
DisableDirPage=auto

; Lets the silent updater close + relaunch the running app via the Windows
; Restart Manager. The name matches the mutex created in src/main.py.
CloseApplications=yes
RestartApplications=yes
AppMutex=queuePop_Instance_Mutex

OutputDir=releases
OutputBaseFilename=queuePop-v{#MyAppVersion}-setup
SetupIconFile=assets\queuepop.ico
UninstallDisplayIcon={app}\{#MyAppExe}
WizardStyle=modern
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "startup"; Description: "Start {#MyAppName} when I sign in to Windows"; GroupDescription: "Startup:"

[Files]
Source: "dist\{#MyAppExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Registry]
; "Run at sign-in" — only written when the user ticks the Startup task.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "{#MyAppName}"; ValueData: """{app}\{#MyAppExe}"""; \
    Flags: uninsdeletevalue; Tasks: startup

[Run]
; Launch after an interactive install. skipifsilent so a silent auto-update
; doesn't double-launch — the Restart Manager relaunches us in that path.
Filename: "{app}\{#MyAppExe}"; Description: "Launch {#MyAppName}"; \
    Flags: nowait postinstall skipifsilent
