#!/usr/bin/env python3
"""Smoke-test a deployed host: every sitemap URL and every Markdown twin.

    python3 tools/check_live.py https://dev.noriet-lp.pages.dev
    python3 tools/check_live.py https://noriet-lp.pages.dev --env production
    python3 tools/check_live.py https://noriet.pl

Asserts, for every URL in the deployed sitemap.xml: HTTP 200 with no redirect,
canonical equal to the production URL, the `Link: </llms.txt>` header, and the
noindex gate in the expected direction — present (header and meta) on a
development build, absent on a production build. For /llms.txt and every twin
it links: 200, text/markdown, `X-Robots-Tag: noindex` (always), front matter.
Plus: robots.txt is 200 and an unknown path is a real 404.

The environment defaults to production when the host equals the site URL's
host and to development otherwise; `--env` overrides. `redirects.py live`
covers the old URLs; this covers the pages that exist only on the new site
(review03 #34). Requests are sequential and rate-limited; the site is ours.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE_URL = json.loads((ROOT / "src" / "_data" / "site.json").read_text())["url"].rstrip("/")
UA = "NorietRebuildAudit/1.0"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # surface 3xx as HTTPError instead of following it


opener = urllib.request.build_opener(NoRedirect)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with opener.open(req, timeout=30) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, ""
    except Exception as e:  # DNS, TLS, timeout
        return 0, {"error": str(e)}, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="deployed origin, e.g. https://dev.noriet-lp.pages.dev")
    ap.add_argument("--env", choices=["development", "production"])
    ap.add_argument("--rate", type=float, default=4.0, help="requests per second (default 4)")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    env = args.env or ("production" if urlsplit(base).netloc == urlsplit(SITE_URL).netloc else "development")
    pause = 1.0 / args.rate
    bad = []

    def check(cond, msg):
        if not cond:
            bad.append(msg)

    # --- sitemap pages -----------------------------------------------------
    status, _, body = fetch(base + "/sitemap.xml")
    check(status == 200, f"/sitemap.xml -> {status}")
    locs = re.findall(r"<loc>(.*?)</loc>", body)
    paths = [urlsplit(u).path for u in locs]
    check(all(u.startswith(SITE_URL + "/") for u in locs), "sitemap has a <loc> outside the production origin")
    print(f"{env} build at {base}: {len(paths)} sitemap URLs")

    for i, path in enumerate(paths, 1):
        time.sleep(pause)
        status, h, body = fetch(base + path)
        if status != 200:
            bad.append(f"{path} -> {status}" + (f" (Location: {h.get('location')})" if h.get("location") else ""))
            continue
        canon = re.search(r'<link rel="canonical" href="([^"]+)"', body)
        check(canon and canon.group(1) == SITE_URL + path,
              f"{path}: canonical is {canon.group(1) if canon else 'missing'}")
        check("</llms.txt>" in h.get("link", ""), f"{path}: no Link: </llms.txt> header")
        meta = re.search(r'<meta name="robots" content="([^"]*)"', body)
        meta_val = meta.group(1) if meta else ""
        xrt = h.get("x-robots-tag", "")
        if env == "development":
            check("noindex" in xrt, f"{path}: development build without X-Robots-Tag noindex")
            check("noindex" in meta_val, f"{path}: development build without noindex meta")
        else:
            page_own = path in ("/obligacje/",)  # pages that carry their own noindex by design
            if not page_own:
                check("noindex" not in xrt, f"{path}: production build sends X-Robots-Tag noindex")
                check("noindex" not in meta_val, f"{path}: production build has a noindex meta ({meta_val})")
                check("max-image-preview:large" in meta_val, f"{path}: robots meta lacks max-image-preview:large")
        if i % 50 == 0:
            print(f"  {i}/{len(paths)} pages")

    # --- llms.txt and twins --------------------------------------------------
    time.sleep(pause)
    status, h, body = fetch(base + "/llms.txt")
    check(status == 200, f"/llms.txt -> {status}")
    check(h.get("content-type", "").startswith("text/markdown"), f"/llms.txt content-type {h.get('content-type')}")
    check("noindex" in h.get("x-robots-tag", ""), "/llms.txt without X-Robots-Tag noindex")
    twins = sorted(set(re.findall(r"\]\((https://[^)\s]+/index\.md)\)", body)))
    check(all(u.startswith(SITE_URL + "/") for u in twins), "llms.txt links a twin outside the production origin")
    print(f"  {len(twins)} twins in /llms.txt")
    for i, u in enumerate(twins, 1):
        time.sleep(pause)
        path = urlsplit(u).path
        status, h, body = fetch(base + path)
        check(status == 200, f"{path} -> {status}")
        check(h.get("content-type", "").startswith("text/markdown"), f"{path}: content-type {h.get('content-type')}")
        check("noindex" in h.get("x-robots-tag", ""), f"{path}: twin without X-Robots-Tag noindex")
        check(body.startswith("---\n"), f"{path}: twin without front matter")
        if i % 50 == 0:
            print(f"  {i}/{len(twins)} twins")

    # --- the rest ------------------------------------------------------------
    time.sleep(pause)
    status, _, _ = fetch(base + "/robots.txt")
    check(status == 200, f"/robots.txt -> {status}")
    time.sleep(pause)
    status, _, _ = fetch(base + "/nie-ma-takiej-strony-check-live/")
    check(status == 404, f"unknown path -> {status}, expected 404")

    if bad:
        print(f"FAIL: {len(bad)}")
        for b in bad[:60]:
            print("  " + b)
        sys.exit(1)
    print(f"OK: {len(paths)} pages and {len(twins)} twins on {base} behave as a {env} build")


if __name__ == "__main__":
    main()
