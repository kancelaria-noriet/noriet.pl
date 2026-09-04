// One-time image pass 2 (review02 #14 + #15): responsive content images.
//
// - Every content <img> pointing at an uploads .webp gets a srcset ladder
//   (480/800/1200, capped at the original's width) regenerated from the
//   original in ../export/files/, plus sizes and corrected width/height.
//   Team photos (jpg/png) are untouched, as in tools/webp.mjs.
// - A true lead image (first image within the opening 300 chars of a body)
//   loses loading="lazy" and gains fetchpriority="high" — never lazy-load
//   the LCP image. Every other image keeps lazy loading.
// - Upload .webp files that end up unreferenced are deleted.
//
// Usage: node tools/imgpass2.mjs   (run from noriet-lp/; needs ../export)
import sharp from "sharp";
import { globSync } from "node:fs";
import { readFileSync, writeFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const EXPORT = path.join(ROOT, "..", "export", "files");
const WIDTHS = [480, 800, 1200];
const SIZES = '(min-width: 48rem) 680px, 100vw';
const LEAD_OFFSET = 300;

// url path -> candidate original files in the export capture
function originalFor(urlPath) {
  // /assets/uploads/noriet/Y/M/f-300x200.webp or /assets/uploads/2026/M/f.webp
  const rel = urlPath.replace(/^\/assets\/uploads\//, "");
  const parts = rel.split("/");
  const sub = parts[0] === "noriet" ? rel.slice("noriet/".length) : rel;
  const dir = path.dirname(sub);
  const stem = path.basename(sub, ".webp").replace(/-\d{2,4}x\d{2,4}$/, "").replace(/-\d+w$/, "");
  for (const install of ["noriet", "noriet_biznes", "noriet_rodzina"]) {
    for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
      const p = path.join(EXPORT, install, "uploads", dir, stem + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const variantCache = new Map(); // urlPath -> {srcset, src, w, h} or null (skip)

async function variantsFor(urlPath) {
  if (variantCache.has(urlPath)) return variantCache.get(urlPath);
  const disk = path.join(ROOT, "src", urlPath.replace(/^\//, "").replace("assets/", "assets/"));
  const local = path.join(ROOT, "src/assets/uploads", urlPath.replace(/^\/assets\/uploads\//, ""));
  const source = originalFor(urlPath) || local;
  if (!existsSync(local)) { variantCache.set(urlPath, null); return null; }
  const meta = await sharp(source).rotate().metadata();
  const origW = meta.width, origH = meta.height;
  let ws = WIDTHS.filter((w) => w <= origW);
  if (!ws.length) { variantCache.set(urlPath, null); return null; } // tiny original: leave as is
  if (origW < 1200 && origW > ws[ws.length - 1]) ws.push(origW);
  const dir = path.dirname(local);
  const urlDir = path.dirname(urlPath);
  const stem = path.basename(urlPath, ".webp").replace(/-\d{2,4}x\d{2,4}$/, "").replace(/-\d+w$/, "");
  const entries = [];
  for (const w of ws) {
    const name = `${stem}-${w}w.webp`;
    const out = path.join(dir, name);
    if (!existsSync(out)) {
      await sharp(source).rotate().resize({ width: w }).webp({ quality: w >= 1200 ? 72 : 82, effort: 5 }).toFile(out);
    }
    const m = await sharp(out).metadata();
    entries.push({ url: `${urlDir}/${name}`, w: m.width, h: m.height });
  }
  const src = entries.filter((e) => e.w <= 800).pop() || entries[0];
  const res = {
    src: src.url, w: src.w, h: src.h,
    srcset: entries.map((e) => `${e.url} ${e.w}w`).join(", "),
  };
  variantCache.set(urlPath, res);
  return res;
}

const files = globSync("src/**/*.{html,njk}", { cwd: ROOT }).map((f) => path.join(ROOT, f));
let tagsRewritten = 0, leads = 0;
for (const file of files) {
  let text = readFileSync(file, "utf-8");
  const body = text.startsWith("---") ? text.slice(text.indexOf("---", 4) + 3) : text;
  const bodyStart = text.length - body.length;
  const tags = [...text.matchAll(/<img\b[^>]*>/g)]
    .filter((m) => /src="\/assets\/uploads\/[^"]+\.webp"/.test(m[0]));
  if (!tags.length) continue;
  let firstContentImg = tags.find((m) => m.index >= bodyStart);
  let out = "", last = 0, changed = false;
  for (const m of tags) {
    const tag = m[0];
    const urlPath = tag.match(/src="([^"]+)"/)[1];
    const v = await variantsFor(urlPath);
    let neu = tag;
    if (v) {
      neu = neu
        .replace(/\s(?:srcset|sizes|fetchpriority)="[^"]*"/g, "")
        .replace(/src="[^"]+"/, `src="${v.src}" srcset="${v.srcset}" sizes="${SIZES}"`)
        .replace(/width="\d+"/, `width="${v.w}"`)
        .replace(/height="\d+"/, `height="${v.h}"`);
      if (!/width="/.test(neu)) neu = neu.replace("<img ", `<img width="${v.w}" height="${v.h}" `);
    }
    const isLead = m === firstContentImg && (m.index - bodyStart) < LEAD_OFFSET;
    if (isLead) {
      neu = neu.replace(/\s*loading="lazy"/, "").replace("<img ", '<img fetchpriority="high" ');
      leads++;
    }
    if (neu !== tag) {
      out += text.slice(last, m.index) + neu;
      last = m.index + tag.length;
      changed = true;
      tagsRewritten++;
    }
  }
  if (changed) writeFileSync(file, out + text.slice(last));
}
console.log(`rewrote ${tagsRewritten} img tags (${leads} lead images made eager), ${variantCache.size} unique images`);

// Delete upload .webp files that nothing references any more.
const allText = globSync("src/**/*.{html,njk,json,js}", { cwd: ROOT })
  .map((f) => readFileSync(path.join(ROOT, f), "utf-8")).join("\n");
let deleted = 0, kept = 0;
for (const f of globSync("src/assets/uploads/**/*.webp", { cwd: ROOT })) {
  const url = "/" + f.replace(/^src\//, "");
  if (allText.includes(url)) { kept++; continue; }
  unlinkSync(path.join(ROOT, f));
  deleted++;
}
console.log(`uploads cleanup: kept ${kept}, deleted ${deleted} unreferenced webp files`);
