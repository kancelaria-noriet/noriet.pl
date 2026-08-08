// Clip screenshots around text landmarks — for studying deck references.
// Usage: node tools/ref-sections.mjs <url> <prefix> <width> "landmark1|landmark2|..."
import { chromium } from "playwright";

const [url, prefix, widthArg, landmarksArg] = process.argv.slice(2);
const width = Number(widthArg || 1440);
const landmarks = (landmarksArg || "").split("|").filter(Boolean);

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width, height: 1000 } });
await page.goto(url, { waitUntil: "networkidle" });

const found = await page.evaluate((marks) => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const hits = {};
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent.trim();
    for (const m of marks) {
      if (!hits[m] && t.includes(m)) {
        const r = node.parentElement.getBoundingClientRect();
        hits[m] = Math.max(0, r.top + window.scrollY - 150);
      }
    }
  }
  for (const m of marks) if (m in hits) out.push({ mark: m, y: hits[m] });
  out.push({ mark: "top", y: 0 });
  return out;
}, landmarks);

const total = await page.evaluate(() => document.body.scrollHeight);
for (const { mark, y } of found) {
  const slug = mark.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  const h = Math.min(1000, total - y);
  await page.screenshot({
    path: `${prefix}-${slug}.png`,
    clip: { x: 0, y, width, height: h },
    fullPage: true,
  });
  console.log(`${prefix}-${slug}.png  y=${Math.round(y)}`);
}
await browser.close();
