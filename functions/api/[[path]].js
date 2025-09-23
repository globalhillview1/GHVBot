// functions/api/[[path]].js
// Universal proxy + utilities for your dashboard

const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

const ALLOW_ORIGINS = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
  "https://ghvbot.pages.dev"
]);

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0"
};

const corsHeaders = (origin) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization"
});

function pickOrigin(req) {
  const origin = req.headers.get("origin") || "";
  if ([...ALLOW_ORIGINS].some((o) => origin === o)) return origin;
  // allow same-origin (direct visit)
  const url = new URL(req.url);
  const selfOrigin = `${url.protocol}//${url.host}`;
  return selfOrigin;
}

function okJson(obj, origin) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) }
  });
}

function errJson(status, message, origin, extra = {}) {
  return new Response(
    JSON.stringify({ ok: false, error: message, ...extra }),
    { status, headers: { ...JSON_HEADERS, ...corsHeaders(origin) } }
  );
}

export async function onRequestOptions({ request }) {
  const origin = pickOrigin(request);
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequest({ request }) {
  const origin = pickOrigin(request);
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "data";
  const op = url.searchParams.get("op") || "";

  // 0) HEALTH / PING: always answer locally with JSON
  if (mode === "api" && op === "ping") {
    return okJson({ ok: true, ts: Date.now() }, origin);
  }

  // 1) Build upstream URL to GAS
  const upstream = new URL(GAS_BASE);
  url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  // 2) Prepare request init
  let init = {
    method: request.method,
    redirect: "follow"
  };

  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      init.headers = { "content-type": "application/json" };
      init.body = await request.text();
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      init.headers = { "content-type": ct };
      init.body = await request.text();
    } else {
      // default: stream as-is
      init.body = request.body;
    }
  }

  // 3) Call GAS
  let res;
  try {
    res = await fetch(upstream.toString(), init);
  } catch (e) {
    return errJson(502, "Upstream fetch failed", origin, { detail: String(e) });
  }

  // 4) If GAS sent HTML (error page, re-login page, etc), translate to JSON error
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    // Try to parse JSON anyway; if it fails, wrap text as error
    try {
      const maybe = JSON.parse(text);
      return new Response(JSON.stringify(maybe), {
        status: res.status,
        headers: { ...JSON_HEADERS, ...corsHeaders(origin) }
      });
    } catch {
      // Provide a short preview so frontend error shows something useful
      const preview = text.slice(0, 200);
      return errJson(
        502,
        "Upstream returned non-JSON",
        origin,
        { status: res.status, preview }
      );
    }
  }

  // 5) Normal JSON pass-through
  return new Response(text, {
    status: res.status,
    headers: { ...JSON_HEADERS, ...corsHeaders(origin) }
  });
}
