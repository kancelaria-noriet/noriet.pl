import { chromium } from "playwright";
const SITE = process.env.NORIET_SITE || "http://127.0.0.1:8085";
const DECKS = process.env.NORIET_DECKS || "http://127.0.0.1:8086";
const pairs = [
  ["homepage", "/"],
  ["service-page", "/prawo-spadkowe-warszawa/"],
  ["konsultacje", "/konsultacje/"],
  ["zespol", "/zespol/"],
  ["team-bio", "/team/aleksandra-zagajewska/"],
  ["blog-index", "/blog/"],
  ["article", "/rozwod-bez-orzekania-o-winie-ile-trwa-wszystko-co-musisz-wiedziec/"],
  ["kontakt", "/kontakt/"],
  ["publikacja", "/casestudies/nadzor/"],
  ["oferta", "/oferta/"],
];
const collect = (xMin, xMax) => {
  const map = {};
  for (const el of document.querySelectorAll("body *")) {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 90) continue;
    let deepest = true;
    for (const c of el.children) {
      if (c.textContent.replace(/\s+/g, " ").trim() === t) { deepest = false; break; }
    }
    if (!deepest) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (xMin !== undefined && (r.x < xMin - 2 || r.x > xMax)) continue;
    const cs = getComputedStyle(el);
    const key = t.toLowerCase();
    if (!(key in map)) map[key] = {
      fam: cs.fontFamily.split(",")[0].replace(/['"]/g, ""),
      size: cs.fontSize, w: cs.fontWeight, color: cs.color,
      ls: cs.letterSpacing, y: Math.round(r.y), text: t.slice(0, 45),
    };
  }
  return map;
};
const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const [deckName, sitePath] of pairs) {
  const d = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await d.goto(`${DECKS}/${deckName}.html`, { waitUntil: "networkidle" });
  const frame = await d.evaluate(() => {
    let best = null;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (Math.round(r.width) === 1280 && r.height > 600 && (!best || r.height > best.h))
        best = { x: r.x, right: r.x + r.width, h: r.height };
    }
    return best;
  });
  const deckMap = await d.evaluate(`(${collect.toString()})(${frame.x}, ${frame.right})`);
  await d.close();
  const s = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await s.goto(`${SITE}${sitePath}`, { waitUntil: "networkidle" });
  const siteMap = await s.evaluate(`(${collect.toString()})()`);
  await s.close();
  const diffs = [];
  for (const key of Object.keys(siteMap)) {
    if (!(key in deckMap)) continue;
    const a = deckMap[key], b = siteMap[key];
    const parts = [];
    if (a.fam !== b.fam) parts.push(`fam ${a.fam}→${b.fam}`);
    if (a.size !== b.size) parts.push(`size ${a.size}→${b.size}`);
    if (a.w !== b.w) parts.push(`w ${a.w}→${b.w}`);
    if (a.color !== b.color) parts.push(`color ${a.color}→${b.color}`);
    const lsn = (v) => v === "normal" ? 0 : parseFloat(v);
    if (Math.abs(lsn(a.ls) - lsn(b.ls)) > 0.15) parts.push(`ls ${a.ls}→${b.ls}`);
    if (parts.length) diffs.push({ y: b.y, text: b.text, parts });
  }
  diffs.sort((p, q) => p.y - q.y);
  console.log(`\n===== ${deckName} (${diffs.length} diffs, deck→site) =====`);
  const seen = new Set();
  for (const d2 of diffs) {
    const sig = d2.parts.join("; ");
    const line = `  y${String(d2.y).padStart(5)}  "${d2.text}" | ${sig}`;
    if (!seen.has(sig) || seen.size < 200) console.log(line);
    seen.add(sig);
  }
}
await browser.close();
