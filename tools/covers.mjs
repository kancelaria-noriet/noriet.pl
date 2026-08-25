// Publication cover optimiser for /publikacje/.
//
// Usage: node tools/covers.mjs   (run after tools/migrate_all.py)
// Input:  src/_data/publications.json — `coverSource`, written by the migrator
// Output: src/assets/img/publikacje/<slug>.webp, plus cover/coverW/coverH
//         written back into publications.json
//
// The originals are 2016 WordPress uploads: four PNGs of 94-182 kB and one
// JPEG. They are at most 270 px wide, so the script never upscales — it keeps
// the native size and only changes the container. WebP at q82 holds book
// covers and a newspaper front page without visible artefacts.
//
// sharp arrives through wrangler's dependency tree, not as a direct
// dependency. This tool runs by hand and its output is committed, so the site
// build never needs sharp.
import sharp from "sharp";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UPLOADS = join(ROOT, "..", "export", "files", "noriet", "uploads");
const OUT_DIR = join(ROOT, "src/assets/img/publikacje");
const DATA = join(ROOT, "src/_data/publications.json");
const QUALITY = 82;

const items = JSON.parse(readFileSync(DATA, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });

let before = 0;
let after = 0;
for (const item of items) {
  if (!item.coverSource) {
    console.error(`  no cover: ${item.slug}`);
    continue;
  }
  const src = join(UPLOADS, item.coverSource);
  const out = join(OUT_DIR, `${item.slug}.webp`);
  const buf = await sharp(src)
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();
  writeFileSync(out, buf);
  const meta = await sharp(buf).metadata();
  item.cover = `/assets/img/publikacje/${item.slug}.webp`;
  item.coverW = meta.width;
  item.coverH = meta.height;
  const wasBytes = statSync(src).size;
  before += wasBytes;
  after += buf.length;
  const pct = Math.round((1 - buf.length / wasBytes) * 100);
  console.log(
    `${item.slug}: ${meta.width}x${meta.height}  ` +
    `${(wasBytes / 1024).toFixed(1)} kB -> ${(buf.length / 1024).toFixed(1)} kB  (-${pct}%)`);
}
writeFileSync(DATA, JSON.stringify(items, null, 2) + "\n");
console.log(
  `total: ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB  ` +
  `(-${Math.round((1 - after / before) * 100)}%)`);
