// POST /e/api/info — first-party proxy for the self-hosted Umami collect
// endpoint. Upstream collector: c.entropiadev.com.
//
// ⚠️ This path mirrors COLLECT_API_ENDPOINT on the Umami app. The tracker
// appends that value to the directory of its own script URL, and functions/v.js
// serves that script from the origin root. Change one side alone and collection
// stops silently.
//
// Same-origin on purpose: a same-origin POST cannot be matched by the
// third-party rules that make up most tracker blocklists.

const UPSTREAM = "https://c.entropiadev.com/e/api/info";

export async function onRequestPost({ request }) {
  const body = await request.text();
  const headers = new Headers(request.headers);

  // The collector has no business receiving this site's cookies.
  headers.delete("Cookie");
  headers.delete("Host");
  // Let fetch recompute these for the body we actually forward.
  headers.delete("Content-Length");
  headers.delete("Content-Encoding");

  // This subrequest re-enters the Cloudflare edge, so CF-Connecting-IP would
  // reach the collector describing this Function rather than the visitor. Umami
  // honours CLIENT_IP_HEADER (X-Umami-Client-IP on the app) only when the header
  // is present, so setting it here fixes the Pages path while direct traffic
  // still falls back to CF-Connecting-IP.
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Umami-Client-IP", ip);

  try {
    const res = await fetch(UPSTREAM, { method: "POST", headers, body });
    // The tracker reads the response to pick up Umami's cache token, so pass it through.
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", "no-store");
    out.headers.delete("Set-Cookie");
    return out;
  } catch (err) {
    console.error("Umami collect proxy failed", err);
    // A collector outage must not surface as an error on the page.
    return new Response("{}", {
      status: 202,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
