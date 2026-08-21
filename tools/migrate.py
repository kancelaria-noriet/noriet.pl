#!/usr/bin/env python3
"""Migrate the 12 service pages from the capture into src/content/services/.

As-is-first principle: body copy stays byte-similar to the live site. What
changes is chrome and hygiene only:
  - extract the article container (div.textTeamContainer) from the raw crawl
  - strip control characters (a U+0003 once reached the design pack)
  - strip presentational attributes (style/class/id/…) — the new stylesheet
    owns presentation; inline CSS is banned by CODING-STANDARDS.md
  - drop the in-content <h1> (the template renders it from front matter)
  - rewrite wp-content/uploads image URLs to local /assets/uploads/… and copy
    the referenced files from the capture

Titles and meta descriptions come from the live pages via inventory.csv.
Front matter is JSON (Polish text is quote-heavy; YAML is fragile here).

Run with the export venv: ../export/.venv/bin/python tools/migrate.py
"""
import csv
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

BASE = Path(__file__).resolve().parent.parent          # noriet-lp/
EXPORT = BASE.parent / "export"
OUT = BASE / "src" / "content" / "services"
UPLOADS_SRC = EXPORT / "files" / "noriet" / "uploads"
UPLOADS_OUT = BASE / "src" / "assets" / "uploads"

SERVICE_SLUGS = [
    "sprawy-rozwodowe-warszawa", "prawo-spadkowe-warszawa",
    "prawo-rodzinne-warszawa", "podzial-majatku-w-warszawie",
    "podzial-majatku-po-rozwodzie", "rozwod-bez-orzekania-o-winie",
    "rozwod-z-orzeczeniem-o-winie", "separacja", "alimenty",
    "malzenskie-ustroje-majatkowe", "pozbawienie-wladzy-rodzicielskiej-warszawa",
    "adwokat-w-sprawie-sadowej",
]

CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
KEEP_ATTRS = {"href", "src", "alt", "width", "height", "colspan", "rowspan", "id",
              "loading", "title"}

csv.field_size_limit(10_000_000)

PL_MAP = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")

def h2_slug(text, used):
    s = re.sub(r"[^a-z0-9]+", "-", text.translate(PL_MAP).lower()).strip("-")[:60] or "sekcja"
    base, i = s, 2
    while s in used:
        s = f"{base}-{i}"; i += 1
    used.add(s)
    return s



def load_sources():
    inv = {r["url"]: r for r in
           csv.DictReader((EXPORT / "analysis/inventory.csv").open(encoding="utf-8"))}
    raw = {}
    for line in (EXPORT / "crawl/pages.jsonl").open(encoding="utf-8"):
        r = json.loads(line)
        if r.get("raw_file"):
            raw[r["url"]] = EXPORT / "crawl" / r["raw_file"]
    return inv, raw


def localise_upload(src_url, copied):
    """Map a wp-content/uploads URL to /assets/uploads/… and copy the file."""
    p = urlparse(src_url)
    m = re.search(r"/wp-content/uploads/(.+)$", p.path)
    if not m:
        return src_url
    rel = m.group(1)
    src_file = UPLOADS_SRC / rel
    if src_file.is_file():
        dst = UPLOADS_OUT / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(src_file, dst)
        copied.add(rel)
        return f"/assets/uploads/{rel}"
    return src_url


