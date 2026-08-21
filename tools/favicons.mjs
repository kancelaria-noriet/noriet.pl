// Favicon generator. Builds the complete icon set from the "N" mark.
//
// Usage: node tools/favicons.mjs
// Output: src/static/ — passthrough-copied to the site root.
//
// The mark comes from src/_includes/partials/logo.njk, so the icons and the
// header logo always show the same artwork. The script rasterises with the
// shared headless Chromium, so it adds no image dependency.
//
// The full five-part mark goes on every icon. Tab icons use a pixel-snapped
// copy of it, because thin bars on fractional pixel boundaries turn to mush at
// 16 px: each bar spreads over three columns of partial alpha and the four bars
// merge. The mark was drawn on a grid, so scaling it to a 16-unit box puts
// every bar edge within 0.16 px of a whole pixel. Rounding those x-coordinates
// makes the bars exactly 2 px wide with 2 px gaps — and 4 px at 32, 6 px at 48,
// because the whole glyph then lives on integer coordinates.
//
// Geometry:
//   tab icons   16-unit box, full bleed — every pixel counts at this size
//   app icons   100-unit canvas, mark 64% — iOS and Android add a rounded mask
//   maskable    100-unit canvas, mark 54% — must fit the 80% safe circle
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
const TAB_GRID = 16;           // tab icons are authored in a 16-unit box
const PAD = { app: 18, maskable: 23 };

// --- read the mark out of the header logo -----------------------------------

function readMark() {
  const svg = readFileSync(join(ROOT, "src/_includes/partials/logo.njk"), "utf8");
  const points = [...svg.matchAll(/<polygon class="logo__mark" points="([^"]+)"/g)]
    .map((m) => m[1]);
  if (points.length !== 5) {
    throw new Error(`expected 5 logo__mark polygons, found ${points.length} — `
      + "the logo partial changed, check tools/favicons.mjs");
  }
  return points;
}

// Scale the mark into a TAB_GRID-unit box and round every x-coordinate to a
// whole unit. Only x needs rounding: the vertical bar edges are what must stay
// crisp. The bar tops are cut parallel to the diagonal, so their y-coordinates
// stay fractional and antialias, exactly as a diagonal always does.
function snapToGrid(points) {
  const scale = TAB_GRID / MARK_BOX;
  return points.map((p) => {
    const n = p.trim().split(/\s+/).map(Number);
    const out = [];
    for (let i = 0; i < n.length; i += 2) {
      out.push(Math.round(n[i] * scale), Number((n[i + 1] * scale).toFixed(3)));
    }
    return out.join(" ");
  });
}

// --- SVG assembly -----------------------------------------------------------

// canvas: the viewBox size. box: the coordinate space the points live in.
// pad: margin inside the canvas, in canvas units.
function buildSvg({ points, fill, canvas = 100, box = MARK_BOX, pad = 0,
                    bg = null, darkFill = null }) {
  const scale = (canvas - 2 * pad) / box;
  const shapes = points.map((p) => `<polygon points="${p}"/>`).join("");
  const cls = darkFill ? ' class="m"' : "";
  const transform = scale === 1 && pad === 0
    ? ""
    : ` transform="translate(${pad} ${pad}) scale(${scale.toFixed(6)})"`;
  const style = darkFill
    ? `<style>@media (prefers-color-scheme: dark){.m{fill:${darkFill}}}</style>`
    : "";
  const rect = bg ? `<rect width="${canvas}" height="${canvas}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}">`
    + `${style}${rect}<g${cls} fill="${fill}"${transform}>${shapes}</g></svg>`;
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
const tabMark = snapToGrid(mark);
mkdirSync(OUT, { recursive: true });
const written = [];

function write(name, data) {
  writeFileSync(join(OUT, name), data);
  written.push([name, data.length]);
}

const tabOpts = { points: tabMark, canvas: TAB_GRID, box: TAB_GRID };

// Tab icon: transparent, so it sits on any browser chrome colour.
write("favicon.svg", buildSvg({ ...tabOpts, fill: BRAND, darkFill: BRAND_DARK }));

// Safari pinned tab: one flat black shape, Safari applies its own tint.
write("safari-pinned-tab.svg", buildSvg({ ...tabOpts, fill: "black" }));

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  // favicon.ico — the same artwork at the three legacy sizes. 16, 32 and 48 are
  // all whole multiples of the grid, so the bars stay on pixel boundaries.
  const icoSrc = buildSvg({ ...tabOpts, fill: BRAND });
  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, buf: await raster(browser, icoSrc, size, false) });
  }
  write("favicon.ico", buildIco(icoImages));

  // App icons — opaque navy, because iOS paints transparency black.
  const appSvg = buildSvg({ points: mark, pad: PAD.app, fill: BRAND, bg: NAVY });
  write("apple-touch-icon.png", await raster(browser, appSvg, 180, true));
  write("icon-192.png", await raster(browser, appSvg, 192, true));
  write("icon-512.png", await raster(browser, appSvg, 512, true));

  // Maskable icons — the launcher crops these to its own shape.
  const maskSvg = buildSvg({ points: mark, pad: PAD.maskable, fill: BRAND, bg: NAVY });
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
