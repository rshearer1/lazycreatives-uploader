# PyInstaller spec — freezes the FastAPI sidecar into a single binary the packaged
# Electron app spawns (so end users need no system Python).
# Build:  pyinstaller sidecar.spec --noconfirm --distpath dist
# Output: dist/lazyupload-sidecar(.exe)
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = (
    collect_submodules("uvicorn")
    + collect_submodules("apscheduler")
    + ["lazyupload.server", "lazyupload.api.app"]
)

a = Analysis(
    ["lazyupload/server.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="lazyupload-sidecar",
    console=True,
    disable_windowed_traceback=False,
    upx=True,
)
