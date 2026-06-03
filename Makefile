# queueBot dev tasks -- run from the repo root.
#
# NOTE: `make` is not installed by default on Windows. Install it once with
#   winget install ezwinports.make      (or)   choco install make
# ...or skip make entirely:  double-click run.cmd, or run  py src/main.py
#
# Python is invoked through the `py` launcher, NOT bare `python` -- on this
# machine `python` resolves to the Windows Store stub, which crashes the app
# on startup.

PY := py

.PHONY: help run css build clean

help:
	@echo queueBot dev tasks:
	@echo   make run    - launch the app (web UI + tray), detached
	@echo   make css    - rebuild Tailwind styles.css from the markup classes
	@echo   make build  - build the release .exe via build_release.py
	@echo   make clean  - remove build/ and __pycache__ artifacts

# Launch via run.cmd so the app gets its own (hidden) console and never
# hijacks the terminal you ran make from. `cmd /c` works whether make's
# shell is sh or cmd.
run:
	cmd /c run.cmd

css:
	npx tailwindcss@3.4.17 -c tailwind.config.js -i src/webui/tailwind.src.css -o src/webui/styles.css --minify

build:
	$(PY) build_release.py

clean:
	$(PY) -c "import shutil; shutil.rmtree('build', ignore_errors=True); shutil.rmtree('src/__pycache__', ignore_errors=True); shutil.rmtree('__pycache__', ignore_errors=True)"
