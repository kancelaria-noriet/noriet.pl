// Favicon generator. Builds the complete icon set from the "N" mark.
//
// Usage: node tools/favicons.mjs
// Output: src/static/ — passthrough-copied to the site root.
//
// The mark comes from src/_includes/partials/logo.njk, so the icons and the
// header logo always show the same artwork. The script rasterises with the
// shared headless Chromium, so it adds no image dependency.
//
// Two versions of the mark, because detail does not survive 16 pixels:
//   simple  the outer two bars plus the diagonal — every tab-context icon
//   full    all five shapes, as in the header logo — every app icon
// At 16 px the four thin bars of the full mark merge into a smudge. The simple
// glyph keeps the same silhouette and stays readable. Compare them again with
// tools/favicons-review.mjs after any change to the logo.
//
// Geometry (canvas = 100 units):
//   tab icons   mark 88% — small sizes need thin margins to stay legible
//   app icons   mark 64% — iOS and Android apply their own rounded mask
//   maskable    mark 54% — content must fit the 80% safe circle of the spec
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/static");

const BRAND = "#009bbe";       // the mark cyan, as in the master NORIET.svg
const BRAND_DARK = "#2aa8cc";  // --brand in the dark theme of main.css
const NAVY = "#0c1e37";        // the wordmark navy, as in the master NORIET.svg

const MARK_BOX = 45.39;        // the mark is a perfect square in the master file
const PAD = { tab: 6, app: 18, maskable: 23 };

// --- read the mark out of the header logo -----------------------------------

function readMark() {
  const svg = readFileSync(join(ROOT, "src/_includes/partials/logo.njk"), "utf8");
  const points = [...svg.matchAll(/<polygon class="logo__mark" points="([^"]+)"/g)]
    .map((m) => m[1]);
  if (points.length !== 5) {
    throw new Error(`expected 5 logo__mark polygons, found ${points.length} — `
      + "the logo partial changed, check tools/favicons.mjs");
  }
  // Source order: 0 far-right bar, 1 inner-right bar, 2 far-left bar,
  // 3 inner-left bar, 4 diagonal.
  return { full: points, simple: [points[2], points[4], points[0]] };
}

// --- SVG assembly -----------------------------------------------------------

function markGroup(points, pad, fill) {
  const scale = (100 - 2 * pad) / MARK_BOX;
  const shapes = points
    .map((p) => `<polygon points="${p}"/>`)
    .join("");
  return `<g fill="${fill}" transform="translate(${pad} ${pad}) scale(${scale.toFixed(6)})">`
    + `${shapes}</g>`;
}

function buildSvg({ points, pad, fill, bg = null, size = null, darkFill = null }) {
  const dim = size ? ` width="${size}" height="${size}"` : "";
  const style = darkFill
    ? `<style>@media (prefers-color-scheme: dark){.m{fill:${darkFill}}}</style>`
    : "";
  const cls = darkFill ? ' class="m"' : "";
  const rect = bg ? `<rect width="100" height="100" fill="${bg}"/>` : "";
  const group = markGroup(points, pad, fill).replace("<g ", `<g${cls} `);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${dim}>`
    + `${style}${rect}${group}</svg>`;
}

// --- rasterising ------------------------------------------------------------

async function raster(browser, svg, size, opaque) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block}</style>${sized}`,
  );
  const buf = await page.screenshot({ omitBackground: !opaque });
  await page.close();
  return buf;
}

// --- maskable safe zone -----------------------------------------------------
// The spec lets a launcher crop a maskable icon to any shape inside a circle of
// 80% diameter. Measure the furthest ink pixel from the centre instead of
// trusting the geometry, and fail the build if it leaves that circle.

function inkRadius(buf) {
  const { width, height, data } = PNG.sync.read(buf);
  const bg = [data[0], data[1], data[2]];
  const cx = width / 2;
  const cy = height / 2;
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1])
        + Math.abs(data[i + 2] - bg[2]);
      if (diff < 24) continue;  // background, including its antialiased edge
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > max) max = d;
    }
  }
  return max / width;  // as a fraction of the canvas width
}

function assertSafeZone(name, buf) {
  const r = inkRadius(buf);
  const pct = (r * 100).toFixed(1);
  if (r > 0.4) {
    throw new Error(`${name}: ink reaches ${pct}% of the canvas from the centre, `
      + "the maskable safe circle allows 40% — reduce PAD.maskable");
  }
  console.log(`  safe zone OK: ${name} ink radius ${pct}% (limit 40%)`);
}

// --- ICO container ----------------------------------------------------------
// The entries hold PNG payloads. Every browser since IE11 reads PNG-in-ICO,
// and it keeps the file small.

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // reserved
  header.writeUInt16LE(1, 2);           // type: icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + 16 * images.length;
  images.forEach((img, i) => {
    const o = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, o);      // width
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, o + 1);  // height
    dir.writeUInt8(0, o + 2);           // palette size
    dir.writeUInt8(0, o + 3);           // reserved
    dir.writeUInt16LE(1, o + 4);        // colour planes
    dir.writeUInt16LE(32, o + 6);       // bits per pixel
    dir.writeUInt32LE(img.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.buf.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.buf)]);
}

// --- run --------------------------------------------------------------------

const mark = readMark();
mkdirSync(OUT, { recursive: true });
const written = [];

function write(name, data) {
  writeFileSync(join(OUT, name), data);
  written.push([name, data.length]);
}

// Tab icon: the simple glyph, transparent, so it sits on any chrome colour.
write("favicon.svg", buildSvg({
  points: mark.simple, pad: PAD.tab, fill: BRAND, darkFill: BRAND_DARK,
}));

// Safari pinned tab: one flat black shape, Safari applies its own tint.
write("safari-pinned-tab.svg",
  buildSvg({ points: mark.simple, pad: PAD.tab, fill: "black" }));

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  // favicon.ico — the same simple glyph at the three legacy sizes.
  const icoSrc = buildSvg({ points: mark.simple, pad: PAD.tab, fill: BRAND });
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, buf: await raster(browser, icoSrc, size, false) });
  }
  write("favicon.ico", buildIco(icoImages));

  // App icons — the full mark, opaque navy, because iOS paints transparency black.
  const appSvg = buildSvg({ points: mark.full, pad: PAD.app, fill: BRAND, bg: NAVY });
  write("apple-touch-icon.png", await raster(browser, appSvg, 180, true));
  write("icon-192.png", await raster(browser, appSvg, 192, true));
  write("icon-512.png", await raster(browser, appSvg, 512, true));

  // Maskable icons — the launcher crops these to its own shape.
  const maskSvg = buildSvg({ points: mark.full, pad: PAD.maskable, fill: BRAND, bg: NAVY });
  const mask192 = await raster(browser, maskSvg, 192, true);
  const mask512 = await raster(browser, maskSvg, 512, true);
  assertSafeZone("icon-maskable-192.png", mask192);
  assertSafeZone("icon-maskable-512.png", mask512);
  write("icon-maskable-192.png", mask192);
  write("icon-maskable-512.png", mask512);
} finally {
  await browser.close();
}

const manifest = {
  name: "Kancelaria Prawna Noriet",
  short_name: "Noriet",
  start_url: "/",
  scope: "/",
  display: "standalone",
  lang: "pl",
  background_color: NAVY,
  theme_color: "#081830",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};
write("site.webmanifest", `${JSON.stringify(manifest, null, 2)}\n`);

for (const [name, bytes] of written) {
  console.log(`  ${name.padEnd(24)} ${String(bytes).padStart(7)} B`);
}
console.log(`${written.length} files -> src/static/`);
