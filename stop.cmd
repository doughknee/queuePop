@echo off
REM ============================================================
REM  queuePop stopper  --  double-click this file, or run  .\stop.cmd
REM  (or use  make stop  /  make restart).
REM
REM  Kills the py/python process whose command line launched src\main.py.
REM  Scoping to py*.exe avoids touching unrelated Python (e.g. a Tailwind
REM  or http.server dev process, whose command lines don't contain main.py).
REM  Running PowerShell from cmd keeps $_ literal (cmd doesn't expand $),
REM  so this works regardless of which shell `make` uses.
REM ============================================================
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'py*.exe' -and $_.CommandLine -like '*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
