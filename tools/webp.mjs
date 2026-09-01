// One-time image pass (PLAN Phase 3): convert referenced upload images to WebP
// and rewrite every reference in src/. Exceptions:
//  - the 9 team photos stay in their original format (they feed og:image, and
//    social scrapers are unreliable with WebP) — they are re-encoded in place
//    and capped at 800px instead;
//  - PDFs stay;
//  - unreferenced files stay untouched (reported).
// Skips any conversion that would not save bytes. Deletes converted originals.
// Usage: node tools/webp.mjs
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, unlinkSync, existsSync } from "node:fs";
import sharp from "sharp";

const refRe = /\/assets\/uploads\/[^"' )]+/g;
const files = execSync("grep -rl 'assets/uploads' src --include='*.html' --include='*.njk' --include='*.json'", { encoding: "utf8" }).trim().split("\n");
const refs = new Map(); // upload path -> [source files]
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(refRe)) {
    const p = m[0];
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(f);
  }
}

const TEAM = new Set(
  execSync("grep -h '\"photo\"' src/content/team/*.html", { encoding: "utf8" })
    .match(/\/assets\/uploads\/[^"]+/g)
);

let before = 0, after = 0, converted = 0, optimized = 0, skipped = [];
for (const [ref, sources] of refs) {
  const disk = "src" + ref;
  if (!existsSync(disk)) { skipped.push(`MISSING ${ref}`); continue; }
  if (ref.endsWith(".pdf")) continue;
  const orig = statSync(disk).size;

  if (TEAM.has(ref)) {
    // Same URL, same format, smaller file: resize + re-encode in place.
    const img = sharp(disk).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true });
    const buf = ref.endsWith(".png")
      ? await img.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    if (buf.length < orig) {
      writeFileSync(disk, buf);
      before += orig; after += buf.length; optimized++;
    } else { skipped.push(`no-gain ${ref}`); }
    continue;
  }

  const out = disk.replace(/\.(jpe?g|png)$/i, ".webp");
  if (out === disk) { skipped.push(`odd-ext ${ref}`); continue; }
  const buf = await sharp(disk).rotate().webp({ quality: 82, effort: 5 }).toBuffer();
  if (buf.length >= orig) { skipped.push(`no-gain ${ref}`); continue; }
  writeFileSync(out, buf);
  const newRef = ref.replace(/\.(jpe?g|png)$/i, ".webp");
  for (const src of sources) {
    writeFileSync(src, readFileSync(src, "utf8").split(ref).join(newRef));
  }
  unlinkSync(disk);
  before += orig; after += buf.length; converted++;
}

console.log(`converted ${converted} to WebP, optimized ${optimized} in place`);
console.log(`bytes: ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB (${(100 - (after / before) * 100).toFixed(0)}% saved)`);
if (skipped.length) console.log("skipped:", skipped.join("; "));
