#!/usr/bin/env python3
"""Test the numerical model and build the dependency-free static site."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "public"
VERSION = "v10"


def page(content, title, description):
    css = (SRC / "base.css").read_text()
    return f'''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{description}">
<title>{title} | 1cf.energy</title>
<style>{css}
.publication-supplement {{ max-width: 1040px; margin: 0 auto; padding: 20px 16px; }}
.publication-method {{ margin-top: 24px; }}
.publication-footer {{ margin-top: 28px; padding-top: 12px; border-top: 1px solid var(--border); }}
.publication-footer a {{ color: inherit; }}
.model-document {{ max-width: 780px; }}
.model-document p, .model-document li {{ line-height: 1.55; }}
.model-document h2 {{ margin-top: 24px; }}
@media (max-width: 440px) {{ .publication-supplement {{ padding: 12px 8px; }} }}
</style></head><body><main class="publication-supplement">
{content}
</main></body></html>
'''


def dashboard():
    fragment = (SRC / "interface.html").read_text()
    for marker, filename in [("COMPACT_MODEL", "model.js"), ("COMPACT_VIEW", "view.js")]:
        code = (SRC / filename).read_text().replace("</script", "<\\/script")
        fragment = fragment.replace("<!-- " + marker + " -->", "<script>\n" + code + "\n</script>")
    if "<!-- COMPACT_" in fragment:
        raise ValueError("Unresolved build marker")
    library = (SRC / "vendor/d3-7.9.0.min.js").read_text()
    license_text = (SRC / "vendor/D3-LICENSE.txt").read_text()
    fragment = fragment.replace(
        '<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>',
        "<!-- D3 v7.9.0 license\n" + license_text + "\n-->\n<script>\n" + library + "\n</script>")
    if '<script src=' in fragment:
        raise ValueError("The dashboard must not depend on external scripts")
    method = (SRC / "calculation-scope.html").read_text()
    footer = '''<footer class="publication-footer text-small text-muted">
<a href="https://1cf.energy">1cf.energy</a> · Model v10 ·
<a href="model.html">Calculation details</a> ·
<a href="https://github.com/1cFE/learning">Source and reproduction</a> ·
<a href="/v10/">Article version</a>
</footer>'''
    return page(fragment + method + footer,
                "Compact fusion learning and production",
                "Explore hypothetical compact and large fusion learning curves, production, wholesale crossover and lifetime premiums.")


def model_notes():
    return page((SRC / "model-notes.html").read_text(),
                "Learning model assumptions and source",
                "Assumptions, production schedules, premium calculations and numerical source for the fusion learning dashboard.")


def build():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--freeze-v10", action="store_true",
                        help="Create the first article snapshot. Refuses to replace an existing snapshot.")
    args = parser.parse_args()
    node = os.environ.get("NODE", "node")
    subprocess.run([node, str(SRC / "model-test.cjs")], cwd=ROOT, check=True)
    OUT.mkdir(exist_ok=True)
    (OUT / "index.html").write_text(dashboard())
    (OUT / "model.html").write_text(model_notes())
    for source, destination in [
        (SRC / "model.js", "model.js"),
        (SRC / "MODEL-API.md", "MODEL-API.md"),
        (ROOT / "scripts/four_case_trajectory.py", "reference.py"),
        (SRC / "vendor/D3-LICENSE.txt", "D3-LICENSE.txt"),
    ]:
        shutil.copyfile(source, OUT / destination)
    snapshot = OUT / VERSION
    names = ["index.html", "model.html", "model.js", "MODEL-API.md", "reference.py", "D3-LICENSE.txt"]
    if args.freeze_v10:
        if snapshot.exists():
            raise SystemExit("The v10 snapshot already exists. A published version must not be replaced.")
        snapshot.mkdir()
        for name in names:
            shutil.copyfile(OUT / name, snapshot / name)
        manifest = {name: hashlib.sha256((snapshot / name).read_bytes()).hexdigest() for name in names}
        (snapshot / "sha256.json").write_text(json.dumps(manifest, indent=2) + "\n")
    if not (snapshot / "sha256.json").exists():
        raise SystemExit("Missing article snapshot. Run once with --freeze-v10 before deployment.")
    for name, digest in json.loads((snapshot / "sha256.json").read_text()).items():
        actual = hashlib.sha256((snapshot / name).read_bytes()).hexdigest()
        if actual != digest:
            raise SystemExit("Frozen article snapshot changed: " + name)
    (OUT / "_headers").write_text('''/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/v10/*
  Cache-Control: public, max-age=3600
''')
    print("Built public/; verified the frozen article snapshot in public/v10/.")


if __name__ == "__main__":
    build()
