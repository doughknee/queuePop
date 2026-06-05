# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_submodules

# PyInstaller resolves a spec's input paths relative to the spec file's own
# directory, not the working directory. This spec lives in scripts/, so anchor
# everything to the repo root (one level up) and use absolute paths. SPECPATH is
# the directory containing this .spec file.
ROOT = os.path.dirname(SPECPATH)

a = Analysis(
    [os.path.join(ROOT, 'src', 'main.py')],
    pathex=[os.path.join(ROOT, 'src')],
    binaries=[],
    datas=[
        (os.path.join(ROOT, 'assets', 'queuepop.ico'), 'assets'),
        (os.path.join(ROOT, 'src', 'webui'), 'webui'),
    ],
    hiddenimports=(
        ['rich', 'pystray', 'PIL', 'webview', 'clr', 'aiohttp', 'qrcode']
        + collect_submodules('plyer')
        + collect_submodules('webview')
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='queuePop',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[os.path.join(ROOT, 'assets', 'queuepop.ico')],
)