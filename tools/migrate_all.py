#!/usr/bin/env python3
"""Content-complete migration: everything beyond the 12 service pages.

Sources: ../export/ capture (raw crawl HTML, DB dumps, uploads).
Outputs: src/content/* (GENERATED), src/_includes/generated/*, localized images.

Run: ../export/.venv/bin/python tools/migrate_all.py
"""
import csv
import json
import re
import shutil
import struct
import sys
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

BASE = Path(__file__).resolve().parent.parent
EXPORT = BASE.parent / "export"
sys.path.insert(0, str(EXPORT))
from sqldump import read_table  # noqa: E402

CONTENT = BASE / "src" / "content"
GENINC = BASE / "src" / "_includes" / "generated"
UPLOADS_OUT = BASE / "src" / "assets" / "uploads"
DATA = BASE / "src" / "_data"

CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
KEEP_ATTRS = {"href", "src", "alt", "width", "height", "colspan", "rowspan", "id",
              "loading", "title", "datetime"}
PL_MONTHS = {1: "stycznia", 2: "lutego", 3: "marca", 4: "kwietnia", 5: "maja",
             6: "czerwca", 7: "lipca", 8: "sierpnia", 9: "września",
             10: "października", 11: "listopada", 12: "grudnia"}
DATE_TEXT = re.compile(r"^\s*\d{1,2}\s+\w+,?\s+\d{4}\s*$")

csv.field_size_limit(10_000_000)

PL_MAP = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")

def h2_slug(text, used):
    s = re.sub(r"[^a-z0-9]+", "-", text.translate(PL_MAP).lower()).strip("-")[:60] or "sekcja"
    base, i = s, 2
    while s in used:
        s = f"{base}-{i}"; i += 1
    used.add(s)
    return s



# ------------------------------------------------------------- shared helpers
def img_dims(path):
    """PNG/JPEG dimensions without external deps."""
    try:
        data = path.read_bytes()
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", data[16:24])
            return w, h
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return w, h
                i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    except Exception:
        pass
    return None, None


def localise_upload(src_url, uploads_src, prefix):
    p = urlparse(src_url)
    m = re.search(r"/wp-content/uploads/(.+)$", p.path)
    if not m:
        return src_url
    rel = m.group(1)
    src_file = uploads_src / rel
    if src_file.is_file():
        dst = UPLOADS_OUT / prefix / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists():
            shutil.copy2(src_file, dst)
        return f"/assets/uploads/{prefix}/{rel}"
    return src_url


def clean_fragment(container, uploads_src, prefix, drop_h1=True, drop_leading_date=False):
    for tag in container(["script", "style", "iframe", "noscript", "form"]):
        tag.decompose()
    # The old theme has unbalanced markup, so the page footer parses as a child
    # of the content container. Drop it before anything else reads the fragment.
    for chrome in container.select("div.footer, div.footerContainer"):
        chrome.decompose()
    if drop_h1:
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
            tag["src"] = localise_upload(tag["src"], uploads_src, prefix)
            if not tag.get("loading"):
                tag["loading"] = "lazy"
        if tag.name == "a" and tag.get("href"):
            href = tag["href"]
            if "/wp-content/uploads/" in href:
                tag["href"] = localise_upload(href, uploads_src, prefix)
            else:
                for host in ("https://noriet.pl", "http://noriet.pl",
                             "https://www.noriet.pl", "https://biznes.noriet.pl",
                             "http://biznes.noriet.pl"):
                    if href.startswith(host):
                        tag["href"] = href[len(host):] or "/"
                        break
    if drop_leading_date:
        for el in container.find_all(True):
            txt = el.get_text(" ", strip=True)
            if txt and DATE_TEXT.match(txt):
                el.decompose()
                break
            if txt:
                break
    html = container.decode_contents()
    html = CONTROL.sub(" ", html)
    return re.sub(r"\n{3,}", "\n\n", html).strip()


