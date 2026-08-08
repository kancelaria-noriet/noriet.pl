import { existsSync } from "node:fs";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  // Dev-only QA gallery. Lives OUTSIDE the repo (../qa on wormhole), so this
  // is a no-op on any checkout without it (e.g. CI/Cloudflare builds).
  if (existsSync("../qa")) {
    eleventyConfig.addPassthroughCopy({ "../qa": "qa" });
  }

  // Migrated bodies are pre-rendered HTML fragments; they must not be parsed
  // as templates (legal copy may contain brace sequences).
  eleventyConfig.setTemplateFormats(["njk", "html"]);

  eleventyConfig.setServerOptions({
    // Bound to the tailscale interface only — this box is not meant to serve
    // the site publicly during the testing phase.
    host: process.env.NORIET_HOST || "127.0.0.1",
    port: Number(process.env.NORIET_PORT || 8085),
  });

  eleventyConfig.addGlobalData("buildEnv", process.env.NORIET_ENV || "dev");
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

  eleventyConfig.addFilter("excludeUrl", (arr, url) =>
    (arr || []).filter((p) => p.url !== url));

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
  eleventyConfig.addFilter("priceParts", (s) => {
    const m = String(s || "").match(/^([\d\s.,]+)\s*(.*)$/);
    return m ? { num: m[1].trim(), unit: m[2] } : { num: s, unit: "" };
  });

  eleventyConfig.addFilter("splitList", (s) =>
    (s || "").split(",").map((x) => x.trim()).filter(Boolean));

  // The migrated team "kontakt" field is free text:
  // "e-mail: a.zagajewska@noriet.pl    tel: +48 606650485"
  eleventyConfig.addFilter("contactBits", (s) => {
    const email = ((s || "").match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0];
    const tel = ((s || "").match(/\+?[\d][\d ()-]{7,}/) || [""])[0].trim();
    return { email, tel, telHref: tel ? "tel:" + tel.replace(/[^+\d]/g, "") : "" };
  });

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
        body: rest.trim(),
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
