# noriet-lp — the Eleventy rebuild of noriet.pl

Static site (Eleventy 3) for the noriet.pl migration. Dev phase: built and
served from the dev host on a private interface. The repo is PUBLIC on GitHub
(`kancelaria-noriet/noriet.pl`). A push to `dev` deploys to
https://dev.noriet-lp.pages.dev (noindexed). Production deployments are
disabled until the owner calls the cutover (see `../PLAN.md`).

## Run

```
./build.sh     # one-off build to _site/
./serve.sh     # dev server on http://127.0.0.1:8085/ (watch + reload)
```

Node comes from fnm (user-local, `~/.local/share/fnm`); the scripts set it up
themselves. Override binding with `NORIET_HOST`/`NORIET_PORT`. Set
`NORIET_ENV=production` to drop the dev-only `noindex` meta.

## Structure

The mental model: `src/` in, `_site/` out. Eleventy renders the templates
through the layouts, with `_data/` as the shared facts. An after-build hook
writes a Markdown twin next to almost every HTML page (for AI crawlers).
`functions/` rides along to Cloudflare Pages as the dynamic edge layer.
`tools/` is dev-only and never deploys. Generated or local state
(`_site/`, `node_modules/`, `.wrangler/`, `.serve.log`) stays out of git.

```
eleventy.config.js   the build: passthroughs, collections, filters
                     (JSON-LD helpers), Markdown-twin generation (turndown)
build.sh / serve.sh  fnm-aware wrappers; serve.sh binds to 127.0.0.1
                     (NORIET_HOST / NORIET_PORT override)
functions/           Pages Functions: api/kontakt.js (contact form ->
                     Gmail API + Turnstile), v.js and e/api/info.js
                     (first-party Umami proxies)
src/*.njk            one file per hand-authored page (homepage, /oferta/,
                     /kontakt/, /zespol/, the authored service pages, the
                     blog index/category/archive) plus the non-HTML
                     outputs: sitemap.xml, robots.txt, llms.txt, _headers
src/_data/           global JSON: site.json (NAP, registry, GBP data,
                     public keys), nav.json (the service taxonomy — see
                     below), serviceMeta.json, postMeta.json (per-post SEO
                     meta), postCategories.json (blog taxonomy,
                     HAND-MAINTAINED), konsultacjeGroups.json,
                     publications.json, home.json, stubs.json
src/_includes/       layouts/ (base + one per content type), partials/
                     (head, chrome, breadcrumb + JSON-LD, contact form,
                     category grids), authored/ (hand-written page bodies,
                     never regenerated), generated/ (migrator output:
                     home + intro sections)
src/content/         ALL migrated WordPress content, now ordinary frozen
                     source: posts/ (140), services/ (12), konsultacje/
                     (13), team/ (9), obligacje.html, akcjonariusze.html
src/assets/          css/ (main.css = the whole design system, tokens,
                     mobile-first; fonts.css), js/ (nav, theme-init, form
                     — vanilla, no inline JS), fonts/ (self-hosted woff2),
                     img/ (og-default, partner logos, publication covers),
                     uploads/ (migrated media, WebP; team photos excepted)
src/static/          copied to the site root: _redirects (emitted by
                     ../export/redirects.py), favicons, web manifest
tools/               pre-deploy checkers (check_jsonld.py, check_twins.py,
                     check_sitemap.py), dormant migrators (migrate.py,
                     migrate_all.py), one-time passes (webp.mjs,
                     imgdims.mjs, covers.mjs, favicons*.mjs), authoring
                     (md2page.mjs), visual QA (shot.mjs, gallery.mjs,
                     ogshot.mjs, the *diff.mjs parity tools — these read
                     NORIET_SITE / NORIET_DECKS, default 127.0.0.1)
../qa/               QA artifacts — OUTSIDE the repo, dev-host only; the
                     /qa/ passthrough is a no-op when ../qa is absent
```

## Rules that bind this code (CODING-STANDARDS.md)

- SEO first: semantic HTML, one `h1` per page, real titles/descriptions
  migrated byte-identical from the live site, canonicals to `https://noriet.pl`.
- **No inline CSS** (no `style=`, no `<style>`) — the migration pipeline strips
  presentational attributes from old content.
- No inline JS; vanilla only.
- Mobile-first, fully responsive.

## Migrated vs authored

Files under `src/content/` and `src/assets/uploads/` came out of
`tools/migrate.py` and `tools/migrate_all.py`, from the capture in `../export/`.

**The migration is finished and the migrators are dormant** (2026-09-01, owner
call). The live WordPress is frozen, so there is nothing left to capture. Do not
run either script again unless the owner asks. Those files are now ordinary
source files: to change one, edit it in place. The content freeze still governs
*what* you may change — see `../PLAN.md` — but the mechanism is no longer "edit
the migrator".

Everything else is authored by hand.

The publication covers are the one exception to the byte-copy rule for
migrated images. `tools/covers.mjs` reads the source path that the migrator
records, writes an optimised WebP into `src/assets/img/publikacje/`, and fills
`cover`/`coverW`/`coverH` back into `src/_data/publications.json`. Run it after
the migrator, or the covers disappear from the page:

```sh
../export/.venv/bin/python tools/migrate_all.py   # only when the owner asks
eval "$($HOME/.local/share/fnm/fnm env)"
node tools/covers.mjs            # 566 kB of 2016 PNGs -> 74 kB of WebP
```

