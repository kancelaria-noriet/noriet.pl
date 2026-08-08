// Pixel-diff layer: screenshots comparable bands (top: topbar/header/hero,
// bottom: footer) of the deck desktop frame vs the site and runs pixelmatch.
// Content-divergent middles are skipped by design. Output: ../qa/shots/pixel/.
import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";

const pairs = [
  ["homepage", "/", 620],
  ["service-page", "/prawo-spadkowe-warszawa/", 560],
  ["konsultacje", "/konsultacje/", 460],
  ["zespol", "/zespol/", 460],
  ["kontakt", "/kontakt/", 500],
  ["blog-index", "/blog/", 460],
];
const FOOTER_H = 420;

mkdirSync("../qa/shots/pixel", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function shotDeck(page, name) {
  await page.goto(`http://100.110.56.115:8086/${name}.html`, { waitUntil: "networkidle" });
  return page.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (Math.round(r.width) === 1280 && r.height > 600 && (!best || r.height > best.height))
        best = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return best;
  });
}

const results = [];
for (const [deckName, sitePath, topH] of pairs) {
  const d = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const frame = await shotDeck(d, deckName);
  const dTop = await d.screenshot({ clip: { x: frame.x, y: frame.y, width: 1280, height: topH }, fullPage: true });
  const dBot = await d.screenshot({ clip: { x: frame.x, y: frame.y + frame.height - FOOTER_H, width: 1280, height: FOOTER_H }, fullPage: true });
  await d.close();

  const s = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await s.goto(`http://100.110.56.115:8085${sitePath}`, { waitUntil: "networkidle" });
  const siteH = await s.evaluate(() => document.documentElement.scrollHeight);
  const sTop = await s.screenshot({ clip: { x: 0, y: 0, width: 1280, height: topH }, fullPage: true });
  const sBot = await s.screenshot({ clip: { x: 0, y: siteH - FOOTER_H, width: 1280, height: FOOTER_H }, fullPage: true });
  await s.close();

  for (const [band, aBuf, bBuf] of [["top", dTop, sTop], ["footer", dBot, sBot]]) {
    const a = PNG.sync.read(aBuf), b = PNG.sync.read(bBuf);
    const diff = new PNG({ width: a.width, height: a.height });
    const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.15 });
    const pct = (100 * n / (a.width * a.height)).toFixed(1);
    writeFileSync(`../qa/shots/pixel/${deckName}-${band}-diff.png`, PNG.sync.write(diff));
    writeFileSync(`../qa/shots/pixel/${deckName}-${band}-deck.png`, aBuf);
    writeFileSync(`../qa/shots/pixel/${deckName}-${band}-site.png`, bBuf);
    results.push(`${deckName} ${band}: ${pct}% differing pixels`);
  }
}
console.log(results.join("\n"));
await browser.close();
