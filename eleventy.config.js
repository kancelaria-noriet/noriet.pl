import { existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import TurndownService from "turndown";
import domino from "@mixmark-io/domino";

// --- Markdown twins for AI crawlers (PLAN Phase 3) ---------------------------
// Every content page gets a `.md` twin beside its `index.html`, generated
// after the build from the rendered page itself, so the twin can never drift
// from the HTML. The noindexed bond archive and the blog pagination/archive
// lists get none; /llms.txt is the agent-facing index instead. Keep this skip logic,
// src/llms.njk and tools/check_twins.py in sync (AGENTS.md).
const MD_SKIP_EXACT = new Set([
  "/obligacje/",
]);

function mdTwinUrl(url) {
  if (!url || !url.endsWith("/")) return null; // /404.html, /_headers, /llms.txt
  if (MD_SKIP_EXACT.has(url)) return null;
  if (url.startsWith("/qa/")) return null;
  // Blog category hubs get twins; the paginated lists and the archive do not.
  if (url.startsWith("/blog/") && !url.startsWith("/blog/kategoria/")) return null;
  return url + "index.md";
}

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
  });
  // The content has exactly one table shape: plain rows, first row = header.
  td.addRule("tableCell", {
    filter: ["td", "th"],
    replacement: (content) => ` ${content.trim().replace(/\|/g, "\\|").replace(/\n+/g, " ")} |`,
  });
  td.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      let row = "|" + content + "\n";
      const table = node.closest("table");
      if (table && table.querySelector("tr") === node) {
        row += "|" + " --- |".repeat(node.children.length) + "\n";
      }
      return row;
    },
  });
  td.addRule("table", {
    filter: ["table", "tbody", "thead"],
    replacement: (content) => "\n" + content + "\n",
  });
  // Portraits and stock photos are chrome for an agent; keep the link text.
  td.addRule("dropImages", {
    filter: "img",
    replacement: () => "",
  });
  return td;
}

// Strip chrome and upsell, keep content: the summary boxes ("W skrócie"),
// the specialization chip lists and the product selling points stay in.
const MD_STRIP = [
  "nav", "aside.rail", ".cta-card", "form", "script", "style", "button",
  ".crumb-band", ".hero__actions", ".service-hero .chips", ".form-section",
  ".kicker",
];

