# noriet-lp — the Eleventy rebuild of noriet.pl

Static site (Eleventy 3) for the noriet.pl migration. Dev phase: built and
served from wormhole over tailnet only. **No git, no Cloudflare** until the
owner explicitly calls for each (see `../DECISIONS.md`, Dev workflow).

## Run

```
./build.sh     # one-off build to _site/
./serve.sh     # dev server on http://<tailscale-ip>:8085/ (watch + reload)
```

Node comes from fnm (user-local, `~/.local/share/fnm`); the scripts set it up
themselves. Override binding with `NORIET_HOST`/`NORIET_PORT`. Set
`NORIET_ENV=production` to drop the dev-only `noindex` meta.

## Structure

```
eleventy.config.js       input src/, output _site/; .html content not template-parsed
src/_data/site.json      NAP (phone = PLACEHOLDER until D3), base URL
src/_data/nav.json       crew-approved taxonomy (header, 4 area cards,
                         oferta grid, footer columns, bottom bar)
src/_data/stubs.json     not-yet-migrated URLs rendered as marked stubs (noindex)
src/_includes/           base layout, header/footer/breadcrumb partials,
                         service + stub layouts
src/assets/css/main.css  the only stylesheet — tokens extracted from the
                         approved design decks; mobile-first
src/assets/js/nav.js     the only script — menu toggle, progressive enhancement
                         (menu fully visible without JS)
src/content/             ALL migrated content (GENERATED — see below):
                         services/ (12), posts/ (139), team/ (9),
                         konsultacje/ (16, apex+biznes merged), casestudies/ (6),
                         obligacje.html (noindex archive), akcjonariusze.html
src/assets/uploads/      images referenced by migrated content (GENERATED)
src/assets/fonts/        self-hosted Petrona + Source Sans 3 (latin + latin-ext)
tools/migrate.py         service pages; tools/migrate_all.py — everything else;
                         run with ../export/.venv/bin/python
tools/shot.mjs           screenshot any URL at deck widths (fonts/overflow/h1 report)
tools/ref-sections.mjs   clip screenshots around text landmarks (deck references)
tools/gallery.mjs        QA contact sheet → /qa/ (dev-only; stripped at launch)
qa/decks/                local renders of the approved design decks (references)
```

## Rules that bind this code (CODING-STANDARDS.md)

- SEO first: semantic HTML, one `h1` per page, real titles/descriptions
  migrated byte-identical from the live site, canonicals to `https://noriet.pl`.
- **No inline CSS** (no `style=`, no `<style>`) — the migration pipeline strips
  presentational attributes from old content.
- No inline JS; vanilla only.
- Mobile-first, fully responsive.

## Migrated vs authored

Files under `src/content/` and `src/assets/uploads/` are **generated** by
`tools/migrate.py` from the capture in `../export/` — edit the migrator, not
the output (content freeze until cutover; see `../PLAN.md`). Everything else
is authored by hand.

## State (2026-08-07): content-complete skeleton

211 pages build: every content type migrated, chrome (topbar/header/logo/
hero+info card/trust strip/footer) ported from the decks, fonts self-hosted.
Remaining stubs (`src/_data/stubs.json`): the six D13 pages + privacy policy —
all need lawyer-written copy, not migration.

## Still ahead

JSON-LD, Umami, sitemap/robots at launch prep, redirect map (Phase 3),
the six D13 pages + privacy copy (lawyers), form backend + Turnstile (arrives
with Cloudflare). Visual pass done 2026-08-07 — verify at /qa/ (gallery of all
templates, desktop + mobile).
