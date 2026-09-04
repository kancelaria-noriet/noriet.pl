#!/usr/bin/env python3
"""Guard against link rot in the migrated content. Run before each deploy.

Catches the defect classes repaired on 2026-09-04 (review01 #7): anchors
with no href or an empty/broken one, editor artifacts (href="undefined"),
autolinker damage (https://m.st/) and Apple paste schemes (x-apple-*).
Checks src/ sources, not _site, so the failure points at the file to fix.
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"

PATTERNS = [
    ("bare anchor (no href)", re.compile(r"<a>")),
    ("empty anchor", re.compile(r"<a[^>]*></a>")),
    ('href="undefined"', re.compile(r'href="undefined"')),
    ("m.st autolink", re.compile(r'href="https?://m\.st[/"]')),
    ("apple paste scheme", re.compile(r'href="x-apple-')),
]

bad = 0
for f in sorted(SRC.rglob("*.html")) + sorted(SRC.rglob("*.njk")):
    text = f.read_text(encoding="utf-8")
    for name, rx in PATTERNS:
        for m in rx.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            print(f"FAIL {f.relative_to(SRC.parent)}:{line} {name}")
            bad += 1

if bad:
    print(f"{bad} rotten anchor(s)")
    sys.exit(1)
print("OK")
