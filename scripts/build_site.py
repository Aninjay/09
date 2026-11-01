"""Create an allowlisted static deploy folder; private source files are excluded."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
if DIST.exists():
    shutil.rmtree(DIST)
for relative in ("index.html", "assets/logo.png", "assets/campus-bg.jpg", "css/style.css", "js/app.js", "js/data.js"):
    source = ROOT / relative
    target = DIST / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

print("Built dist/ for static hosting. No database or environment variables are required.")