function pageToMarkdown(html, url, td) {
  const doc = domino.createDocument(html);
  const main = doc.querySelector("main");
  if (!main) return null;
  for (const sel of MD_STRIP) {
    for (const el of Array.from(main.querySelectorAll(sel))) el.remove();
  }
  // CSS-only label spans ("e-mail", "tel.") would glue to the link text in
  // Markdown ("e-maila.zagajewska@..."); give them a real separator.
  for (const el of Array.from(main.querySelectorAll(".bio-hero__contacts a > span"))) {
    el.textContent = el.textContent.trim().replace(/\.$/, "") + ": ";
  }
  const title = (doc.querySelector("title") || {}).textContent || "";
  const desc = doc.querySelector('meta[name="description"]');
  const canonical = doc.querySelector('link[rel="canonical"]');
  // Root-relative hrefs become absolute so a detached twin still resolves.
  // tel: / mailto: / https: are left alone. HTML on the page stays relative.
  let origin = "https://noriet.pl";
  if (canonical) {
    try { origin = new URL(canonical.getAttribute("href")).origin; } catch {}
  }
  for (const a of Array.from(main.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") || "";
    if (href.startsWith("/") && !href.startsWith("//")) {
      a.setAttribute("href", origin + href);
    }
  }
  const q = (s) => '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const head = ["---", "title: " + q(title.trim())];
  if (desc) head.push("description: " + q(desc.getAttribute("content")));
  if (canonical) head.push("source: " + canonical.getAttribute("href"));
  head.push("---", "");
  const body = td.turndown(main.innerHTML)
    .replace(/\[ +/g, "[")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return head.join("\n") + body + "\n";
}

// --- JSON-LD (rebuilt every Eleventy run from site/nav/team/page data) ------
// Templates call these filters with JSON.stringify. Do not assemble schema
// with template strings: a quote in a title would break the block.
function orgId(site) {
  return site.url + "/#kancelaria";
}
function personId(site, url) {
  return site.url + url + "#osoba";
}
function areaServedPl() {
  return [
    { "@type": "City", name: "Warszawa" },
    { "@type": "Country", name: "Polska" },
  ];
}
function parseKontakt(s) {
  const email = ((s || "").match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0];
  const tel = ((s || "").match(/\+?[\d][\d ()-]{7,}/) || [""])[0].trim();
  return { email, tel, telHref: tel ? "tel:" + tel.replace(/[^+\d]/g, "") : "" };
}
function buildJsonldOrg(site, nav, team) {
  const employees = (team || []).map((p) => ({ "@id": personId(site, p.url) }));
  const founder = (team || []).find((p) => p.data && p.data.founder);
  const catalogs = (nav.categories || []).map((cat) => ({
    "@type": "OfferCatalog",
    name: cat.label,
    url: site.url + cat.url,
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: cat.label, url: site.url + cat.url },
      },
      ...(cat.services || []).map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: s.label, url: site.url + s.url },
      })),
    ],
  }));
  const out = {
    "@context": "https://schema.org",
    "@type": ["LegalService", "Organization"],
    "@id": orgId(site),
    name: site.gbp.name,
    url: site.url + "/",
    telephone: site.phone,
    email: site.email,
    image: site.url + "/assets/img/og-default.png",
    logo: site.url + "/icon-512.png",
    sameAs: [site.social.linkedin, site.social.facebook],
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      postalCode: site.address.postalCode,
      addressLocality: site.address.city,
      addressRegion: "mazowieckie",
      addressCountry: "PL",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: site.gbp.geo.latitude,
      longitude: site.gbp.geo.longitude,
    },
    openingHoursSpecification: [{
      "@type": "OpeningHoursSpecification",
      dayOfWeek: site.gbp.openingHours.days,
      opens: site.gbp.openingHours.opens,
      closes: site.gbp.openingHours.closes,
    }],
    identifier: [
      { "@type": "PropertyValue", propertyID: "KRS", value: site.registry.krs },
      { "@type": "PropertyValue", propertyID: "NIP", value: site.registry.nip },
      { "@type": "PropertyValue", propertyID: "REGON", value: site.registry.regon },
    ],
    areaServed: areaServedPl(),
    employee: employees,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Oferta",
      url: site.url + "/oferta/",
      itemListElement: catalogs,
    },
  };
  if (founder) out.founder = { "@id": personId(site, founder.url) };
  return out;
}
function buildJsonldPerson(d, site) {
  const url = site.url + d.url;
  const bits = parseKontakt(d.kontakt);
  const knows = (d.specjalizacja || "").split(",").map((x) => x.trim()).filter(Boolean);
  const out = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": url + "#osoba",
    name: d.name,
    jobTitle: d.jobTitle,
    url,
    worksFor: { "@id": orgId(site) },
  };
  if (d.photo) out.image = site.url + d.photo;
  if (bits.tel) out.telephone = bits.tel;
  if (bits.email) out.email = bits.email;
  if (knows.length) out.knowsAbout = knows;
  const rola = d.jobTitle || "";
  let izba = null;
  if (rola.includes("adwokat") || rola.includes("adwokack")) {
    izba = "Izba Adwokacka w Warszawie";
  } else if (rola.includes("radca") || rola.includes("radcowsk")) {
    izba = "Okręgowa Izba Radców Prawnych w Warszawie";
  }
  if (izba) out.memberOf = { "@type": "Organization", name: izba };
  return out;
}
function buildJsonldArticle(d, site) {
  const id = orgId(site);
  const name = site.gbp.name;
  const out = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: d.headline,
    datePublished: d.datePublished,
    inLanguage: "pl",
    mainEntityOfPage: site.url + d.url,
    author: { "@type": "Organization", "@id": id, name },
    publisher: {
      "@type": "Organization",
      "@id": id,
      name,
      logo: {
        "@type": "ImageObject",
        url: site.url + "/icon-512.png",
        width: 512,
        height: 512,
      },
    },
  };
  if (d.description) out.description = d.description;
  if (d.section) out.articleSection = d.section;
  if (d.image) out.image = site.url + d.image;
  return out;
}
function buildJsonldService(d, site) {
  const out = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: d.name,
    url: site.url + d.url,
    provider: { "@id": orgId(site) },
    areaServed: areaServedPl(),
  };
  if (d.description) out.description = d.description;
  if (d.serviceType) out.serviceType = d.serviceType;
  if (d.lawyerUrl) out.employee = { "@id": personId(site, d.lawyerUrl) };
  return out;
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  // Icons and the web manifest must sit at the site root: browsers, crawlers
  // and iOS probe /favicon.ico and /apple-touch-icon.png directly.
  // Generated by tools/favicons.mjs — never hand-edit.
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });
  // Dev-only QA gallery. Lives OUTSIDE the repo (../qa on the dev host), so this
  // is a no-op on any checkout without it (e.g. CI/Cloudflare builds).
  if (existsSync("../qa")) {
    eleventyConfig.addPassthroughCopy({ "../qa": "qa" });
  }

  // Migrated bodies are pre-rendered HTML fragments; they must not be parsed
  // as templates (legal copy may contain brace sequences).
  eleventyConfig.setTemplateFormats(["njk", "html"]);

  eleventyConfig.setServerOptions({
    // Bound to 127.0.0.1 unless NORIET_HOST says otherwise — the site is not
    // served publicly during the testing phase.
    host: process.env.NORIET_HOST || "127.0.0.1",
    port: Number(process.env.NORIET_PORT || 8085),
  });

  // Reversed gate (owner call 2026-09-08): the DEFAULT build is production
  // (indexable, cache headers). Only the explicit value "development" turns
  // the sitewide noindex on — set in the Pages Preview environment and by
  // serve.sh. A missing or mistyped variable now fails toward indexable, so
  // the Phase 4/5 checklist verifies the deployed preview still sends noindex.
  eleventyConfig.addGlobalData("buildEnv", process.env.NORIET_ENV || "production");
  eleventyConfig.addFilter("mdTwin", mdTwinUrl);

  // First site-relative image in rendered content — the Article JSON-LD image.
  // Prefer the largest srcset candidate: Google wants large images there.
  eleventyConfig.addFilter("firstImg", (html) => {
    const tag = /<img\s[^>]*>/i.exec(html || "");
    if (!tag) return null;
    const set = /srcset="([^"]+)"/i.exec(tag[0]);
    if (set) {
      const urls = set[1].split(",").map((s) => s.trim().split(/\s+/));
      const best = urls.sort((a, b) => parseInt(a[1]) - parseInt(b[1])).pop();
      if (best && best[0].startsWith("/")) return best[0];
    }
    const m = /src="(\/[^"]+)"/.exec(tag[0]);
    return m ? m[1] : null;
  });

  eleventyConfig.on("eleventy.after", ({ results }) => {
    const td = makeTurndown();
    let n = 0;
    for (const r of results) {
      if (!r.outputPath || !r.outputPath.endsWith("index.html")) continue;
      if (!mdTwinUrl(r.url)) continue;
      const md = pageToMarkdown(r.content, r.url, td);
      if (md) {
        writeFileSync(dirname(r.outputPath) + "/index.md", md);
        n += 1;
      }
    }
    console.log(`[twins] wrote ${n} markdown twins`);
  });
  eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

  // The old site ordered lawyers by menu_order; keep that order on /zespol/.
  eleventyConfig.addCollection("team", (api) =>
    api.getFilteredByTag("team").sort((a, b) => (a.data.order || 0) - (b.data.order || 0)));

  // Table of contents from the h2 anchors the migrator embeds in content.
  eleventyConfig.addFilter("toc", (content) => {
    const out = [];
    const re = /<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/gs;
    let m;
    while ((m = re.exec(content || ""))) {
      out.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() });
    }
    return out;
  });

  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));

  // Polish count + noun: 1 artykuł, 2-4 artykuły, 5+ / 12-14 artykułów.
  eleventyConfig.addFilter("plCount", (n, one, few, many) => {
    n = Number(n);
    const mod10 = n % 10;
    const mod100 = n % 100;
    let form = many;
    if (n === 1) form = one;
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = few;
    return `${n} ${form}`;
  });

  // Blog taxonomy (src/_data/postCategories.json). The map is keyed by post
  // fileSlug, so these filters take it as an argument rather than reaching for
  // global data, which a filter cannot see.
  eleventyConfig.addFilter("inCategory", (posts, map, slug) =>
    (posts || []).filter((p) => (map || {})[p.fileSlug] === slug));

  eleventyConfig.addFilter("categoryOf", (cats, map, fileSlug) =>
    (cats || []).find((c) => c.slug === (map || {})[fileSlug]) || null);

  eleventyConfig.addFilter("excludeUrl", (arr, url) =>
    (arr || []).filter((p) => p.url !== url));

  // Resolve a front-matter URL list to pages, preserving order.
  eleventyConfig.addFilter("byUrls", (arr, urls) =>
    (urls || []).map((u) => (arr || []).find((p) => p.url === u)).filter(Boolean));

  eleventyConfig.addFilter("readingTime", (content) => {
    const words = String(content || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    return `ok. ${Math.max(1, Math.round(words / 220))} min czytania`;
  });

  // Series kicker derived from the title prefix ("Noriet radzi: …").
  const SERIES = ["Noriet radzi", "Noriet rodzinnie", "Noriet o kredytach",
    "Noriet z Sądu", "Obligacje"];
  eleventyConfig.addFilter("series", (title) => {
    const p = (title || "").split(":")[0].trim();
    return SERIES.includes(p) ? p : "";
  });

  // "400 zł" / "738 PLN brutto" → number + unit (deck sets the unit small).
  // Immutable single-key set, for building JSON-LD objects in templates.
  eleventyConfig.addFilter("setAttribute", (obj, key, value) => ({ ...obj, [key]: value }));

  // JSON-LD emitters live in filters: JSON.stringify handles the escaping
  // that hand-built template JSON would get wrong (quotes in post titles).
  eleventyConfig.addFilter("jsonldBreadcrumbs", (crumbs, leaf, siteUrl) => {
    const items = [{ label: "Strona główna", url: "/" }, ...(crumbs || [])];
    const list = items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: siteUrl + c.url,
    }));
    list.push({ "@type": "ListItem", position: list.length + 1, name: leaf });
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: list,
    });
  });

  eleventyConfig.addFilter("jsonldFaq", (faq) =>
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: (faq || []).map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    }));

  // Firm, person, article and practice-service graphs. Rebuilt each run from
  // site.json, nav.json, team front matter and the page's own fields.
  eleventyConfig.addFilter("jsonldOrg", (site, nav, team) =>
    JSON.stringify(buildJsonldOrg(site, nav, team)));
  eleventyConfig.addFilter("jsonldPerson", (d, site) =>
    JSON.stringify(buildJsonldPerson(d, site)));
  eleventyConfig.addFilter("jsonldArticle", (d, site) =>
    JSON.stringify(buildJsonldArticle(d, site)));
  eleventyConfig.addFilter("jsonldPracticeService", (d, site) =>
    JSON.stringify(buildJsonldService(d, site)));
  eleventyConfig.addFilter("jsonldAreaServed", () => areaServedPl());

  eleventyConfig.addFilter("priceParts", (s) => {
    const m = String(s || "").match(/^([\d\s.,]+)\s*(.*)$/);
    return m ? { num: m[1].trim(), unit: m[2] } : { num: s, unit: "" };
  });

  eleventyConfig.addFilter("splitList", (s) =>
    (s || "").split(",").map((x) => x.trim()).filter(Boolean));

  // The migrated team "kontakt" field is free text:
  // "e-mail: a.zagajewska@noriet.pl    tel: +48 606650485"
  eleventyConfig.addFilter("contactBits", (s) => parseKontakt(s));

  // Migrated articles typically open with a takeaway <ul>; the deck styles it
  // as a "W skrócie" summary box. Split it off when present.
  eleventyConfig.addFilter("summarySplit", (content) => {
    const c = String(content || "");
    // Tolerate wrapper <div>s and empty <p>s the migrator keeps around the body.
    const idx = c.indexOf("<ul");
    if (idx > -1 && /^(\s|<div[^>]*>|<p>\s*<\/p>)*$/.test(c.slice(0, idx))) {
      const end = c.indexOf("</ul>", idx);
      if (end > -1) {
        return {
          summary: c.slice(idx, end + 5),
          rest: c.slice(0, idx) + c.slice(end + 5),
        };
      }
    }
    return { summary: "", rest: c };
  });

  // Split a migrated flat fragment into per-h2 sections (oferta rows).
  eleventyConfig.addFilter("h2Sections", (content) => {
    const out = [];
    const parts = String(content || "").split(/(?=<h2 )/);
    for (const part of parts) {
      const m = part.match(/^<h2 id="([^"]+)"[^>]*>(.*?)<\/h2>/s);
      if (!m) continue;
      let rest = part.slice(m[0].length);
      let sub = "";
      const h3 = rest.match(/^\s*<h3[^>]*>(.*?)<\/h3>/s);
      if (h3) {
        sub = h3[1].replace(/<[^>]+>/g, "").trim();
        rest = rest.slice(rest.indexOf(h3[0]) + h3[0].length);
      }
      out.push({
        id: m[1],
        heading: m[2].replace(/<[^>]+>/g, "").trim(),
        sub,
        // strip old-theme wrapper divs — splitting on <h2 leaves them
        // unbalanced, which breaks the practice-row grid
        body: rest.replace(/<\/?div[^>]*>/g, "").trim(),
      });
    }
    return out;
  });

  // Compact pagination: 1 2 3 4 … N (deck) instead of all page buttons.
  eleventyConfig.addFilter("pageWindow", (hrefs, currentUrl) => {
    const n = hrefs.length;
    const cur = hrefs.indexOf(currentUrl);
    const idx = new Set([0, 1, 2, 3, cur - 1, cur, cur + 1, n - 1]
      .filter((i) => i >= 0 && i < n));
    const out = [];
    let prev = -1;
    for (const i of [...idx].sort((a, b) => a - b)) {
      if (prev !== -1 && i - prev > 1) out.push({ gap: true });
      out.push({ href: hrefs[i], label: String(i + 1), current: i === cur });
      prev = i;
    }
    return out;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    htmlTemplateEngine: false,
    markdownTemplateEngine: "njk",
  };
}
