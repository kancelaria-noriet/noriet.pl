#!/usr/bin/env python3
"""Validate the Markdown twins and /llms.txt in _site. Run before each deploy.

Asserts: every HTML page that declares a rel=alternate Markdown link has the
twin on disk and vice versa; every twin has front matter, a title and an h1;
no twin leaks HTML block tags; every .md link in llms.txt resolves to a file.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "_site"


def main():
    bad = []
    declared, on_disk = set(), set()
    for p in SITE.rglob("index.html"):
        s = p.read_text(encoding="utf-8")
        if 'rel="alternate" type="text/markdown"' in s:
            m = re.search(r'type="text/markdown" href="([^"]+)"', s)
            declared.add(m.group(1))
    for p in SITE.rglob("index.md"):
        rel = "/" + p.relative_to(SITE).as_posix()
        on_disk.add(rel)
        s = p.read_text(encoding="utf-8")
        if not s.startswith("---\ntitle: "):
            bad.append(f"{rel}: no front matter")
        if "\n# " not in s:
            bad.append(f"{rel}: no h1")
        if re.search(r"<(div|section|span|nav|aside|table)\b", s):
            bad.append(f"{rel}: HTML leaked into the twin")
    for miss in sorted(declared - on_disk):
        bad.append(f"declared but missing: {miss}")
    for orphan in sorted(on_disk - declared):
        bad.append(f"twin without a rel=alternate link: {orphan}")

    llms = SITE / "llms.txt"
    if not llms.exists():
        bad.append("/llms.txt missing")
    else:
        links = re.findall(r"\((https://noriet\.pl(/[^)]*index\.md))\)",
                           llms.read_text(encoding="utf-8"))
        for _, path in links:
            if not (SITE / path.lstrip("/")).exists():
                bad.append(f"llms.txt links a missing twin: {path}")
        print(f"{len(on_disk)} twins, {len(links)} llms.txt links")
    if bad:
        print(f"FAIL: {len(bad)}")
        for b in bad[:20]:
            print(" ", b)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
