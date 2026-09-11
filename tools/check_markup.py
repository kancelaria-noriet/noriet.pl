#!/usr/bin/env python3
"""Guard the markup. Run before each deploy.

Part 1 — link rot in the migrated sources (review01 #7): anchors with no
href or an empty/broken one, editor artifacts (href="undefined"), autolinker
damage (https://m.st/) and Apple paste schemes (x-apple-*). Checks src/, so
the failure points at the file to fix.

Part 2 — the built pages in _site (review03 #34): every title and every meta
description is unique across the site, every page has exactly one <h1>, and
heading levels never skip (an <h2> followed by an <h4>). A copied title makes
two pages compete in search, and nothing else would notice.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
SITE = ROOT / "_site"

PATTERNS = [
    ("bare anchor (no href)", re.compile(r"<a>")),
    ("empty anchor", re.compile(r"<a[^>]*></a>")),
    ('href="undefined"', re.compile(r'href="undefined"')),
    ("m.st autolink", re.compile(r'href="https?://m\.st[/"]')),
    ("apple paste scheme", re.compile(r'href="x-apple-')),
]

# Migrated archive pages whose imported markup skips a heading level. Known
# and accepted; listed here so a new skip elsewhere still fails the build.
HEADING_SKIP_OK = {"/obligacje/"}

bad = 0

# --- Part 1: sources -------------------------------------------------------
for f in sorted(SRC.rglob("*.html")) + sorted(SRC.rglob("*.njk")):
    text = f.read_text(encoding="utf-8")
    for name, rx in PATTERNS:
        for m in rx.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            print(f"FAIL {f.relative_to(ROOT)}:{line} {name}")
            bad += 1


# --- Part 2: built pages ---------------------------------------------------
class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = None
        self.description = None
        self.headings = []
        self._in_title = False
        self._in_h = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta" and a.get("name") == "description":
            self.description = (a.get("content") or "").strip()
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._in_h = int(tag[1])
            self.headings.append(self._in_h)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag.startswith("h"):
            self._in_h = None

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data


titles, descriptions = {}, {}
pages = [p for p in sorted(SITE.rglob("*.html")) if not p.relative_to(SITE).as_posix().startswith("qa/")]
for page in pages:
    rel = "/" + page.relative_to(SITE).as_posix()
    rel = rel[: -len("index.html")] if rel.endswith("/index.html") else rel
    h = Head()
    h.feed(page.read_text(encoding="utf-8"))

    title = (h.title or "").strip()
    if not title:
        print(f"FAIL {rel}: no <title>")
        bad += 1
    elif title in titles:
        print(f"FAIL {rel}: duplicate title, same as {titles[title]}: {title!r}")
        bad += 1
    else:
        titles[title] = rel

    if h.description:
        if h.description in descriptions:
            print(f"FAIL {rel}: duplicate description, same as {descriptions[h.description]}")
            bad += 1
        else:
            descriptions[h.description] = rel

    h1s = h.headings.count(1)
    if h1s != 1:
        print(f"FAIL {rel}: {h1s} <h1> elements")
        bad += 1
    prev = 0
    for level in h.headings:
        if level > prev + 1 and prev and rel not in HEADING_SKIP_OK:
            print(f"FAIL {rel}: heading skips from h{prev} to h{level}")
            bad += 1
            break
        prev = level

print(f"{len(pages)} built pages: {len(titles)} unique titles, {len(descriptions)} unique descriptions")
if bad:
    print(f"FAIL: {bad}")
    sys.exit(1)
print("OK")
