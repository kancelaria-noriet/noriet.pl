// Search-result meta for the migrated posts, layered over their front matter.
// src/_data/postMeta.json maps fileSlug -> { titleTag, description }.
// The h1 on the page stays as written; only the SERP snippet changes.
import meta from "../../_data/postMeta.json" with { type: "json" };

// Authors. 107 of the migrated posts end with a byline the old theme rendered
// as plain text ("autor: Paulina Stańczak-Wypych – adwokat", mostly in <em>).
// The migration kept the line and the schema ignored it (review04 #39). The
// byline is parsed from the raw source at build time: a current team member
// becomes a link to her Person node, a former colleague stays a plain name,
// an empty byline leaves the firm Organization as the author. Spelling
// variants in the bodies are mapped here, never edited in the copy.
const TEAM = {
  "paulina stańczak-wypych": "/team/paulina-stanczak-wypych/",
  "paulina stańczk-wypych": "/team/paulina-stanczak-wypych/",
  "paulina stanczak-wypych": "/team/paulina-stanczak-wypych/",
  "marta piekarska": "/team/marta-piekarska/",
  "marta piekarska-truszkiewicz": "/team/marta-piekarska/",
  "aleksandra zagajewska": "/team/aleksandra-zagajewska/",
};
const CANONICAL_NAME = {
  "/team/paulina-stanczak-wypych/": "Paulina Stańczak-Wypych",
  "/team/marta-piekarska/": "Marta Piekarska-Truszkiewicz",
  "/team/aleksandra-zagajewska/": "Aleksandra Zagajewska",
};

function parseByline(raw) {
  const m = /autor(?:ka)?:\s*([\s\S]*?)(?:<\/p>|$)/i.exec(raw || "");
  if (!m) return [];
  const plain = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) return [];
  // Co-authors are joined with a comma or with " i " ("X i adw. Y").
  return plain
    .split(/,|\s+i\s+/)
    .map((part) =>
      part
        .replace(/^\s*(adw\.|r\.\s*pr\.|radca prawny|aplikant\w*)\s*/i, "")
        .split(/\s+[–-]\s+/)[0]
        .replace(/[.\s]+$/, "")
        .trim(),
    )
    .filter((name) => /\S\s\S/.test(name))
    .map((name) => {
      const url = TEAM[name.toLowerCase()];
      return url ? { name: CANONICAL_NAME[url], url } : { name };
    });
}

const PL_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

function plDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  return `${Number(m[3])} ${PL_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export default {
  eleventyComputed: {
    titleTag: (data) => meta[data.page.fileSlug]?.titleTag || data.titleTag,
    description: (data) => meta[data.page.fileSlug]?.description || data.description,
    authors: (data) => parseByline(data.page.rawInput),
    // Visible dates and list sort use the last real update when present.
    // datePublished / isoDate stay the original day.
    freshIso: (data) => data.isoModified || data.isoDate,
    freshDisplay: (data) =>
      (data.isoModified && plDate(data.isoModified)) || data.displayDate,
  },
};
