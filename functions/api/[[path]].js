// functions/api/[[path]].js

const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

const COOKIE_NAME = "__Host-ghv_sess";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h

const ALLOW = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
]);

const json = (obj, init = {}) =>
  new Response(JSON.stringify(obj), {
    status: init.status || 200,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });

const allowOrigin = (req) => {
  const o = req.headers.get("Origin");
  if (ALLOW.has(o)) return o;
  return "https://bot-81z.pages.dev";
};

const getQS = (url) => Object.fromEntries(new URL(url).searchParams.entries());
const getCookie = (req, name) =>
  (req.headers.get("Cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1];

const hasSession = (req) => Boolean(getCookie(req, COOKIE_NAME));
const cookieHeader = (value, maxAge) =>
  `${COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

async function handleApi(op, req) {
  const origin = allowOrigin(req);

  if (op === "ping") return json({ ok: true, ts: Date.now() });

  if (op === "sessionInfo") {
    const ok = hasSession(req);
    return json(
      { ok: true, info: { ok, role: ok ? "admin" : "user" } },
      { headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } }
    );
  }

  if (op === "login") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json(
        { ok: false, error: "bad_json" },
        { status: 400, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } }
      );
    }
    const { username, password } = body || {};
    if (username === "admin" && password) {
      return json(
        { ok: true, role: "admin" },
        {
          headers: {
            "Set-Cookie": cookieHeader("1", COOKIE_MAX_AGE),
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
          },
        }
      );
    }
    return json(
      { ok: false, error: "invalid_credentials" },
      { status: 401, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } }
    );
  }

  if (op === "logout") {
    return json(
      { ok: true },
      {
        headers: {
          "Set-Cookie": cookieHeader("", 0),
          "Access-Control-Allow-Origin": origin,
          Vary: "Origin",
        },
      }
    );
  }

  return json({ ok: false, error: "bad_op" }, { status: 400 });
}

async function proxyToGAS(mode, req) {
  const origin = allowOrigin(req);
  const u = new URL(req.url);
  const target = `${GAS_BASE}?${u.searchParams.toString()}`;

  const res = await fetch(target, { method: "GET", redirect: "follow" });

  // For updates: treat any 200 as success (GAS might return HTML/text).
  if (mode === "update") {
    if (res.ok) {
      return json(
        { ok: true },
        { headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } }
      );
    }
    return json(
      { ok: false, status: res.status },
      { status: res.status, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } }
    );
  }

  // For data: pass JSON through; if not JSON, return text (frontend shows a friendly error)
  const ct = res.headers.get("content-type") || "";
  const body = await res.text();
  const headers = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
  if (ct.includes("application/json")) {
    return new Response(body, { status: res.status, headers: { ...headers, "content-type": "application/json" } });
  }
  return new Response(body, { status: res.status, headers: { ...headers, "content-type": ct || "text/plain" } });
}

export async function onRequest({ request }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    const origin = allowOrigin(request);
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  const { mode = "", op = "" } = getQS(request.url);

  if (mode === "api") return handleApi(op, request);

  if (mode === "data" || mode === "update") {
    if (!hasSession(request))
      return json({ ok: false, error: "unauthorized" }, { status: 401 });
    return proxyToGAS(mode, request);
  }

  return json({ ok: false, error: "not_found" }, { status: 404 });
}