### Service taxonomy

`src/_data/nav.json` -> `categories` is the **only** place a service belongs to
a category. Four surfaces render from that one array, so they cannot drift:

| surface | what it renders |
|---|---|
| homepage `Oferta` section | `partials/category-grid.njk` — linked title + full list |
| `/kontakt/` | the same partial, so the two are identical by construction |
| `/oferta/` | every category, `summary` + full list |
| each hub page | `partials/category-services.njk`, under the hero |

A category's `url` is its hub page. A hub never lists itself among its own
`services`. `layouts/service.njk` decides which block a page gets by comparing
`page.url` to the category `url`: the hub shows the whole category, every other
page shows its siblings and a link back up. `serviceMeta.json` keys each
service to a category by slug.

Adding a service takes two edits: an entry in the right `categories[].services`
and, if the page uses `layouts/service.njk`, a `bySlug` entry in
`serviceMeta.json`. Check both with:

```sh
python3 - <<'EOF'
import json, io, os
nav = json.load(io.open("src/_data/nav.json", encoding="utf-8"))
meta = json.load(io.open("src/_data/serviceMeta.json", encoding="utf-8"))["bySlug"]
cats = {c["slug"] for c in nav["categories"]}
for c in nav["categories"]:
    for s in c["services"]:
        if not os.path.isfile("_site" + s["url"] + "index.html"):
            print("MISSING PAGE ", s["url"])
        if s["url"] == c["url"]:
            print("HUB LISTS ITSELF", c["slug"])
for slug, m in meta.items():
    if m["category"] not in cats:
        print("BAD CATEGORY  ", slug, m["category"])
EOF
```

Both lists must come back empty. Run it after `./build.sh`.

### Blog taxonomy

`src/_data/postCategories.json` is the exception in the other direction: it
describes generated content but is **hand-maintained**. `migrate_all.py`
rewrites `src/content/posts/` and never reads or writes this file.

It holds two things. `categories` lists the ten categories in display order,
each with its intro copy, meta tags and the service page it points at. Display
order mirrors the offer taxonomy in `nav.json`, not the post counts. `bySlug`
maps a post `fileSlug` to exactly one category slug.

**When you add a post, add its slug to `bySlug`.** An unmapped post still
builds and still appears in `/blog/` pagination, but it drops out of its
category page, out of `/blog/wszystkie-artykuly/`, and out of the sibling list
in its own rail. Nothing errors, so check the counts after a migration:

```sh
python3 - <<'EOF'
import json, glob, os, collections
d = json.load(open("src/_data/postCategories.json"))
posts = {os.path.basename(f)[:-5] for f in glob.glob("src/content/posts/*.html")}
print("unmapped:", sorted(posts - set(d["bySlug"])))
print("stale:", sorted(set(d["bySlug"]) - posts))
print(collections.Counter(d["bySlug"].values()))
EOF
```

`src/static/` is **generated** by `tools/favicons.mjs` from the mark in
`src/_includes/partials/logo.njk`, so the icons cannot drift from the header
logo. The files stay committed, because the Cloudflare build has no browser
and cannot regenerate them. Regenerate after any logo change:

```sh
eval "$($HOME/.local/share/fnm/fnm env)"
node tools/favicons.mjs          # writes src/static/, asserts the safe zone
node tools/favicons-review.mjs   # writes ../qa/favicons.html — look at it
```

Every icon carries the full five-part mark. Tab icons (`favicon.svg`,
`favicon.ico`, the Safari mask) use a copy snapped to a 16-unit grid: the mark
was drawn on a grid, so scaling it to a 16-unit box puts every bar edge within
0.16 px of a whole pixel, and rounding those x-coordinates gives bars of
exactly 2 px with 2 px gaps — 4 px at 32, 6 px at 48. Without that snap the
bars fall on fractional boundaries, each spreads over three columns of partial
alpha, and at 16 px the four bars merge into a smudge. Only the diagonal
antialiases, which is correct.

App icons carry the unsnapped mark on the navy tile, because iOS paints
transparency black and cyan on navy measures 5.1:1 against 3.3:1 on white.
`tools/favicons.mjs` fails if a maskable icon leaves the 80% safe circle.

## State (2026-09-02): pre-launch stack complete

221 pages build. In place and verified on the dev deployment: redirect map,
breadcrumbs and full JSON-LD, titles and meta for every page, Markdown twins
plus `/llms.txt`, sitemap and robots.txt, the contact form (Gmail API +
Turnstile), first-party Umami, and WebP images. **One stub is left**
(`src/_data/stubs.json`): `/polityka-prywatnosci/`, which needs
lawyer-written copy.

## Still ahead

Phase 4 QA and the cutover work — full list and order in `../PLAN.md`.
Before every push, run the pre-deploy checks: `tools/check_jsonld.py`
(every JSON-LD block against pinned counts), `tools/check_twins.py` (the
Markdown twins and `/llms.txt`), `tools/check_sitemap.py` (sitemap ↔ built
pages), `tools/check_markup.py` (link rot in migrated content) and `../export/redirects.py check` (the redirect map). Visual pass
done 2026-08-07 — verify at /qa/ (a gallery of all templates, desktop and
mobile; served from ../qa on the dev box only).
