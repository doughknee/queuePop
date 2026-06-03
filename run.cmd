@echo off
REM ============================================================
REM  queueBot launcher  --  double-click this file, or run  .\run.cmd
REM
REM  Uses the `py` launcher instead of bare `python`: on this machine
REM  `python` resolves to the Windows Store stub, which crashes the app
REM  on startup. `cd /d "%~dp0"` guarantees we launch from the repo root
REM  so the tray icon and web-UI asset paths resolve correctly.
REM
REM  `start` gives Python its own console window, which the app instantly
REM  hides to the tray -- so launching from a terminal won't hide yours.
REM ============================================================
cd /d "%~dp0"
start "queueBot" py src\main.py
