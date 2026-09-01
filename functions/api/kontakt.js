// POST /api/kontakt — validate the enquiry, verify Cloudflare Turnstile, and
// deliver it through the Gmail API as the Workspace user the service account
// impersonates (domain-wide delegation, scope gmail.send only).
//
// Environment (Pages > Settings > Environment variables, set for Preview too,
// because production deployments are disabled):
//   GMAIL_SA_EMAIL        service-account email
//   GMAIL_SA_KEY          single-line base64 PKCS#8 body of the SA key (secret)
//   GMAIL_IMPERSONATE     the real Workspace user to impersonate (a.zagajewska@)
//   GMAIL_FROM            the From address — a send-as alias of that user
//                         (kontakt@noriet.pl); falls back to GMAIL_IMPERSONATE
//   TURNSTILE_SECRET_KEY  Turnstile secret (secret)
// A change to an environment variable needs a redeploy to take effect.

const TO = "kancelaria@noriet.pl";
const FROM_NAME = "Formularz noriet.pl";
const LIMIT = { name: 120, email: 200, phone: 40, message: 4000, subject: 150 };
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export async function onRequestPost({ request, env }) {
  if (!env.GMAIL_SA_EMAIL || !env.GMAIL_SA_KEY || !env.GMAIL_IMPERSONATE || !env.TURNSTILE_SECRET_KEY) {
    return json({ error: "Formularz nie jest jeszcze aktywny. Prosimy o kontakt telefoniczny lub e-mail." }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Nieprawidłowe żądanie." }, 400);
  }

  // Honeypot: a hidden field no person sees. A filled value means a bot —
  // pretend success (so it does not retry) and send nothing.
  if (typeof body.contact_time === "string" && body.contact_time.trim() !== "") {
    return json({ ok: true }, 200);
  }

  const name = oneLine(body.name, LIMIT.name);
  const email = oneLine(body.email, LIMIT.email);
  const phone = oneLine(body.phone, LIMIT.phone);
  const message = multiLine(body.message, LIMIT.message);
  const token = typeof body["cf-turnstile-response"] === "string" ? body["cf-turnstile-response"] : "";

  if (!name || !email || !message) return json({ error: "Prosimy podać imię i nazwisko, e-mail oraz treść wiadomości." }, 400);
  if (!isEmail(email)) return json({ error: "Prosimy podać prawidłowy adres e-mail." }, 400);
  if (!token) return json({ error: "Prosimy ukończyć weryfikację antyspamową." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip))) {
    return json({ error: "Weryfikacja antyspamowa nie powiodła się. Prosimy spróbować ponownie." }, 400);
  }

  const delivered = await sendEmail(env, { name, email, phone, message });
  if (!delivered) {
    return json({ error: "Nie udało się wysłać wiadomości. Prosimy spróbować później albo zadzwonić." }, 502);
  }
  return json({ ok: true }, 200);
}

async function verifyTurnstile(secret, token, ip) {
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function sendEmail(env, d) {
  try {
    const accessToken = await getAccessToken(env);
    const from = env.GMAIL_FROM || env.GMAIL_IMPERSONATE;
    const raw = b64url(new TextEncoder().encode(buildMime(from, TO, d)));
    const res = await fetch(GMAIL_SEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) console.error("Gmail send error", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("Gmail send failed", err);
    return false;
  }
}

// Service-account JWT, exchanged for an access token. `sub` impersonates the
// Workspace user, which domain-wide delegation authorises for GMAIL_SCOPE.
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: env.GMAIL_SA_EMAIL,
    sub: env.GMAIL_IMPERSONATE,
    scope: GMAIL_SCOPE,
    aud: GOOGLE_TOKEN,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlJson({ alg: "RS256", typ: "JWT" })}.${b64urlJson(claims)}`;
  const key = await importKey(env.GMAIL_SA_KEY);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("token endpoint returned no access_token");
  return data.access_token;
}

// GMAIL_SA_KEY holds the base64 PKCS#8 body of the service-account key, with
// the PEM header, footer and newlines removed — Pages env vars stay single-line.
async function importKey(base64Pkcs8) {
  const der = Uint8Array.from(atob(base64Pkcs8), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

// The body is base64 with an explicit charset, so no line-length or 8-bit
// rule can corrupt it. oneLine() already stripped CR and LF from every
// header value, which is what stops header injection here.
function buildMime(from, to, d) {
  const subject = `Zapytanie ze strony: ${d.name}`.slice(0, LIMIT.subject);
  const text = [
    `Imię i nazwisko: ${d.name}`,
    `E-mail:          ${d.email}`,
    `Telefon:         ${d.phone || "—"}`,
    "",
    "Wiadomość:",
    d.message,
  ].join("\n");
  return [
    `From: ${FROM_NAME} <${from}>`,
    `To: ${to}`,
    `Reply-To: ${d.email}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(new TextEncoder().encode(text)).replace(/(.{76})/g, "$1\r\n"),
  ].join("\r\n");
}

// RFC 2047 encoded words. Plain ASCII needs no encoding. Otherwise split into
// words of at most 75 characters, folded onto continuation lines. 45 source
// bytes is the largest chunk that fits, and chunks never split a character.
function encodeHeader(value) {
  if (!/[^\x20-\x7e]/.test(value)) return value;
  const enc = new TextEncoder();
  const words = [];
  let chunk = [];
  for (const ch of value) {
    const bytes = enc.encode(ch);
    if (chunk.length + bytes.length > 45) {
      words.push(b64(Uint8Array.from(chunk)));
      chunk = [];
    }
    chunk.push(...bytes);
  }
  if (chunk.length) words.push(b64(Uint8Array.from(chunk)));
  return words.map((w) => `=?UTF-8?B?${w}?=`).join("\r\n ");
}

function b64(bytes) {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

function b64url(bytes) {
  return b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj) {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)));
}

// Drop control characters (a header-injection guard); keep it allocation-light
// and bounded by the field limit. oneLine strips newlines too; multiLine keeps them.
function oneLine(value, max) {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value.slice(0, max)) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code !== 127) out += ch;
  }
  return out.trim();
}

function multiLine(value, max) {
  if (typeof value !== "string") return "";
  let out = "";
  for (const ch of value.replace(/\r\n/g, "\n").slice(0, max)) {
    const code = ch.codePointAt(0);
    if (code === 10 || (code >= 32 && code !== 127)) out += ch;
  }
  return out.trim();
}

// ASCII only, and no character that could break an address header. This value
// goes straight into Reply-To, and RFC 5322 headers are ASCII, so an
// internationalised address must be rejected rather than mangled.
function isEmail(value) {
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
