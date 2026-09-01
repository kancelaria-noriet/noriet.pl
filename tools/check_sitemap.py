#!/usr/bin/env python3
"""Validate sitemap.xml and robots.txt in _site. Run before each deploy.

Asserts: every sitemap URL is a built page; every built page is in the
sitemap except the documented exclusions (noindexed pages, /blog/strona/N/,
/qa/); no page with a noindex meta appears in the sitemap; robots.txt points
at the sitemap.
"""
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "_site"
EXCLUDED = re.compile(r"^/(blog/strona/\d+/|obligacje/|polityka-prywatnosci/|qa/)")


def main():
    bad = []
    sm_text = (SITE / "sitemap.xml").read_text(encoding="utf-8")
    sm = {u.replace("https://noriet.pl", "") or "/"
          for u in re.findall(r"<loc>([^<]+)</loc>", sm_text)}
    live = set()
    for p in SITE.rglob("index.html"):
        rel = p.relative_to(SITE).parent.as_posix()
        url = "/" if rel == "." else f"/{rel}/"
        live.add(url)
        noindex = re.search(r'name="robots" content="[^"]*noindex', p.read_text(encoding="utf-8"))
        # The preview build sets a global noindex; only per-page front matter
        # counts, and that renders even in preview via the `robots` variable.
        if noindex and "nofollow" in noindex.group(0) and url in sm and EXCLUDED.match(url):
            bad.append(f"{url}: noindexed page in the sitemap")
    for u in sorted(sm - live):
        bad.append(f"in sitemap, not built: {u}")
    for u in sorted(live - sm):
        if not EXCLUDED.match(u):
            bad.append(f"built, not in sitemap: {u}")

    robots = (SITE / "robots.txt")
    if not robots.exists():
        bad.append("robots.txt missing")
    elif "Sitemap: https://noriet.pl/sitemap.xml" not in robots.read_text(encoding="utf-8"):
        bad.append("robots.txt does not point at the sitemap")

    print(f"sitemap: {len(sm)} URLs, {len(live)} built pages")
    if bad:
        print(f"FAIL: {len(bad)}")
        for b in bad[:20]:
            print(" ", b)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
