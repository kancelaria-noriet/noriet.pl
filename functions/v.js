// GET /v — first-party proxy for the self-hosted Umami tracker script.
// Upstream collector: c.entropiadev.com (the owner's shared Umami instance).
//
// Proxied through our own origin so the request is first-party: a same-origin
// script offers no third-party hostname for a tracker blocklist to match.
//
// ⚠️ Keep this route EXTENSIONLESS and at the ORIGIN ROOT. As /v.js the Pages
// static-asset handler answered instead of the Function at some edge locations
// (proven on entropiadev-lp). And the tracker derives its collect base from the
// directory of its own URL, so serving it at e.g. /e/v would make it POST to
// /e/e/api/info and silently record nothing.

const UPSTREAM = "https://c.entropiadev.com/v";
const JS = "application/javascript; charset=utf-8";

export async function onRequestGet() {
  let res;
  try {
    res = await fetch(UPSTREAM, { cf: { cacheEverything: true, cacheTtl: 86400 } });
  } catch (err) {
    console.error("Umami tracker fetch failed", err);
    return empty();
  }
  if (!res.ok) {
    console.error("Umami tracker upstream returned", res.status);
    return empty();
  }

  const out = new Response(res.body, res);
  out.headers.set("Content-Type", JS);
  out.headers.set("Cache-Control", "public, max-age=86400, must-revalidate");
  out.headers.delete("Set-Cookie");
  return out;
}

// A collector outage must not break the page, so serve a no-op script instead of
// an error. The short TTL stops a sustained outage from hammering this Function.
function empty() {
  return new Response("", {
    headers: { "Content-Type": JS, "Cache-Control": "public, max-age=60" },
  });
}
