// functions/api/[[path]].js
// Cloudflare Pages Functions — file-based routing for /api/*
// Proxies ALL verbs to your GAS Web App and adds helpful CORS.

const GAS_BASE = "https://script.google.com/macros/s/AKfycbwrM29XMx5aQrDGj3gi64TukZDi5_M3dVj7ZkJWQky4jN1XYmlZhQf1WcD07NqzB08dLw/exec";

const ALLOW_ORIGINS = new Set([
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
  "https://ghvbot.pages.dev",
  "https://bot-81z.pages.dev",   // your Pages domain
]);

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Max-Age": "86400",
  };
}

function buildUpstreamURL(reqUrl) {
  const inUrl = new URL(reqUrl);
  const outUrl = new URL(GAS_BASE);
  // copy through query
  inUrl.searchParams.forEach((v, k) => outUrl.searchParams.set(k, v));
  return outUrl.toString();
}

async function forward(method, request) {
  const up = buildUpstreamURL(request.url);
  const headersIn = Object.fromEntries(request.headers);

  // read body for non-GET/HEAD/OPTIONS
  let body = null;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    // accept either JSON or form; just pass through raw text
    body = await request.text();
  }

  const res = await fetch(up, {
    method,
    headers: {
      // pass through content-type when we have a body
      ...(body ? { "Content-Type": headersIn["content-type"] || "application/json" } : {}),
      // small cache protection (Apps Script is dynamic)
      "Cache-Control": "no-cache",
    },
    body: body || null,
    // don’t cache dynamic requests at the edge
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  return res;
}

export async function onRequestOptions({ request }) {
  const h = corsHeaders(new URL(request.url).origin);
  return new Response(null, { status: 204, headers: h });
}

export async function onRequestGet(ctx) {
  try {
    const upstream = await forward("GET", ctx.request);
    const txt = await upstream.text();
    const h = corsHeaders(new URL(ctx.request.url).origin);
    h["Content-Type"] = upstream.headers.get("content-type") || "application/json";
    return new Response(txt, { status: upstream.status, headers: h });
  } catch (err) {
    const h = corsHeaders(new URL(ctx.request.url).origin);
    h["Content-Type"] = "application/json";
    return new Response(JSON.stringify({ ok: false, message: err.message }), { status: 502, headers: h });
  }
}

export async function onRequestPost(ctx) {
  try {
    const upstream = await forward("POST", ctx.request);
    const txt = await upstream.text();
    const h = corsHeaders(new URL(ctx.request.url).origin);
    h["Content-Type"] = upstream.headers.get("content-type") || "application/json";
    return new Response(txt, { status: upstream.status, headers: h });
  } catch (err) {
    const h = corsHeaders(new URL(ctx.request.url).origin);
    h["Content-Type"] = "application/json";
    return new Response(JSON.stringify({ ok: false, message: err.message }), { status: 502, headers: h });
  }
}

// Optional: support PUT/PATCH/DELETE the same way
export const onRequestPut = onRequestPost;
export const onRequestPatch = onRequestPost;
export const onRequestDelete = onRequestPost;
