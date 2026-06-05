@echo off
REM ============================================================
REM  queuePop launcher  --  double-click this file, or run  .\scripts\run.cmd
REM
REM  Uses the `py` launcher instead of bare `python`: on this machine
REM  `python` resolves to the Windows Store stub, which crashes the app
REM  on startup. `cd /d "%~dp0.."` jumps from scripts\ to the repo root so
REM  the tray icon and web-UI asset paths resolve correctly.
REM
REM  `start` gives Python its own console window, which the app instantly
REM  hides to the tray -- so launching from a terminal won't hide yours.
REM ============================================================
cd /d "%~dp0.."
start "queuePop" py src\main.py
