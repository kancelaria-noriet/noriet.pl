#!/usr/bin/env python3
"""Audit internal links in _site. Run before each deploy (PLAN Phase 4).

Asserts: every internal href resolves to a built page or a copied asset;
every internal page href ends in a slash (no redirect chains); no href
points at a source path of a _redirects rule; every page except the
deliberate set is linked from at least one other page (no orphans); every
BreadcrumbList item URL resolves to a built page.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "_site"

# Pages that no other page links to, by design.
ORPHAN_OK = {
    "/404/",          # served by Pages on any miss
    "/qa/",           # dev-only gallery, stripped at launch
    "/obligacje/",    # noindexed bond archive: redirect target, not nav
}
# The bond posts live only under the /obligacje/ archive page.
ORPHAN_OK_PREFIXES = ("/obligacje/",)


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        for k, v in attrs:
            if k == "href" and v:
                self.hrefs.append(v)


def redirect_sources():
    srcs = set()
    f = ROOT / "src" / "static" / "_redirects"
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        src = line.split()[0]
        if src.endswith("*"):
            srcs.add(("prefix", src[:-1]))
        else:
            srcs.add(("exact", src))
    return srcs


def hits_redirect(path, srcs):
    for kind, src in srcs:
        if kind == "exact" and path == src:
            return src
        if kind == "prefix" and path.startswith(src):
            return src + "*"
    return None


def main():
    bad = []
    pages = {"/" + p.relative_to(SITE).parent.as_posix().lstrip(".")
             for p in SITE.rglob("index.html")}
    pages = {p if p.endswith("/") else p + "/" for p in pages}
    pages = {p.replace("//", "/") for p in pages}
    assets = {"/" + p.relative_to(SITE).as_posix()
              for p in SITE.rglob("*") if p.is_file()}
    srcs = redirect_sources()
    linked = set()

    for f in sorted(SITE.rglob("index.html")):
        page = "/" + f.relative_to(SITE).parent.as_posix().lstrip(".")
        page = (page if page.endswith("/") else page + "/").replace("//", "/")
        html = f.read_text(encoding="utf-8")
        parser = Links()
        parser.feed(html)
        for href in parser.hrefs:
            if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
                continue
            path = urlsplit(href).path
            if not path.startswith("/"):
                bad.append(f"{page}: relative href {href!r}")
                continue
            rule = hits_redirect(path, srcs)
            if rule:
                bad.append(f"{page}: href {href!r} hits redirect rule {rule}")
            if "." in path.rsplit("/", 1)[-1]:      # asset or .md twin
                if path not in assets:
                    bad.append(f"{page}: broken asset href {href!r}")
                continue
            if not path.endswith("/"):
                bad.append(f"{page}: page href without trailing slash {href!r}")
                path += "/"
            if path not in pages:
                bad.append(f"{page}: broken href {href!r}")
            elif path != page:
                linked.add(path)
        for m in re.finditer(
                r'<script type="application/ld\+json">(.*?)</script>',
                html, re.S):
            data = json.loads(m.group(1))
            if data.get("@type") != "BreadcrumbList":
                continue
            for el in data["itemListElement"]:
                item = el.get("item")
                if not item:
                    continue
                path = urlsplit(item).path
                if (path if path.endswith("/") else path + "/") not in pages:
                    bad.append(f"{page}: breadcrumb item {item!r} not built")

    for page in sorted(pages - linked):
        if page in ORPHAN_OK or page == "/":
            continue
        if page.startswith(ORPHAN_OK_PREFIXES) and page != "/obligacje/":
            continue
        bad.append(f"orphan: {page} is linked from no other page")

    print(f"{len(pages)} pages, {len(linked)} link targets")
    if bad:
        print(f"FAIL ({len(bad)}):")
        for b in bad:
            print(" ", b)
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
