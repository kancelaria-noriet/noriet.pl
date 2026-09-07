// CLS trace on emulated slow mobile: which elements shift, when, from where.
import { chromium } from "playwright";

const url = process.argv[2] || "https://dev.noriet-lp.pages.dev/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150,
    downloadThroughput: 1.6 * 1024 * 1024 / 8,
    uploadThroughput: 750 * 1024 / 8,
  });
  await page.addInitScript(() => {
    window.__shifts = [];
    const desc = (n) => {
      if (!n) return "?";
      let s = n.nodeName.toLowerCase();
      if (n.id) s += "#" + n.id;
      if (n.className && typeof n.className === "string")
        s += "." + n.className.trim().split(/\s+/).join(".");
      return s;
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({
          t: Math.round(e.startTime),
          value: +e.value.toFixed(4),
          sources: (e.sources || []).map((s) => ({
            node: desc(s.node),
            from: s.previousRect ? [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height] : null,
            to: s.currentRect ? [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height] : null,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const data = await page.evaluate(() => {
    const fonts = performance.getEntriesByType("resource")
      .filter((r) => /woff2|fonts.css|main.css|theme-init/.test(r.name))
      .map((r) => ({ name: r.name.split("/").pop(), start: Math.round(r.startTime), end: Math.round(r.responseEnd) }));
    const total = window.__shifts.reduce((a, s) => a + s.value, 0);
    return { total: +total.toFixed(4), shifts: window.__shifts, fonts };
  });
  console.log(JSON.stringify(data, null, 1));
} finally {
  await browser.close();
}
