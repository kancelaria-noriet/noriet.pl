#!/usr/bin/env python3
"""Validate every JSON-LD block in _site. Run before each deploy.

Asserts that each block parses, that required per-type fields are present,
and that per-type counts match the expected page counts. Exits non-zero on
any problem.
"""
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "_site"
BLOCK = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)

REQUIRED = {
    "LegalService": ["name", "url", "telephone", "email", "address", "geo",
                     "openingHoursSpecification", "identifier"],
    "BreadcrumbList": ["itemListElement"],
    "Person": ["name", "jobTitle", "url", "worksFor"],
    "Article": ["headline", "datePublished", "author", "publisher",
                "mainEntityOfPage"],
    "Service": ["name", "url", "provider"],
    "FAQPage": ["mainEntity"],
}


def main():
    pages = sorted(SITE.rglob("index.html"))
    if not pages:
        sys.exit(f"{SITE} is empty. Run build.sh first.")
    counts, bad = {}, []
    for p in pages:
        rel = "/" + p.relative_to(SITE).parent.as_posix().lstrip(".")
        for m in BLOCK.finditer(p.read_text(encoding="utf-8")):
            try:
                data = json.loads(m.group(1))
            except json.JSONDecodeError as e:
                bad.append(f"{rel}: unparseable JSON-LD ({e})")
                continue
            t = data.get("@type", "?")
            counts[t] = counts.get(t, 0) + 1
            for field in REQUIRED.get(t, []):
                if not data.get(field):
                    bad.append(f"{rel}: {t} misses {field}")
            if t == "BreadcrumbList":
                items = data["itemListElement"]
                if items[0]["name"] != "Strona główna":
                    bad.append(f"{rel}: crumb does not start at home")
                if any("item" not in i for i in items[:-1]):
                    bad.append(f"{rel}: intermediate crumb without item URL")
                if "item" in items[-1]:
                    bad.append(f"{rel}: leaf crumb carries an item URL")
            if t == "Article" and data.get("dateModified"):
                bad.append(f"{rel}: Article has dateModified — no real "
                           "modification dates exist yet")

    n = len(pages)
    print(f"{n} pages;", ", ".join(f"{t}: {c}" for t, c in sorted(counts.items())))
    expect = {"LegalService": n}  # one per page, from the base head
    for t, want in expect.items():
        if counts.get(t, 0) != want:
            bad.append(f"count {t}: {counts.get(t, 0)}, expected {want}")
    if bad:
        print(f"FAIL: {len(bad)}")
        for b in bad[:20]:
            print(" ", b)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
