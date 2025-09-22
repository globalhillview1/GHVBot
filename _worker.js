// _worker.js (Cloudflare Worker or Cloudflare Pages Function)
//
// Set your GAS Web App URL here (the /exec endpoint you gave):
const GAS_BASE = "https://script.google.com/macros/s/AKfycbwrM29XMx5aQrDGj3gi64TukZDi5_M3dVj7ZkJWQky4jN1XYmlZhQf1WcD07NqzB08dLw/exec";

// CORS allow-list (customize if you want to lock down)
const ALLOW_ORIGINS = [
  "https://globalhillview1.github.io",   // GitHub Pages
  "https://globalhillview1.github.io/GHVBot",
  "https://ghvbot.pages.dev",            // Cloudflare Pages
  "http://localhost:5173",
  "http://localhost:3000",
  "https://globalhillview1.github.io"    // parent domain
];

function corsHeaders(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request.headers.get("Origin") || "*") });
    }

    // Only /api goes to GAS; everything else can be static (CF Pages) or 404.
    if (url.pathname.startsWith("/api")) {
      // Build target URL to GAS
      // Keep query string; default to mode=api unless requesting /api/data passthrough
      const isData = url.pathname.startsWith("/api/data");
      const target = new URL(GAS_BASE);
      target.search = url.search || (isData ? "?mode=data" : "?mode=api");

      // If we called /api/sessionInfo etc., keep params
      // Otherwise, for POST we’ll pass JSON body straight through.
      let init = { method: request.method, headers: { "Content-Type": "application/json" } };

      if (request.method === "POST") {
        const body = await request.text();
        init.body = body || "{}";

        // Ensure op is present in the query for our GAS router
        const q = new URLSearchParams(target.search.slice(1));
        if (!q.get("mode")) q.set("mode", "api");
        const bodyObj = body ? JSON.parse(body) : {};
        if (!q.get("op") && bodyObj && bodyObj.op) q.set("op", bodyObj.op);
        target.search = "?" + q.toString();
      }

      const res = await fetch(target.toString(), init);
      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("content-type") || "application/json",
          ...corsHeaders(request.headers.get("Origin") || "*")
        }
      });
    }

    // If you're using Cloudflare Pages, this function runs *before* static assets are served.
    // Falling back lets your static site be served normally.
    return new Response("Not found", { status: 404, headers: corsHeaders(request.headers.get("Origin") || "*") });
  }
};