def clean_fragment(container, copied):
    for tag in container(["script", "style", "iframe", "noscript", "form"]):
        tag.decompose()
    # The old theme has unbalanced markup, so the page footer parses as a child
    # of the content container. Drop it before anything else reads the fragment.
    for chrome in container.select("div.footer, div.footerContainer"):
        chrome.decompose()
    h1 = container.find("h1")
    if h1:
        h1.decompose()
    used_ids = set()
    for h2 in container.find_all("h2"):
        h2["id"] = h2_slug(h2.get_text(" ", strip=True), used_ids)
    for tag in container.find_all(True):
        for attr in list(tag.attrs):
            if attr not in KEEP_ATTRS:
                del tag.attrs[attr]
        if tag.name == "img" and tag.get("src"):
            tag["src"] = localise_upload(tag["src"], copied)
            if not tag.get("loading"):
                tag["loading"] = "lazy"
        if tag.name == "a" and tag.get("href"):
            href = tag["href"]
            if "/wp-content/uploads/" in href:
                tag["href"] = localise_upload(href, copied)
            else:
                for host in ("https://noriet.pl", "http://noriet.pl",
                             "https://www.noriet.pl"):
                    if href.startswith(host):
                        tag["href"] = href[len(host):] or "/"
                        break
    html = container.decode_contents()
    html = CONTROL.sub(" ", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    return html.strip()


def main():
    inv, raw = load_sources()
    OUT.mkdir(parents=True, exist_ok=True)
    copied = set()
    ok = 0
    for slug in SERVICE_SLUGS:
        url = f"https://noriet.pl/{slug}/"
        iv = inv.get(url)
        rf = raw.get(url)
        if not iv or not rf:
            print(f"MISSING source for {slug}", file=sys.stderr)
            continue
        soup = BeautifulSoup(rf.read_bytes(), "lxml")
        # The old theme's broken markup nests the CTA block, the "Sprawdź
        # również" related posts and the whole FOOTER inside
        # div.textTeamContainer. Only its first child (div.textTeam) is the
        # actual page body — everything after it is boilerplate.
        outer = soup.select_one("div.textTeamContainer")
        if outer is None:
            print(f"MISSING container for {slug}", file=sys.stderr)
            continue
        # The old "Sprawdź również" block: curated internal links (posts and
        # services). Preserve each item's own title/excerpt/date from the
        # widget — the targets include service pages with no excerpt of
        # their own.
        related, seen_rel = [], set()
        for it in outer.select(".gt_singleBlogItem"):
            a = it.find("a", href=True)
            if a is None:
                continue
            href = a["href"]
            for host in ("https://noriet.pl", "http://noriet.pl"):
                if href.startswith(host):
                    href = href[len(host):]
            if not href.startswith("/") or href in seen_rel:
                continue
            seen_rel.add(href)
            h3 = it.find("h3")
            date = it.select_one(".date")
            date_txt = date.get_text(" ", strip=True) if date else ""
            desc = it.select_one(".desc")
            excerpt = ""
            if desc is not None:
                # the date and read-more link sit INSIDE .desc on some pages
                for junk in desc.select(".date, .readMore, .clear"):
                    junk.decompose()
                excerpt = desc.get_text(" ", strip=True)
                excerpt = excerpt.replace("czytaj więcej", " ")
                excerpt = re.sub(r"\[(\.\.\.|…)\]", " ", excerpt)
                excerpt = re.sub(r"\s+", " ", excerpt).strip()
                excerpt = re.sub(r"\s*\d{1,2}\s+\w+,\s*\d{4}\s*$", "", excerpt)
                if len(excerpt) > 180:
                    excerpt = excerpt[:180].rsplit(" ", 1)[0].rstrip(" ,;:.") + "…"
            related.append({
                "url": href,
                "title": (h3 or a).get_text(" ", strip=True),
                "excerpt": excerpt,
                "date": date_txt,
            })
        container = outer.select_one("div.textTeam") or outer
        # Flatten the FAQ accordion (wnt-faq-*) into h2 + answer copy,
        # styled like every other body section.
        for item in container.select(".wnt-faq-item"):
            q = item.select_one(".wnt-faq-question")
            a = item.select_one(".wnt-faq-answer-container")
            if q is not None:
                h2 = soup.new_tag("h2")
                h2.string = q.get_text(" ", strip=True).strip(" +−–-")
                item.insert_before(h2)
            if a is not None:
                for child in list(a.children):
                    item.insert_before(child)
            item.decompose()
        h1 = (json.loads(iv["h1"]) if iv["h1"].startswith("[")
              else [iv["h1"]]) if iv.get("h1") else []
        fm = {
            "layout": "layouts/service.njk",
            "permalink": f"/{slug}/",
            "titleTag": iv["title"],
            "description": iv["meta_description"],
            "h1": (h1[0] if h1 else iv["title"]),
            "relatedPosts": related,
            "migratedFrom": url,
            "migratedAt": "2026-08-07",
        }
        body = clean_fragment(container, copied)
        out = OUT / f"{slug}.html"
        out.write_text("---json\n" + json.dumps(fm, ensure_ascii=False, indent=2)
                       + "\n---\n" + body + "\n", encoding="utf-8")
        words = len(re.sub(r"<[^>]+>", " ", body).split())
        print(f"  {slug:45} {words:>5} words")
        ok += 1
    print(f"\nmigrated {ok}/{len(SERVICE_SLUGS)} service pages, "
          f"{len(copied)} upload files localised")


if __name__ == "__main__":
    main()
