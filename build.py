#!/usr/bin/env python3
"""
Build script for the wholesale-billing app.

  python3 build.py

What it does
  1. Concatenates src/js/*.js (in filename order)  ->  src/js/app.bundle.js   (used by src/index.html in dev)
  2. Inlines styles.css + app.bundle.js into a single self-contained file      ->  index.html  (this is what you host)

Why one file? You can open it directly, e-mail it, host it on GitHub Pages,
or drop it on any static host — no build step needed on the server.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
JS_DIR = SRC / "js"
OUT_FILE = ROOT / "index.html"

HEADER = """/*! Wholesale Store Billing — bundled {date}
 *  Built from src/js/*.js by build.py. Edit the src files, then re-run build.py.
 */
"""


def bundle_js() -> str:
    parts = sorted(JS_DIR.glob("*.js"))
    parts = [p for p in parts if p.name != "app.bundle.js"]
    if not parts:
        sys.exit("No JS files found in src/js")
    chunks = []
    for p in parts:
        chunks.append(f"\n/* ===== {p.name} ===== */\n" + p.read_text(encoding="utf-8"))
    body = HEADER.format(date=__import__("datetime").date.today().isoformat()) + "".join(chunks)
    (JS_DIR / "app.bundle.js").write_text(body, encoding="utf-8")
    print(f"  bundled {len(parts)} files -> src/js/app.bundle.js ({len(body):,} bytes)")
    return body


def build() -> None:
    js = bundle_js()
    css = (SRC / "styles.css").read_text(encoding="utf-8")
    html = (SRC / "index.html").read_text(encoding="utf-8")

    html = html.replace(
        '<link rel="stylesheet" href="./styles.css">',
        "<style>\n" + css + "\n</style>",
    )
    html = html.replace(
        '<script src="./js/app.bundle.js"></script>',
        "<script>\n" + js + "\n</script>",
    )
    if "<style>" not in html or "app.bundle" in html:
        sys.exit("Injection failed — check the template markers in src/index.html")

    OUT_FILE.write_text(html, encoding="utf-8")
    kb = len(html.encode("utf-8")) / 1024
    print(f"  wrote {OUT_FILE.relative_to(ROOT)} ({kb:,.1f} KB, single file — ready to host)")


if __name__ == "__main__":
    print("Building wholesale-billing app…")
    build()
    print("Done. Open index.html, or commit it to GitHub Pages.")
