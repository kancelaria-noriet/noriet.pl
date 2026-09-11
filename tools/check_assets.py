#!/usr/bin/env python3
"""Verify that every asset a built page references exists in _site.

check_links.py covers <a href>. This covers everything else a page can
reference and a visitor or a scraper would fetch: <img src/srcset>,
<source srcset>, <video poster>, <link href> (stylesheets, icons, manifest,
Markdown twins), <script src>, og:image / twitter:image, and image or logo
URLs inside JSON-LD. A renamed upload or a deleted portrait otherwise ships
as a broken image, a share card without a picture, or an Article whose
image 404s (review03 #34). Run before each deploy.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "_site"
SITE_URL = json.loads((ROOT / "src" / "_data" / "site.json").read_text())["url"].rstrip("/")

LINK_RELS_TO_SKIP = {"canonical"}  # the page's own URL, not a file
JSONLD_IMAGE_KEYS = {"image", "logo", "contentUrl", "thumbnailUrl"}


class Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []      # (kind, url)
        self.jsonld = []
        self._in_ld = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "img":
            if a.get("src"):
                self.refs.append(("img src", a["src"]))
            self._srcset(a.get("srcset"), "img srcset")
        elif tag == "source":
            self._srcset(a.get("srcset"), "source srcset")
            if a.get("src"):
                self.refs.append(("source src", a["src"]))
        elif tag == "video" and a.get("poster"):
            self.refs.append(("video poster", a["poster"]))
        elif tag == "link" and a.get("href"):
            rels = set((a.get("rel") or "").split())
            if not rels & LINK_RELS_TO_SKIP:
                self.refs.append((f"link {' '.join(sorted(rels)) or 'href'}", a["href"]))
        elif tag == "script":
            if a.get("src"):
                self.refs.append(("script src", a["src"]))
            if a.get("type") == "application/ld+json":
                self._in_ld = True
        elif tag == "meta":
            key = a.get("property") or a.get("name") or ""
            if key in ("og:image", "twitter:image") and a.get("content"):
                self.refs.append((key, a["content"]))

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False

    def handle_data(self, data):
        if self._in_ld and data.strip():
            self.jsonld.append(data)

    def _srcset(self, value, kind):
        for part in (value or "").split(","):
            url = part.strip().split(" ")[0]
            if url:
                self.refs.append((kind, url))


def jsonld_images(blob):
    """Yield every image-like URL in a JSON-LD document, recursively."""
    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in JSONLD_IMAGE_KEYS:
                    if isinstance(v, str):
                        yield v
                    elif isinstance(v, dict) and isinstance(v.get("url"), str):
                        yield v["url"]
                    elif isinstance(v, list):
                        for item in v:
                            if isinstance(item, str):
                                yield item
                            elif isinstance(item, dict) and isinstance(item.get("url"), str):
                                yield item["url"]
                else:
                    yield from walk(v)
        elif isinstance(node, list):
            for item in node:
                yield from walk(item)
    try:
        yield from walk(json.loads(blob))
    except json.JSONDecodeError:
        return  # check_jsonld.py reports malformed blocks


def local_path(url):
    """Return the site-relative path for a same-origin URL, else None."""
    if url.startswith("data:") or url.startswith("#"):
        return None
    if url.startswith(SITE_URL + "/"):
        url = url[len(SITE_URL):]
    parts = urlsplit(url)
    if parts.scheme or parts.netloc:
        return None  # external host: not ours to verify
    return parts.path or None


def function_routes():
    """Paths served by Pages Functions, derived from functions/ (e.g. /v)."""
    routes = set()
    for f in (ROOT / "functions").rglob("*.js"):
        rel = f.relative_to(ROOT / "functions").with_suffix("").as_posix()
        routes.add("/" + (rel[:-6] if rel.endswith("/index") else rel))
    return routes


FUNCTION_ROUTES = function_routes()


def exists(path):
    if path in FUNCTION_ROUTES:
        return True  # served by a Function at request time, not a file
    target = SITE / path.lstrip("/")
    if path.endswith("/"):
        target = target / "index.html"
    return target.is_file()


pages = sorted(SITE.rglob("*.html"))
bad, checked, external = 0, 0, 0
for page in pages:
    rel = "/" + page.relative_to(SITE).as_posix()
    if rel.startswith("/qa/"):
        continue  # dev-only gallery, never deployed
    p = Refs()
    p.feed(page.read_text(encoding="utf-8"))
    refs = list(p.refs) + [("json-ld image", u) for blob in p.jsonld for u in jsonld_images(blob)]
    for kind, url in refs:
        path = local_path(url)
        if path is None:
            external += 1
            continue
        checked += 1
        if not exists(path):
            print(f"FAIL {rel}: {kind} -> {url}")
            bad += 1

print(f"{len(pages)} pages; {checked} local asset references checked, {external} external skipped")
if bad:
    print(f"FAIL: {bad} missing asset(s)")
    sys.exit(1)
print("OK")
