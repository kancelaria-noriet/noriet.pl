// One-time: add explicit width/height to content <img> tags that lack them
// (PLAN Phase 3 — layout shift). Reads real pixel dimensions from the files.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import sharp from "sharp";

const files = execSync("grep -rl '<img' src/content src/_includes/authored src/_includes/generated", { encoding: "utf8" }).trim().split("\n");
let fixed = 0, missing = [];
for (const f of files) {
  let s = readFileSync(f, "utf8");
  const tags = [...s.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  for (const tag of tags) {
    if (/\bwidth=/.test(tag) && /\bheight=/.test(tag)) continue;
    const src = (tag.match(/src="([^"]+)"/) || [])[1];
    if (!src || !src.startsWith("/assets/uploads/")) { missing.push(`${f}: external/odd ${src}`); continue; }
    const disk = "src" + src;
    if (!existsSync(disk)) { missing.push(`${f}: file missing ${src}`); continue; }
    const meta = await sharp(disk).metadata();
    let out = tag.replace(/\bwidth="[^"]*"\s*/g, "").replace(/\bheight="[^"]*"\s*/g, "");
    out = out.replace("<img ", `<img width="${meta.width}" height="${meta.height}" `);
    s = s.split(tag).join(out);
    fixed++;
  }
  writeFileSync(f, s);
}
console.log(`added dimensions to ${fixed} img tags`);
if (missing.length) console.log("unresolved:", missing.join("; "));
