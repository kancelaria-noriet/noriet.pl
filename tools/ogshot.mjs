// Renders the default social image (1200x630) from a local HTML file.
// The file is served under the dev server's origin via route interception,
// so the site's self-hosted fonts load (a file:// page cannot load them).
// Usage: node tools/ogshot.mjs <src.html> <out.png>
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const [,, src, out] = process.argv;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.route("**/__og__", (r) =>
    r.fulfill({ contentType: "text/html; charset=utf-8", body: readFileSync(src, "utf8") }));
  await page.goto("http://localhost:8085/__og__");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  console.log("wrote", out);
} finally { await browser.close(); }
