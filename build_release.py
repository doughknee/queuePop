import os
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime
import importlib.util

# Load version without importing the whole src package
spec = importlib.util.spec_from_file_location("_version", "src/_version.py")
version_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(version_module)
VERSION = version_module.__version__

def clean_build_dirs():
    """Removes 'dist' and 'build' directories if they exist."""
    print("Cleanings 'dist' and 'build' directories...")
    for d in ["dist", "build"]:
        if os.path.exists(d):
            try:
                shutil.rmtree(d)
                print(f"Removed {d}")
            except Exception as e:
                print(f"Error removing {d}: {e}")
                sys.exit(1)

def fetch_assets():
    """Downloads the latest champion/role icons so the build bundles them."""
    print("Fetching League assets (champion + role icons)...")
    try:
        subprocess.check_call([sys.executable, "scripts/fetch_assets.py"])
    except subprocess.CalledProcessError as e:
        print(f"Asset fetch failed with exit code {e.returncode}")
        sys.exit(e.returncode)


def build_css():
    """Compiles the Tailwind stylesheet so the bundle ships precompiled CSS."""
    print("Building Tailwind CSS...")
    cmd = [
        "npx", "--yes", "tailwindcss@3.4.17",
        "-c", "tailwind.config.js",
        "-i", "src/webui/tailwind.src.css",
        "-o", "src/webui/styles.css",
        "--minify",
    ]
    try:
        # shell=True on Windows so the npx shim resolves on PATH.
        subprocess.check_call(cmd, shell=(sys.platform == "win32"))
    except subprocess.CalledProcessError as e:
        print(f"Tailwind build failed with exit code {e.returncode}")
        sys.exit(e.returncode)


def run_pyinstaller():
    """Runs PyInstaller using the current Python interpreter."""
    print("Running PyInstaller...")
    try:
        # Using sys.executable ensures we use the same python environment
        cmd = [sys.executable, "-m", "PyInstaller", "queueBot.spec"]
        subprocess.check_call(cmd)
        print("PyInstaller finished successfully.")
    except subprocess.CalledProcessError as e:
        print(f"PyInstaller failed with exit code {e.returncode}")
        sys.exit(e.returncode)

RELEASES_DIR = "releases"


def _ensure_releases_dir():
    if not os.path.exists(RELEASES_DIR):
        os.makedirs(RELEASES_DIR)
        print(f"Created '{RELEASES_DIR}' directory.")


def _built_exe():
    """Path to the PyInstaller output exe; exits if it's missing."""
    exe_name = "queueBot.exe" if sys.platform == "win32" else "queueBot"
    source_file = os.path.join("dist", exe_name)
    if not os.path.exists(source_file):
        print(f"Error: Source file '{source_file}' does not exist.")
        sys.exit(1)
    return exe_name, source_file


def create_zip_release():
    """Zips the built executable into the releases directory (portable flavour)."""
    _ensure_releases_dir()
    exe_name, source_file = _built_exe()
    zip_path = os.path.join(RELEASES_DIR, f"queueBot-v{VERSION}-portable.zip")
    print(f"Zipping portable release to {zip_path}...")
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(source_file, arcname=exe_name)
        print(f"Done! Portable release created at {zip_path}")
    except Exception as e:
        print(f"Error creating zip file: {e}")
        sys.exit(1)


def copy_bare_exe():
    """Drop a bare queueBot.exe into releases/ — the asset the portable
    auto-updater downloads (no unzip needed)."""
    _ensure_releases_dir()
    _, source_file = _built_exe()
    dest = os.path.join(RELEASES_DIR, "queueBot.exe")
    print(f"Copying bare exe to {dest}...")
    shutil.copy2(source_file, dest)


def _find_iscc():
    """Locate the Inno Setup compiler (ISCC). Checks PATH, then the default
    install dirs for Inno Setup 6/5."""
    found = shutil.which("iscc") or shutil.which("ISCC")
    if found:
        return found
    for base in (
        r"C:\Program Files (x86)\Inno Setup 6",
        r"C:\Program Files\Inno Setup 6",
        r"C:\Program Files (x86)\Inno Setup 5",
    ):
        cand = os.path.join(base, "ISCC.exe")
        if os.path.isfile(cand):
            return cand
    return None


def build_installer():
    """Compile the Inno Setup installer (the installed flavour). Skipped with a
    warning if ISCC isn't available, so devs without Inno Setup can still build
    the portable artifacts; CI installs it so the installer is always produced."""
    if sys.platform != "win32":
        print("Skipping installer build (not on Windows).")
        return
    iscc = _find_iscc()
    if not iscc:
        print("⚠️  Inno Setup (ISCC) not found — skipping installer build.")
        print("    Install it from https://jrsoftware.org/isdl.php to build the setup.exe.")
        return
    _ensure_releases_dir()
    print("Building installer with Inno Setup...")
    cmd = [iscc, f"/DMyAppVersion={VERSION}", os.path.join("installer", "queueBot.iss")]
    try:
        subprocess.check_call(cmd)
        print(f"Installer created at {os.path.join(RELEASES_DIR, f'queueBot-v{VERSION}-setup.exe')}")
    except subprocess.CalledProcessError as e:
        print(f"Installer build failed with exit code {e.returncode}")
        sys.exit(e.returncode)


def main():
    print("🔨 Building queueBot...")
    clean_build_dirs()
    fetch_assets()
    build_css()
    run_pyinstaller()
    create_zip_release()
    copy_bare_exe()
    build_installer()

if __name__ == "__main__":
    main()
