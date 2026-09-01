// Screenshot helper for the visual polish loop.
// Usage: node tools/shot.mjs <url> <outfile-prefix> [width,width...]
// Widths default to the deck frame sizes: 1280 and 390.
import { chromium } from "playwright";

const [url, prefix, widthsArg, fullArg] = process.argv.slice(2);
if (!url || !prefix) {
  console.error("usage: node tools/shot.mjs <url> <prefix> [widths]");
  process.exit(1);
}
const widths = (widthsArg || "1280,390").split(",").map(Number);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const width of widths) {
  const page = await browser.newPage({
    viewport: { width, height: 1200 },
    deviceScaleFactor: 1,
  });
  await page.goto(url, { waitUntil: "load" });
  const out = `${prefix}-${width}.png`;
  await page.screenshot({ path: out, fullPage: fullArg === "full" });
  // report which fonts actually painted + horizontal overflow
  const info = await page.evaluate(() => ({
    fonts: [...new Set([...document.fonts].filter(f => f.status === "loaded").map(f => f.family))],
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1: document.querySelectorAll("h1").length,
  }));
  console.log(out, JSON.stringify(info));
  await page.close();
}
await browser.close();
