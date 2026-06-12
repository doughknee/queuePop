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

; Lets the silent updater close the running app via the Windows Restart
; Manager. AppMutex must match the *exact* mutex name (namespace and all)
; created in src/main.py — it's "Global\queuePop_Instance_Mutex".
; Restart Manager is only a backup here: the app is a tray app that cancels
; graceful close requests, so InitializeSetup below also hard-kills it.
; RestartApplications=no on purpose: the [Run] postinstall entry is the one
; and only relauncher. With both enabled, RM could race a second copy against
; it; the relaunch must be deterministic so a failed one is diagnosable.
CloseApplications=yes
RestartApplications=no
AppMutex=Global\queuePop_Instance_Mutex

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
; Launch after install — interactively as the usual "Launch queuePop" checkbox,
; and (without skipifsilent) automatically after a silent auto-update too. This
; is the ONLY relauncher (RestartApplications=no above): the app refuses
; graceful close so it's hard-killed below, and a killed app isn't restarted by
; RM anyway. If the old process is still tearing down at this point, the new
; build's single-instance check retries for ~6s instead of bouncing off it.
Filename: "{app}\{#MyAppExe}"; Description: "Launch {#MyAppName}"; \
    Flags: nowait postinstall

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // Free the locked exe before we copy over it. queuePop runs in the system
  // tray and its window-close handler cancels graceful shutdown, so neither the
  // Restart Manager nor the app's own updater reliably ends the process. A hard
  // taskkill is the only dependable way to release the file for a silent
  // update. Runs before the AppMutex check, so the stale mutex clears too.
  // No-ops (and is ignored) when nothing is running, e.g. a fresh install.
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM {#MyAppExe}', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // Give Windows a beat to release the file handle after the process dies.
  Sleep(800);
  Result := True;
end;
