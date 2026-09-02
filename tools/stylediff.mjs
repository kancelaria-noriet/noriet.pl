// Box-model parity linter: matches elements by text between the deck export
// (:8086, desktop frame) and the site (:8085), then diffs computed styles —
// fonts, colors, effective background, nearest-box border/radius/padding,
// and frame-normalized geometry. Run from noriet-lp/.
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
  const xOff = xMin || 0;
  const effBg = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    }
    return "none";
  };
  const nearestBox = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const hasBorder = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
      const hasBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (hasBorder || hasBg) {
        const r = n.getBoundingClientRect();
        return {
          bg: cs.backgroundColor,
          btw: cs.borderTopWidth + " " + cs.borderTopColor,
          blw: cs.borderLeftWidth,
          radius: cs.borderRadius,
          padT: Math.round(parseFloat(cs.paddingTop)),
          padL: Math.round(parseFloat(cs.paddingLeft)),
          w: Math.round(r.width),
          x: Math.round(r.x - xOff),
        };
      }
    }
    return null;
  };
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
      text: t.slice(0, 42),
      y: Math.round(r.y),
      x: Math.round(r.x - xOff),
      font: cs.fontFamily.split(",")[0].replace(/['"]/g, "") + "/" + cs.fontSize + "/" + cs.fontWeight,
      lh: cs.lineHeight,
      color: cs.color,
      bg: effBg(el),
      box: nearestBox(el),
    };
  }
  return map;
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
let total = 0;
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
    if (a.font !== b.font) parts.push(`font ${a.font} → ${b.font}`);
    if (a.color !== b.color) parts.push(`color ${a.color} → ${b.color}`);
    if (a.bg !== b.bg) parts.push(`bg ${a.bg} → ${b.bg}`);
    const lhn = (v) => v === "normal" ? 0 : parseFloat(v);
    if (Math.abs(lhn(a.lh) - lhn(b.lh)) > 1.5) parts.push(`lh ${a.lh} → ${b.lh}`);
    if (Math.abs(a.x - b.x) > 8) parts.push(`x ${a.x} → ${b.x}`);
    if (a.box && b.box) {
      if (a.box.bg !== b.box.bg) parts.push(`boxBg ${a.box.bg} → ${b.box.bg}`);
      const bt = (v) => v.startsWith("0px") ? "0px" : v; // ignore colour of 0-width borders
      if (bt(a.box.btw) !== bt(b.box.btw)) parts.push(`boxBorderTop ${a.box.btw} → ${b.box.btw}`);
      if (a.box.radius !== b.box.radius) parts.push(`radius ${a.box.radius} → ${b.box.radius}`);
      if (Math.abs(a.box.padT - b.box.padT) > 4) parts.push(`padT ${a.box.padT} → ${b.box.padT}`);
      if (Math.abs(a.box.padL - b.box.padL) > 4) parts.push(`padL ${a.box.padL} → ${b.box.padL}`);
      if (Math.abs(a.box.w - b.box.w) > 14) parts.push(`boxW ${a.box.w} → ${b.box.w}`);
    }
    if (parts.length) diffs.push({ y: b.y, text: b.text, parts });
  }
  diffs.sort((p, q) => p.y - q.y);
  total += diffs.length;
  console.log(`\n===== ${deckName} (${diffs.length}) =====`);
  const seen = new Set();
  for (const d2 of diffs) {
    const sig = d2.parts.join("; ");
    if (seen.has(sig)) continue;
    seen.add(sig);
    console.log(`  y${String(d2.y).padStart(5)} "${d2.text}" | ${sig}`);
  }
}
console.log(`\nTOTAL raw diffs: ${total}`);
await browser.close();
