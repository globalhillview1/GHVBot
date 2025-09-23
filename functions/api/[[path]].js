// functions/api/[[path]].js
// Cloudflare Pages Function: file-based routing for /api/*

/** ——— CONFIG ——— **/
const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

const COOKIE_NAME = "__Host-ghv_sess";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours
const ALLOW = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
]);

/** ——— utils ——— **/
const json = (obj, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const text = (t, status = 200, headers = {}) =>
  new Response(t, { status, headers });

const allowOrigin = (req) => {
  const o = req.headers.get("Origin");
  return ALLOW.has(o) ? o : req.url.startsWith("https://bot-81z.pages.dev") ? "https://bot-81z.pages.dev" : o || "*";
};

const getQS = (url) => Object.fromEntries(new URL(url).searchParams.entries());

const getCookie = (req, name) =>
  (req.headers.get("Cookie") || "")
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith(name + "="))
    ?.split("=")[1];

const sessionOK = (req) => Boolean(getCookie(req, COOKIE_NAME));

const cookieHeader = (value, maxAge) =>
  `${COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

/** ——— auth gates ——— **/
const mustAuth = (req) => {
  if (sessionOK(req)) return null;
  return json({ ok: false, error: "unauthorized" }, { status: 401 });
};

/** ——— handlers ——— **/
async function handleApi(op, req) {
  switch (op) {
    case "ping": {
      return json({ ok: true, ts: Date.now() });
    }
    case "sessionInfo": {
      const ok = sessionOK(req);
      return json({ ok: true, info: { ok, role: ok ? "admin" : "user" } });
    }
    case "login": {
      const origin = allowOrigin(req);
      // expect JSON {username,password}
      let creds;
      try {
        creds = await req.json();
      } catch (e) {
        return json({ ok: false, error: "bad_json" }, { status: 400, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin" } });
      }
      const { username, password } = creds || {};
      // simple admin check; change to your own validation as needed
      if (username === "admin" && password && password.length > 0) {
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
    case "logout": {
      const origin = allowOrigin(req);
      return json(
        { ok: true },
        {
          headers: {
            "Set-Cookie": cookieHeader("", 0), // delete
            "Access-Control-Allow-Origin": origin,
            Vary: "Origin",
          },
        }
      );
    }
    default:
      return json({ ok: false, error: "bad_op" }, { status: 400 });
  }
}

async function proxyToGAS(path, req) {
  // passes through query string to GAS
  const url = new URL(req.url);
  // Build target
  const target = `${GAS_BASE}?${url.searchParams.toString()}`;
  const origin = allowOrigin(req);

  // Forward only GET requests in this app
  const res = await fetch(target, { method: "GET" });

  // If GAS returns HTML, bubble it as text (front-end expects JSON and will show an error)
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const body = await res.text();
    return text(body, res.status, {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "content-type": ct || "text/plain",
    });
  }

  // JSON passthrough
  const data = await res.text(); // keep as text, we don’t mutate
  return new Response(data, {
    status: res.status,
    headers: {
      "content-type": "application/json",
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    },
  });
}

/** ——— main router ——— **/
export async function onRequest(context) {
  const { request } = context;
  const { mode = "", op = "" } = getQS(request.url);

  // CORS preflight (if you later send non-simple requests)
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

  if (mode === "api") {
    return handleApi(op, request);
  }

  if (mode === "data" || mode === "update") {
    // require session
    const gate = mustAuth(request);
    if (gate) return gate;

    // proxy to GAS
    return proxyToGAS(mode, request);
  }

  // default: 404
  return json({ ok: false, error: "not_found" }, { status: 404 });
}