def write_page(path, fm, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("---json\n" + json.dumps(fm, ensure_ascii=False, indent=2)
                    + "\n---\n" + body + "\n", encoding="utf-8")


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def word_trim(s, n):
    """Truncate at a word boundary with an ellipsis (listing excerpts)."""
    if len(s) <= n:
        return s
    cut = s[:n].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return cut + "…"


def pl_date(iso):
    y, m, d = int(iso[0:4]), int(iso[5:7]), int(iso[8:10])
    return f"{d} {PL_MONTHS[m]} {y}"


class Sources:
    def __init__(self):
        self.inv = {r["url"]: r for r in csv.DictReader(
            (EXPORT / "analysis/inventory.csv").open(encoding="utf-8"))}
        self.raw = {}
        for line in (EXPORT / "crawl/pages.jsonl").open(encoding="utf-8"):
            r = json.loads(line)
            if r.get("raw_file"):
                self.raw[r["url"]] = EXPORT / "crawl" / r["raw_file"]

    def soup(self, url):
        f = self.raw.get(url)
        return BeautifulSoup(f.read_bytes(), "lxml") if f else None


def load_db(name):
    dump = EXPORT / f"capture/{name}/db/10518081_{name}.sql.gz"
    posts = {r["ID"]: r for r in read_table(dump, "wp_posts")}
    meta = {}
    for m in read_table(dump, "wp_postmeta"):
        meta.setdefault(m["post_id"], {}).setdefault(m["meta_key"], m["meta_value"])
    return posts, meta


# ------------------------------------------------------------------ migrators
def migrate_posts(src, posts, meta):
    n = 0
    for pid, p in posts.items():
        if p["post_type"] != "post" or p["post_status"] != "publish":
            continue
        slug = p["post_name"]
        url = f"https://noriet.pl/{slug}/"
        soup, iv = src.soup(url), src.inv.get(url)
        if soup is None or iv is None:
            print(f"  SKIP post (no crawl): {slug}", file=sys.stderr)
            continue
        c = soup.select_one("div.singleBlogContent")
        if c is None:
            print(f"  SKIP post (no container): {slug}", file=sys.stderr)
            continue
        body = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet",
                              drop_leading_date=True)
        iso = p["post_date"][:10]
        excerpt = strip_html(meta.get(pid, {}).get("zajawka", "")) or \
            word_trim(strip_html(body), 180)
        fm = {
            "layout": "layouts/article.njk",
            "tags": ["post"],
            "permalink": f"/{slug}/",
            "titleTag": iv["title"],
            "description": iv["meta_description"],
            "h1": iv["h1"] or p["post_title"],
            "date": iso,
            "isoDate": iso,
            "displayDate": pl_date(p["post_date"]),
            "excerpt": excerpt,
            "migratedFrom": url,
        }
        write_page(CONTENT / "posts" / f"{slug}.html", fm, body)
        n += 1
    print(f"posts: {n}")


# The old WordPress "specjalizacja" field predates the mediation practice, so it
# names nobody as a mediator. The firm's certified mediators are recorded here
# and appended on migration, which keeps src/content/team/ generated while
# letting the site show who actually runs mediations (owner call 2026-08-25).
SPEC_EXTRA = {
    "kinga-opala-mach": "mediacje",
}


def with_spec_extra(slug, spec):
    extra = SPEC_EXTRA.get(slug)
    if not extra or extra.lower() in spec.lower():
        return spec
    return f"{spec}, {extra}" if spec else extra


