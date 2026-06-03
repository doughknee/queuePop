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

def create_zip_release():
    """Zips the built executable into the releases directory."""
    releases_dir = "releases"
    if not os.path.exists(releases_dir):
        os.makedirs(releases_dir)
        print(f"Created '{releases_dir}' directory.")

    zip_name = f"queueBot-v{VERSION}.zip"
    zip_path = os.path.join(releases_dir, zip_name)
    
    exe_name = "queueBot.exe" if sys.platform == "win32" else "queueBot"
    source_file = os.path.join("dist", exe_name)
    
    if not os.path.exists(source_file):
        print(f"Error: Source file '{source_file}' does not exist.")
        sys.exit(1)

    print(f"Zipping release to {zip_path}...")
    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            zipf.write(source_file, arcname=exe_name)
        print(f"Done! Release created at {zip_path}")
    except Exception as e:
        print(f"Error creating zip file: {e}")
        sys.exit(1)

def main():
    print("🔨 Building queueBot...")
    clean_build_dirs()
    fetch_assets()
    build_css()
    run_pyinstaller()
    create_zip_release()

if __name__ == "__main__":
    main()
