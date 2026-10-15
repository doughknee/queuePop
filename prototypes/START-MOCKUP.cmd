@echo off
cd /d "%~dp0"
py -3 start-mockup.py
if errorlevel 1 (
  echo.
  echo Could not start. This launcher needs Python 3 installed with the Windows py launcher.
  pause
)
