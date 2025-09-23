// functions/api/[[path]].js
// Cloudflare Pages Functions – unified /api endpoint that proxies to GAS
// Stream-safe (we never read the body unless we need to), CORS, simple session.

const GAS_BASE = "https://script.google.com/macros/s/AKfycbwrM29XMx5aQrDGj3gi64TukZDi5_M3dVj7ZkJWQky4jN1XYmlZhQf1WcD07NqzB08dLw/exec";

const ALLOW_ORIGINS = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot"
]);

const SESSION_COOKIE = "ghv_session"; // value: "admin" | "user"
const oneDay = 24 * 60 * 60;

function corsHeaders(origin) {
  const hdrs = new Headers();
  if (origin && ALLOW_ORIGINS.has(origin)) {
    hdrs.set("Access-Control-Allow-Origin", origin);
    hdrs.set("Vary", "Origin");
    hdrs.set("Access-Control-Allow-Credentials", "true");
    hdrs.set("Access-Control-Allow-Headers", "content-type");
    hdrs.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  } else {
    // default to no wildcard credentials to keep things strict
    hdrs.set("Access-Control-Allow-Origin", "null");
  }
  return hdrs;
}

function json(data, init = {}, origin) {
  const h = corsHeaders(origin);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers: h });
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.get("cookie") || "";
  raw.split(";").forEach(kv => {
    const idx = kv.indexOf("=");
    if (idx > -1) out[kv.slice(0, idx).trim()] = decodeURIComponent(kv.slice(idx + 1));
  });
  return out;
}

function setCookie(name, value, maxAgeSeconds) {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `SameSite=Lax`,
    `HttpOnly`,
    `Secure`,
    `Max-Age=${maxAgeSeconds}`
  ];
  return attrs.join("; ");
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const origin = request.headers.get("origin") || "";
  const mode = url.searchParams.get("mode") || "";

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  // Health / ping
  if (mode === "api" && url.searchParams.get("op") === "ping") {
    return json({ ok: true, ts: Date.now() }, {}, origin);
  }

  // Session info
  if (mode === "api" && url.searchParams.get("op") === "sessionInfo") {
    const cookies = parseCookies(request);
    const role = cookies[SESSION_COOKIE] === "admin" ? "admin" : (cookies[SESSION_COOKIE] ? "user" : "user");
    return json({ ok: true, info: { ok: true, role } }, {}, origin);
  }

  // Login (simple: username=admin → admin role; anything else → user)
  if (mode === "api" && url.searchParams.get("op") === "login") {
    if (request.method !== "POST") {
      return json({ ok: false, message: "POST required" }, { status: 405 }, origin);
    }
    let body = {};
    try { body = await request.json(); } catch {}
    const username = (body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    // You can make this stricter if you like:
    const isAdmin = username === "admin" && password.length > 0;

    const headers = corsHeaders(origin);
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, isAdmin ? "admin" : "user", oneDay));
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true, role: isAdmin ? "admin" : "user" }), { headers });
  }

  // Logout
  if (mode === "api" && url.searchParams.get("op") === "logout") {
    const headers = corsHeaders(origin);
    // expire cookie
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, "", 0));
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  // Update (admin only) – proxy JSON body to GAS (?mode=api&op=update)
  if (mode === "api" && url.searchParams.get("op") === "update") {
    const cookies = parseCookies(request);
    if (cookies[SESSION_COOKIE] !== "admin") {
      return json({ success: false, message: "Unauthorized" }, { status: 401 }, origin);
    }
    let payload = {};
    try { payload = await request.json(); } catch {}
    const gasUrl = new URL(GAS_BASE);
    gasUrl.searchParams.set("mode", "api");
    gasUrl.searchParams.set("op", "update");

    // Stream-safe: forward body, and stream response back without reading it.
    const upstream = await fetch(gasUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Pass through JSON as-is. Don't consume body here.
    const h = corsHeaders(origin);
    // Mirror content-type if present
    const ct = upstream.headers.get("content-type");
    if (ct) h.set("Content-Type", ct);
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  // Data (public) – proxy GET to GAS (?mode=data)
  if (mode === "data") {
    const gasUrl = new URL(GAS_BASE);
    gasUrl.searchParams.set("mode", "data");
    // Stream-safe pass-through
    const upstream = await fetch(gasUrl.toString(), { cf: { cacheTtl: 0, cacheEverything: false } });

    const h = corsHeaders(origin);
    const ct = upstream.headers.get("content-type") || "application/json";
    h.set("Content-Type", ct);
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  // Fallback
  return json({ ok: false, message: "Unknown route" }, { status: 404 }, origin);
}
