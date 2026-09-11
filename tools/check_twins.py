#!/usr/bin/env python3
"""Validate the Markdown twins and /llms.txt in _site. Run before each deploy.

Asserts: every HTML page that declares a rel=alternate Markdown link has the
twin on disk and vice versa; every twin has front matter, a title and an h1;
no twin leaks HTML block tags; every .md link in llms.txt resolves to a file;
lawyer cards and hub lists survive the strip; no empty markdown links; no
screen-reader price labels; /kontakt/ twin carries opening hours.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "_site"
EMPTY_LINK = re.compile(r"\[\s*\]\([^)]+\)")
LAWYER = "Prowadzi te sprawy"
HUB = "Usługi w tej kategorii"
RELATED = "Więcej w kategorii"


def twin_path(html_path):
    return html_path.parent / "index.md"


def rel_of(html_path):
    parent = html_path.parent.relative_to(SITE).as_posix().lstrip(".")
    return "/" if parent in ("", ".") else f"/{parent}/"


def main():
    bad = []
    declared, on_disk = set(), set()
    for p in SITE.rglob("index.html"):
        html = p.read_text(encoding="utf-8")
        if 'rel="alternate" type="text/markdown"' in html:
            m = re.search(r'type="text/markdown" href="([^"]+)"', html)
            declared.add(m.group(1))
        md = twin_path(p)
        if md.exists():
            body = md.read_text(encoding="utf-8")
            page = rel_of(p)
            if LAWYER in html and LAWYER not in body:
                bad.append(f"{page}: HTML has lawyer card, twin does not")
            if HUB in html and HUB not in body:
                bad.append(f"{page}: HTML has hub service list, twin does not")
            if RELATED in html and RELATED not in body:
                bad.append(f"{page}: HTML has sibling list, twin does not")
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
        if "](/" in s:
            bad.append(f"{rel}: root-relative markdown link")
        if EMPTY_LINK.search(s):
            bad.append(f"{rel}: empty markdown link")
        if "Poprzednia cena:" in s:
            bad.append(f"{rel}: screen-reader price label leaked")
    kontakt = SITE / "kontakt" / "index.md"
    if not kontakt.exists():
        bad.append("/kontakt/index.md missing")
    else:
        hours = kontakt.read_text(encoding="utf-8")
        if "9:00" not in hours or "16:00" not in hours:
            bad.append("/kontakt/index.md: missing opening hours")
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
