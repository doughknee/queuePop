# queuePop dev tasks -- run from the repo root.
#
# NOTE: `make` is not installed by default on Windows. Install it once with
#   winget install ezwinports.make      (or)   choco install make
# ...or skip make entirely:  double-click run.cmd, or run  py src/main.py
#
# Python is invoked through the `py` launcher, NOT bare `python` -- on this
# machine `python` resolves to the Windows Store stub, which crashes the app
# on startup.

PY := py

.PHONY: help run stop restart css build clean

help:
	@echo queuePop dev tasks:
	@echo   make run     - launch the app (web UI + tray), detached
	@echo   make stop    - kill the running app
	@echo   make restart - stop then relaunch (handy while iterating)
	@echo   make css     - rebuild Tailwind styles.css from the markup classes
	@echo   make build   - build the release .exe via build_release.py
	@echo   make clean   - remove build/ and __pycache__ artifacts

# Launch via run.cmd so the app gets its own (hidden) console and never
# hijacks the terminal you ran make from. `cmd /c` works whether make's
# shell is sh or cmd.
run:
	cmd /c .\run.cmd

# Kill the app via stop.cmd (kills the py/python process that launched
# src/main.py). Delegating to a .cmd keeps the kill one-liner out of make's
# hands so its literal `$_` survives. The `.\` prefix is required so cmd
# resolves the script even where the current-directory search is disabled
# (the NoDefaultCurrentDirectoryInExePath policy) -- same reason run uses it.
stop:
	@echo Stopping queuePop...
	cmd /c .\stop.cmd

# Stop, give the old process a moment to release its tray icon / sockets,
# then relaunch.
restart: stop
	@powershell -NoProfile -Command "Start-Sleep -Milliseconds 800"
	@echo Restarting queuePop...
	cmd /c .\run.cmd

css:
	npx tailwindcss@3.4.17 -c tailwind.config.js -i src/webui/tailwind.src.css -o src/webui/styles.css --minify

build:
	$(PY) build_release.py

clean:
	$(PY) -c "import shutil; shutil.rmtree('build', ignore_errors=True); shutil.rmtree('src/__pycache__', ignore_errors=True); shutil.rmtree('__pycache__', ignore_errors=True)"