def migrate_team(src, posts, meta):
    n = 0
    for pid, p in posts.items():
        if p["post_type"] != "team" or p["post_status"] != "publish":
            continue
        slug = p["post_name"]
        url = f"https://noriet.pl/team/{slug}/"
        soup, iv = src.soup(url), src.inv.get(url)
        mm = meta.get(pid, {})
        body = ""
        if soup is not None:
            c = soup.select_one("div.singleBlogContent")
            if c is not None:
                body = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet",
                                      drop_leading_date=True)
        photo = photo_w = photo_h = None
        thumb = mm.get("_thumbnail_id")
        if thumb:
            att = meta.get(thumb, {}).get("_wp_attached_file")
            if att:
                photo = localise_upload(f"https://noriet.pl/wp-content/uploads/{att}",
                                        EXPORT / "files/noriet/uploads", "noriet")
                if photo.startswith("/assets/"):
                    photo_w, photo_h = img_dims(BASE / "src" / photo.lstrip("/"))
        kontakt_html = mm.get("kontakt", "")
        kontakt_html = re.sub(r'\s(style|class|id)="[^"]*"', "", kontakt_html)
        fm = {
            "layout": "layouts/team-bio.njk",
            "tags": ["team"],
            "permalink": f"/team/{slug}/",
            "titleTag": (iv["title"] if iv else p["post_title"]),
            "description": (iv["meta_description"] if iv else ""),
            "h1": p["post_title"],
            "rola": mm.get("rola", ""),
            "specjalizacja": with_spec_extra(slug, strip_html(mm.get("specjalizacja", ""))),
            "kontakt": kontakt_html,
            "photo": photo,
            "photoW": photo_w,
            "photoH": photo_h,
            "order": int(p.get("menu_order") or 0),
            "migratedFrom": url,
        }
        write_page(CONTENT / "team" / f"{slug}.html", fm, body)
        n += 1
    print(f"team: {n}")


# biznes copies of products that already exist at apex under another slug
# (PLAN Phase 2: duplicates dedupe to the apex copy; the biznes URLs get
# redirected by the host wildcard at cutover).
DUP_BIZNES_SLUGS = {
    "konsultacja-1",                      # = kpo (Konsultacja podstawowa ONLINE)
    "konsultacja-podstawowa-spotkanie",   # = rozszerzona-porada-prawna
    "konsultacja-rozszerzona-online",     # = konsultacja-2
}


def migrate_consultations(src):
    total = 0
    seen = set()
    for install, host in (("noriet", "noriet.pl"), ("noriet_biznes", "biznes.noriet.pl")):
        posts, meta = load_db(install)
        uploads = EXPORT / f"files/{install}/uploads"
        for pid, p in posts.items():
            if p["post_type"] != "consultations" or p["post_status"] != "publish":
                continue
            slug = p["post_name"]
            if slug in seen:          # apex copy wins on collision
                continue
            if install == "noriet_biznes" and slug in DUP_BIZNES_SLUGS:
                continue
            seen.add(slug)
            mm = meta.get(pid, {})
            desc = mm.get("description", "") or ""
            desc = re.sub(r'\s(style|class|id)="[^"]*"', "", desc)
            desc = CONTROL.sub(" ", desc)
            url = f"https://{host}/konsultacje/{slug}/"
            iv = src.inv.get(url)
            fm = {
                "layout": "layouts/consultation.njk",
                "tags": ["konsultacja"],
                "permalink": f"/konsultacje/{slug}/",
                "titleTag": (iv["title"] if iv and iv.get("title")
                             else f"{p['post_title']} | Noriet"),
                "description": (iv["meta_description"] if iv else ""),
                "h1": p["post_title"],
                "subtitle": mm.get("subtitle", ""),
                "price": mm.get("price", ""),
                "paymentLink": mm.get("payment_link", ""),
                "paymentLabel": (mm.get("payment_link_description") or "").capitalize(),
                "migratedFrom": url,
            }
            write_page(CONTENT / "konsultacje" / f"{slug}.html", fm,
                       f"<p>{desc}</p>" if desc and not desc.startswith("<") else desc)
            total += 1
    print(f"consultations: {total}")


# Owner call 2026-08-25: a bondholder notice, published by mistake as a
# publication. Its content is contained in /obligacje/ (the consolidated
# bond archive), so the URL retires with the other /casestudies/ pages.
SKIP_CASESTUDIES = {"komunikat-dla-obligatariuszy-prima-park-s-a-seria-u"}


