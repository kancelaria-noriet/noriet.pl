// Convert an authored Markdown article into a body fragment for a service page.
//
// Usage: node tools/md2page.mjs <source.md> <out-name>
// Output: src/_includes/generated/<out-name>.html
//
// Source articles live outside the repo (../content/). This keeps them the
// editable original and makes the fragment reproducible instead of hand-typed.
//
// Three normalisations, all deliberate:
//   - the first heading is dropped; it becomes the page h1 via front matter
//   - every remaining heading becomes an h2 with an id, because the rail's
//     table of contents (the `toc` filter) only reads <h2 id="...">
//   - a leading "1. " / "2. " is stripped from heading text, because the TOC
//     card already numbers its entries with a CSS counter
import MarkdownIt from "markdown-it";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [src, name] = process.argv.slice(2);
if (!src || !name) {
  console.error("usage: node tools/md2page.mjs <source.md> <out-name>");
  process.exit(1);
}

const PL = { ą:"a", ć:"c", ę:"e", ł:"l", ń:"n", ó:"o", ś:"s", ź:"z", ż:"z" };
const slugify = (text, used) => {
  let s = text.toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sekcja";
  const base = s;
  for (let i = 2; used.has(s); i++) s = `${base}-${i}`;
  used.add(s);
  return s;
};

const lines = readFileSync(src, "utf8").split("\n");
let droppedTitle = null;
const out = [];
for (const line of lines) {
  const h = line.match(/^(#{1,6})\s+(.*)$/);
  if (h) {
    if (droppedTitle === null) { droppedTitle = h[2].trim(); continue; }
    out.push("## " + h[2].trim().replace(/^\d+\.\s*/, ""));
    continue;
  }
  if (/^\s*---\s*$/.test(line)) continue;   // stray horizontal rules
  out.push(line);
}

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
let html = md.render(out.join("\n").trim());

const used = new Set();
let count = 0;
html = html.replace(/<h2>(.*?)<\/h2>/gs, (_, inner) => {
  count++;
  return `<h2 id="${slugify(inner.replace(/<[^>]+>/g, "").trim(), used)}">${inner}</h2>`;
});

const outDir = join(ROOT, "src/_includes/generated");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${name}.html`), html.trim() + "\n");
console.log(`  ${name}.html  dropped h1: "${droppedTitle}"  ${count} sections  ${html.length} B`);
