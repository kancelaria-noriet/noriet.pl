# Design vs site — visual/structural comparison (2026-08-07)

Sources: all 10 decks re-fetched fresh from the design project and exported 1:1
to `/home/noriet/seo/design-export/` (originals + render copies with the
design-runtime script tag stripped; markup and CSS untouched).

- Design export: http://100.110.56.115:8086/ (index lists all templates)
- Site under test: http://100.110.56.115:8085/
- Screenshot pairs (`*-deck.png` / `*-site.png`, desktop frame vs 1280 render):
  `qa/shots/compare/`

Method: per-template screenshot pairs + programmatic diff of ordered
h2/h3/aria-label sequences (deck desktop frame vs live page). No site changes
were made.

## Global (every page)

1. **Header "Zadzwoń" button is unreadable** — computed `color:
   rgb(66,83,106)` (`--ink-2`) on teal `--btn-bg`. `.site-nav__list a`
   (0,1,1) beats `.btn--call` (0,1,0). Deck: white text. This is a CSS
   specificity bug, visible on every page in both themes.
2. **Page-hero pattern missing.** Deck gives every page a kicker (small-caps
   teal label), a lead paragraph, and usually two CTA buttons under the h1
   (oferta, blog, zespół, kontakt, konsultacje, publikacja, team bio). Site
   has this only on service pages; everywhere else the h1 stands bare.