def migrate_casestudies(src, posts, meta):
    """The five publications, as one ordered data file for /publikacje/.

    The old site rendered every publication inline on /publikacje/ and also
    gave each one an auto-generated `/casestudies/<slug>/` page that nothing
    linked to. The rebuild keeps the single page and retires the subpages
    (301 to /publikacje/ in the redirect map), so this writes data, not pages.
    """
    items = []
    for pid, p in posts.items():
        if p["post_type"] != "casestudies" or p["post_status"] != "publish":
            continue
        slug = p["post_name"]
        if slug in SKIP_CASESTUDIES:
            continue
        url = f"https://noriet.pl/casestudies/{slug}/"
        soup = src.soup(url)
        mm = meta.get(pid, {})
        body = ""
        if soup is not None:
            c = soup.select_one("div.singleBlogContent")
            if c is not None:
                for para in c.find_all("p"):
                    if not para.get_text(strip=True) and not para.find("img"):
                        para.decompose()
                body = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet",
                                      drop_leading_date=True)
        pola = []
        count = int(mm.get("dodatkowe_pola") or 0)
        for i in range(count):
            t = mm.get(f"dodatkowe_pola_{i}_tytul")
            tr = mm.get(f"dodatkowe_pola_{i}_tresc")
            if t or tr:
                tr = re.sub(r'\s(style|class|id)="[^"]*"', "", tr or "")
                pola.append({"tytul": t or "", "tresc": CONTROL.sub(" ", tr)})
        cover = ""
        thumb = mm.get("_thumbnail_id")
        if thumb:
            cover = meta.get(thumb, {}).get("_wp_attached_file", "") or ""
        items.append({
            "_order": p["post_date"],
            "slug": slug,
            "title": p["post_title"],
            "date": p["post_date"][:10],
            "body": body,
            "pola": pola,
            # Relative to ../export/files/noriet/uploads/. tools/covers.mjs reads
            # this, writes the optimised WebP and fills cover/coverW/coverH in.
            "coverSource": cover,
        })
    # The old theme listed the publications oldest first; keep that order.
    items.sort(key=lambda it: it.pop("_order"))
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / "publications.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"publications: {len(items)}")


def migrate_intros(src):
    GENINC.mkdir(parents=True, exist_ok=True)
    for url, sel, out in (
        ("https://noriet.pl/zespol/", "div.textTeamContainer", "zespol-intro.html"),
    ):
        soup = src.soup(url)
        c = soup.select_one(sel) if soup else None
        html = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet") if c else ""
        (GENINC / out).write_text(html + "\n", encoding="utf-8")
        print(f"intro {out}: {len(strip_html(html).split())} words")
    # /oferta/ has one offerContent block per practice area — join them all.
    # The blocks embed the old theme's decorative white pictograms
    # (umbrella_white.png etc.) — theme chrome, not content; drop them.
    soup = src.soup("https://noriet.pl/oferta/")
    blocks = soup.select("[class*=offerContent]") if soup else []
    for c in blocks:
        for img in c.find_all("img"):
            img.decompose()
    parts = [clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet")
             for c in blocks]
    (GENINC / "oferta-intro.html").write_text("\n".join(parts) + "\n", encoding="utf-8")
    print(f"intro oferta-intro.html: {len(strip_html(' '.join(parts)).split())} words"
          f" ({len(parts)} sections)")


