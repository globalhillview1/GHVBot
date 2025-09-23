// functions/api/[[path]].js
// Cloudflare Pages Functions – unified /api endpoint that proxies to your GAS app.

const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

const ALLOW_ORIGINS = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
]);

const SESSION_COOKIE = "ghv_session";
const oneDay = 24 * 60 * 60;

function corsHeaders(origin) {
  const h = new Headers();
  if (origin && ALLOW_ORIGINS.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Credentials", "true");
    h.set("Access-Control-Allow-Headers", "content-type");
    h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  return h;
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
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin") || "";
  const mode = url.searchParams.get("mode") || "";

  // OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }

  // ping / health
  if (mode === "api" && url.searchParams.get("op") === "ping") {
    return json({ ok: true, ts: Date.now() }, {}, origin);
  }

  // session info
  if (mode === "api" && url.searchParams.get("op") === "sessionInfo") {
    const role = parseCookies(request)[SESSION_COOKIE] === "admin" ? "admin" : "user";
    return json({ ok: true, info: { ok: true, role } }, {}, origin);
  }

  // login
  if (mode === "api" && url.searchParams.get("op") === "login") {
    let body = {};
    try { body = await request.json(); } catch {}
    const { username, password } = body;
    const isAdmin = username?.toLowerCase() === "admin" && password?.length > 0;
    const h = corsHeaders(origin);
    h.append("Set-Cookie", setCookie(SESSION_COOKIE, isAdmin ? "admin" : "user", oneDay));
    h.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true, role: isAdmin ? "admin" : "user" }), { headers: h });
  }

  // logout
  if (mode === "api" && url.searchParams.get("op") === "logout") {
    const h = corsHeaders(origin);
    h.append("Set-Cookie", setCookie(SESSION_COOKIE, "", 0));
    h.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ ok: true }), { headers: h });
  }

  // update (admin only)
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
    const upstream = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const h = corsHeaders(origin);
    const ct = upstream.headers.get("content-type") || "application/json";
    h.set("Content-Type", ct);
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  // data
  if (mode === "data") {
    const gasUrl = new URL(GAS_BASE);
    gasUrl.searchParams.set("mode", "data");
    const upstream = await fetch(gasUrl.toString(), { cf: { cacheTtl: 0, cacheEverything: false } });
    const h = corsHeaders(origin);
    const ct = upstream.headers.get("content-type") || "application/json";
    h.set("Content-Type", ct);
    return new Response(upstream.body, { status: upstream.status, headers: h });
  }

  return json({ ok: false, message: "Not found" }, { status: 404 }, origin);
}