3. **Footer composition.** Deck: column 1 is the firm block (name, address,
   phone, e-mail + the izby disclaimer "Adwokaci – Izba Adwokacka w
   Warszawie…"), then 3 link columns; bottom bar carries © + KRS · NIP ·
   REGON. Site: 3 link columns + a "Kontakt" heading column at the end, no
   izby disclaimer, bottom bar is © only.
4. **Topbar hours.** Deck shows "pon.–pt. 9:00–17:00" (kontakt deck says
   8:00–17:00 — the deck contradicts itself); site deliberately omits hours
   (unverifiable, see site.json note). Not a bug, but a visible difference.

## Homepage (largest composition gap)

5. **Hero tone inverted**: deck hero is light (white bg, dark serif headline,
   navy info card at right); site hero is a full navy band. Most visible
   single difference.
6. **Six deck sections missing** (deck order after the four area cards):
   - "Pozostałe specjalizacje" chip band + "Konsultacje" teaser card
   - "Zespół" — 4 lawyer cards + "Poznaj wszystkich prawników"
   - "Adwokat Warszawa" copy block with "Noriet radzi" latest-articles rail
   - "Przykładowe sprawy sądowe"
   - "Porady i inne usługi prawne"
   - "Kontakt" section with embedded form + RODO note
   Site ends after the Oferta columns with one generic CTA band
   ("Porozmawiajmy o Twojej sprawie") that the deck does not have.

## Oferta

7. **4 of 5 practice-area sections missing** — site renders only the
   "Rodzina" copy; deck has Rodzina / Spadki / Ubezpieczenia społeczne /
   Odzyskiwanie należności / Odszkodowania as two-column rows (serif h2 +
   teal specialty line + "Zobacz szczegóły →" left, body copy right).
8. Site's h1 is followed by a large empty gap; the link columns render
   without the deck's "Wszystkie usługi" heading and gray band.

## Konsultacje

9. Deck groups cards under "Konsultacje prawne" and "Prowadzenie sprawy
   rozwodowej" (gray band); site is one flat 16-card grid.
10. **Duplicates visible**: "Konsultacja podstawowa ONLINE/SPOTKANIE" and
    "rozszerzona ONLINE" appear twice (apex + biznes copies), with mixed
    price formats ("400 zł" vs "400 PLN brutto").
11. Deck cards have a large serif price, a full-width "KUP USŁUGĘ" button and
    a "szczegóły" link; site cards are flat text with no button/link.
12. Deck's closing CTA band ("Nie wiesz, którą konsultację wybrać?") missing.

## Zespół + team bio

13. Deck team cards: left-aligned name, role kicker, specjalizacja, divider,
    tel + e-mail links. Site cards: photo + centered name + role only.
14. Deck bio hero: role + izba kicker, specjalizacja lead, tel/e-mail row,
    CTAs "Zadzwoń do mecenas" / "Umów konsultację"; body split into
    "Wykształcenie i doświadczenie" + "Specjalizacja" chips + "Pozostali
    prawnicy" rail. Site: photo, h1, **raw WP publish date ("21 lipca,
    2016")**, plain paragraphs, plain Rola/Specjalizacja/Kontakt block; no
    chips, no rail, no CTAs.
15. Deck's "Nie wiesz, do kogo się zwrócić?" CTA band missing; h1 differs
    ("Nasz zespół" vs "Zespół").

## Blog + article

16. Deck blog: single-column list + right rail ("Cykle" categories + "Masz
    sprawę, nie pytanie?" CTA card); compact pagination (1 2 3 4 … 14 +
    "Następna strona →"). Site: 3-column card grid, no rail, all 14 page
    buttons, h1 "Blog" vs deck "Artykuły" + kicker + lead.
17. Site excerpts truncate mid-word ("…zabezpieczać kilka zadłużeń… W tym
    celu pow"); deck excerpts are clean single sentences.
18. Deck article: kicker (series), date + reading time, boxed "W skrócie"
    summary card, mid-article navy CTA card, "Powiązane usługi" pills, right
    rail "Ostatnie artykuły". Site article: full-width column, plain bullet
    list instead of the summary box, one end-of-article CTA band, no pills,
    no rail, no reading time.

## Service pages (closest match of all templates)

19. TOC rail: deck curates 8 entries; site lists all 18 h2s.
20. Deck ends with an FAQ section ("Najczęstsze pytania o spadek") and an
    embedded "Opisz swoją sprawę" form + kancelaria card; site has related
    pills + generic CTA band instead.
21. Deck related areas are 4 descriptive cards; site renders small pills.
22. Site body keeps migrated inline stock photos; deck body has none. Lead
    paragraph text differs.
23. Shared artifact, not a design gap: the migrated body tail carries
    old-site boilerplate (related-post excerpts, "Mapa serwisu" link list,
    "Dane kontaktowe" with KRS/NIP, "COPYRIGHT…") — present in the deck's
    sample content too (same crawl source). Migration-level cleanup, listed
    for completeness.

## Kontakt

24. Deck: h1 = full firm name + hours kicker + lead + 2 CTAs; 4-column info
    band (Adres / Telefon / Dane rejestrowe / Godziny pracy); "W czym
    pomagamy" 3-card band; form titled "Zapraszamy do współpracy!" beside a
    "Dojazd" map card with transit directions. Site: bare h1 "Kontakt",
    stacked Adres/Telefon/E-mail headings + form ("Napisz do nas"), no map,
    no registry/hours columns, no area cards.

## Publikacja / case study

25. Deck: "Dane publikacji" data card, "Autorka" rail card (photo, contacts,
    "Pełny profil →"), archive teaser card, navy CTA card. Site: metadata
    duplicated as plain h2 sections (Wydawnictwo / ISBN / Data wydania) plus
    a meta line, raw WP date, single column, no rail/CTA.

---

# Resolution log (2026-08-07, same day)

Owner asked to "fix the differences where appropriate". Fixed: items 1–3
(button contrast via explicit selector; page-hero kicker/lead/CTA pattern on
oferta, konsultacje, blog, zespół, kontakt, publikacje; footer firm column +
izby note + registry bottom bar), 5–14 (light homepage hero; all six homepage
sections — the three text blocks now migrate from the old homepage via
`migrate_home_sections`; oferta migration fixed to join all 5 offerContent
blocks + practice-row layout + "Wszystkie usługi" band; konsultacje grouped
via `_data/konsultacjeGroups.json` with deck price cards, "Kup usługę"
Stripe buttons and CTA band; 3 duplicate biznes products deduped in the
migrator; zespół detail cards + CTA band; bio hero/chips/rail + raw dates
stripped in the migrator), 16–21 (blog list + rail + compact pagination;
word-boundary excerpts from the migrator; article kicker/reading time/
"W skrócie" box/navy CTA/rail; service "Opisz swoją sprawę" form section),
24–25 (kontakt info band/W czym pomagamy/Dojazd card; publikacja rail cards).
Old-theme pictograms are now stripped from the oferta fragment (item 8's
blank gap was the first of them).

**Deliberately skipped** (with reasons):
- Topbar/kontakt **hours** (item 4) — unverifiable, deck self-contradicts
  (9:00 vs 8:00); waits with D3/NAP.
- **Cykle** rail on blog — category pages would be new URLs; URL decisions go
  through inventory.csv. Revisit in Phase 6.
- **Autorka** card on publikacja — no author field in migrated data;
  attributing all entries to one lawyer would be guesswork.
- **Curated 8-item TOC** on services — auto-generated full TOC kept
  (hides nothing; deck curation is editorial).
- **FAQ restructuring** on services and the deck's **mid-article CTA card** —
  per-page content surgery under the content freeze.
- Related areas as descriptive **cards** (kept pills) — no per-service blurb
  data; descriptions would be new copy.
- Deck's service-page **map placeholder** ("Dojazd" on kontakt links Google
  Maps instead of embedding a fake map image).
- Item 23 (old-site boilerplate tail in migrated service bodies) — untouched;
  it is a migration-scope cleanup across the 12 service pages, tracked
  separately from this design pass.
