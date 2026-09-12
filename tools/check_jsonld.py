#!/usr/bin/env python3
"""Validate every JSON-LD block in _site. Run before every deploy.

Asserts that each block parses, that required per-type fields are present,
and that per-type counts match the expected page counts. Exits non-zero on
any problem.

@type may be a string or a list (the firm node is LegalService + Organization).
Nested types (Offer inside Service, ImageObject inside publisher) are not
counted as top-level blocks.
"""
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "_site"
BLOCK = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)

REQUIRED = {
    "LegalService": ["name", "url", "telephone", "email", "address", "geo",
                     "openingHoursSpecification", "identifier", "areaServed",
                     "hasOfferCatalog", "employee", "logo"],
    "Organization": ["name", "url", "logo", "employee", "hasOfferCatalog"],
    "BreadcrumbList": ["itemListElement"],
    "Person": ["name", "jobTitle", "url", "worksFor", "@id", "telephone",
               "email", "knowsAbout"],
    "Article": ["headline", "datePublished", "author", "publisher",
                "mainEntityOfPage", "articleSection"],
    "Service": ["name", "url", "provider", "areaServed"],
    "FAQPage": ["mainEntity"],
}

# Practice pages (layouts/service.njk with serviceMeta, including the
# Prawo karne hub) + the abonament sales page + 9 konsultacje products
# (two merged consultations, three divorce packages, three audits, the
# trial month; legal team call 2026-09-10).
SERVICE_PAGES = 26 + 1 + 9


def types_of(data):
    t = data.get("@type", "?")
    return t if isinstance(t, list) else [t]


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
            types = types_of(data)
            for t in types:
                counts[t] = counts.get(t, 0) + 1
                for field in REQUIRED.get(t, []):
                    if not data.get(field):
                        bad.append(f"{rel}: {t} misses {field}")
            if "BreadcrumbList" in types:
                items = data["itemListElement"]
                if items[0]["name"] != "Strona główna":
                    bad.append(f"{rel}: crumb does not start at home")
                if any("item" not in i for i in items[:-1]):
                    bad.append(f"{rel}: intermediate crumb without item URL")
                if "item" in items[-1]:
                    bad.append(f"{rel}: leaf crumb carries an item URL")
            if "Article" in types:
                if data.get("dateModified"):
                    bad.append(f"{rel}: Article has dateModified — no real "
                               "modification dates exist yet")
                # The firm Organization, or one or more named Persons parsed
                # from the migrated bylines (review04 #39).
                authors = data.get("author") or {}
                authors = authors if isinstance(authors, list) else [authors]
                for author in authors:
                    if author.get("@type") not in ("Organization", "Person") or not author.get("name"):
                        bad.append(f"{rel}: Article author is not an Organization or Person with name")
                pub = data.get("publisher") or {}
                logo = pub.get("logo") or {}
                if logo.get("@type") != "ImageObject" or not logo.get("url"):
                    bad.append(f"{rel}: Article publisher.logo is not an ImageObject")
            if "Person" in types:
                pid = data.get("@id") or ""
                if not pid.endswith("#osoba"):
                    bad.append(f"{rel}: Person @id does not end with #osoba")
            if "LegalService" in types:
                lid = data.get("@id") or ""
                if not lid.endswith("/#kancelaria"):
                    bad.append(f"{rel}: LegalService @id is not /#kancelaria")
                if "Organization" not in types:
                    bad.append(f"{rel}: firm node is not also Organization")
                if not data.get("founder"):
                    bad.append(f"{rel}: firm node misses founder")

    n = len(pages)
    print(f"{n} pages;", ", ".join(f"{t}: {c}" for t, c in sorted(counts.items())))
    expect = {
        "LegalService": n,
        "Organization": n,
        "Article": 139,
        "Person": 9,
        "Service": SERVICE_PAGES,
        "FAQPage": 2,
    }
    for t, want in expect.items():
        if counts.get(t, 0) != want:
            bad.append(f"count {t}: {counts.get(t, 0)}, expected {want}")
    if bad:
        print(f"FAIL: {len(bad)}")
        for b in bad[:30]:
            print(" ", b)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
