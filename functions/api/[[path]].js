// functions/api/[[path]].js
// Cloudflare Pages Functions: handles ALL /api/* routes

const GAS_BASE =
  "https://script.google.com/macros/s/AKfycbwrM29XMx5aQrDGj3gi64TukZDi5_M3dVj7ZkJWQky4jN1XYmlZhQf1WcD07NqzB08dLw/exec";

// Which frontends are allowed to call
const ALLOW_ORIGINS = new Set([
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
  "https://ghvbot.pages.dev",
  "https://bot-81z.pages.dev", // your Pages domain
]);

function cors(origin) {
  const allow = ALLOW_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get("Origin") || "*";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors(origin) });
  }

  const incoming = new URL(request.url);
  const op = incoming.searchParams.get("op");

  // ---- Short-circuit common ops ----
  if (op === "ping") {
    return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors(origin) },
    });
  }

  if (op === "sessionInfo") {
    // You can make this smarter later (e.g. verify tokens),
    // but for now always say "not logged in"
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...cors(origin) },
    });
  }

  // ---- Proxy everything else to GAS ----
  const isData = incoming.pathname.startsWith("/api/data");
  const target = new URL(GAS_BASE);
  target.search = incoming.search || (isData ? "?mode=data" : "?mode=api");

  const init = { method: request.method, headers: { "Content-Type": "application/json" } };

  if (request.method === "POST") {
    const bodyText = await request.text();
    init.body = bodyText || "{}";

    // Ensure ?mode/op are passed through
    const qs = new URLSearchParams(target.search.slice(1));
    if (!qs.get("mode")) qs.set("mode", "api");
    try {
      const obj = bodyText ? JSON.parse(bodyText) : {};
      if (!qs.get("op") && obj && obj.op) qs.set("op", obj.op);
    } catch {}
    target.search = "?" + qs.toString();
  }

  const res = await fetch(target.toString(), init);
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      ...cors(origin),
    },
  });
}