def migrate_home_sections(src):
    """Homepage text sections (Adwokat Warszawa / Przykładowe sprawy sądowe /
    Porady i inne usługi prawne) + the 'Pozostałe specjalizacje' list — the new
    homepage renders them per the design deck."""
    GENINC.mkdir(parents=True, exist_ok=True)
    soup = src.soup("https://noriet.pl/")
    parts = []
    specs = ""
    if soup:
        for h2 in soup.find_all("h2"):
            t = h2.get_text(strip=True)
            if t.startswith(("Adwokat Warszawa", "Przykładowe sprawy",
                             "Porady i inne")):
                parts.append(clean_fragment(h2.parent,
                                            EXPORT / "files/noriet/uploads", "noriet"))
        for h3 in soup.find_all("h3"):
            if h3.get_text(strip=True) == "Pozostałe specjalizacje":
                txt = strip_html(str(h3.find_next_sibling())) if h3.find_next_sibling() \
                    else h3.parent.get_text(" ", strip=True)
                txt = txt.replace("Pozostałe specjalizacje", "", 1)
                txt = txt.split("Konsultacje")[0].strip().rstrip(",")
                specs = "".join(f"<li>{s.strip()}</li>"
                                for s in txt.split(",") if s.strip())
                break
    (GENINC / "home-sections.html").write_text("\n".join(parts) + "\n",
                                               encoding="utf-8")
    (GENINC / "home-specjalizacje.html").write_text(
        f'<ul class="chips">{specs}</ul>\n', encoding="utf-8")
    print(f"home sections: {len(parts)} blocks, "
          f"{len(strip_html(' '.join(parts)).split())} words; specs items: "
          f"{specs.count('<li>')}")


def migrate_obligacje(src):
    url = "https://noriet.pl/obligacje/"
    soup, iv = src.soup(url), src.inv.get(url)
    c = soup.select_one("[class*=blogContent]")
    body = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet")
    fm = {
        "layout": "layouts/service.njk",
        "permalink": "/obligacje/",
        "eleventyExcludeFromCollections": True,
        "robots": "noindex, nofollow",
        "titleTag": iv["title"],
        "description": iv["meta_description"],
        "h1": iv["h1"] or "Obligacje",
        "crumbParent": None,
        "migratedFrom": url,
        "note": "Consolidated bond archive (DECISIONS.md) — kept, noindex, out of the sitemap",
    }
    write_page(CONTENT / "obligacje.html", fm, body)
    print(f"obligacje: {len(strip_html(body).split())} words")


def migrate_akcjonariusze(src):
    parts = []
    for url, iv in src.inv.items():
        if iv.get("host") != "noriet.pl":
            continue
        if (iv.get("db_post_type") or iv.get("post_type")) != "financing_messages":
            continue
        soup = src.soup(url)
        if soup is None:
            continue
        c = soup.select_one("div.singleBlogContent")
        if c is None:
            continue
        h1 = c.find("h1")
        title = h1.get_text(" ", strip=True) if h1 else iv.get("title", "")
        body = clean_fragment(c, EXPORT / "files/noriet/uploads", "noriet",
                              drop_h1=True)
        parts.append(f"<section>\n<h2>{title}</h2>\n{body}\n</section>")
    fm = {
        "layout": "layouts/service.njk",
        "permalink": "/akcjonariusze/",
        "eleventyExcludeFromCollections": True,
        "titleTag": "Ogłoszenia dla akcjonariuszy | Noriet",
        "description": "Ogłoszenia Kancelarii Prawnej Noriet – Zagajewska i Wspólnicy S.K.A. wymagane przepisami Kodeksu spółek handlowych.",
        "h1": "Ogłoszenia dla akcjonariuszy",
        "crumbParent": None,
        "note": "Statutory S.K.A. announcements page; content = financing_messages from the capture",
    }
    write_page(CONTENT / "akcjonariusze.html", fm, "\n".join(parts))
    print(f"akcjonariusze: {len(parts)} announcements")


def main():
    src = Sources()
    posts, meta = load_db("noriet")
    migrate_posts(src, posts, meta)
    migrate_team(src, posts, meta)
    migrate_consultations(src)
    migrate_casestudies(src, posts, meta)
    migrate_intros(src)
    migrate_home_sections(src)
    migrate_obligacje(src)
    migrate_akcjonariusze(src)


if __name__ == "__main__":
    main()
