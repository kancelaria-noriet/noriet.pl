// QA contact sheet: one representative URL per template, desktop + mobile.
// Usage: node tools/gallery.mjs [baseUrl]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";

const base = process.argv[2] || "http://100.110.56.115:8085";
const pages = [
  ["home", "/"],
  ["service", "/prawo-spadkowe-warszawa/"],
  ["service-typical", "/sprawy-rozwodowe-warszawa/"],
  ["article", "/rozwod-wszystko-co-musisz-wiedziec-na-ten-temat/"],
  ["blog-index", "/blog/"],
  ["zespol", "/zespol/"],
  ["team-bio", "/team/kinga-opala-mach/"],
  ["konsultacje", "/konsultacje/"],
  ["product", "/konsultacje/audyt-rodo/"],
  ["publikacje", "/publikacje/"],
  ["casestudy", "/casestudies/nadzor/"],
  ["kontakt", "/kontakt/"],
  ["oferta", "/oferta/"],
  ["stub-dla-firm", "/dla-firm/"],
];
const widths = [1280, 390];

mkdirSync("qa/shots/gallery", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const issues = [];
for (const [name, path] of pages) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 1400 } });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `qa/shots/gallery/${name}-${width}.png` });
    const info = await page.evaluate(() => ({
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      h1: document.querySelectorAll("h1").length,
      fonts: [...new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family))].join("+"),
    }));
    if (info.overflowX || info.h1 !== 1) issues.push({ name, width, ...info });
    await page.close();
  }
}
await browser.close();

const rows = pages.map(([name, path]) => `
  <section>
    <h2>${name} <small>${path}</small></h2>
    <div class="pair">
      <a href="shots/gallery/${name}-1280.png"><img src="shots/gallery/${name}-1280.png" alt="${name} desktop" loading="lazy"></a>
      <a href="shots/gallery/${name}-390.png"><img src="shots/gallery/${name}-390.png" alt="${name} mobile" loading="lazy"></a>
    </div>
  </section>`).join("\n");
writeFileSync("qa/index.html", `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="robots" content="noindex, nofollow"><title>QA gallery — noriet-lp</title>
<link rel="stylesheet" href="gallery.css"></head><body>
<h1>QA gallery (${new Date().toISOString().slice(0, 16)})</h1>
<p>Desktop 1280 + mobile 390 per template. Dev artifact — stripped before launch.</p>
${rows}</body></html>`);
writeFileSync("qa/gallery.css", `body{font-family:system-ui;margin:2rem;background:#f5f7f9}
h2 small{color:#5d6f86;font-weight:400}
.pair{display:flex;gap:1rem;align-items:flex-start}
.pair img{max-width:68%;border:1px solid #dde3ea;border-radius:6px}
.pair a:last-child img{max-width:28%}`);
console.log("gallery written; issues:", JSON.stringify(issues));
