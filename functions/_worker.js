// functions/_worker.js
// Cloudflare Pages Functions entry point
// Proxies /api/* to your Google Apps Script backend

// Your Apps Script Web App (exec URL)
const GAS_BASE = "https://script.google.com/macros/s/AKfycbwrM29XMx5aQrDGj3gi64TukZDi5_M3dVj7ZkJWQky4jN1XYmlZhQf1WcD07NqzB08dLw/exec";

// Which frontends are allowed to call this worker
const ALLOW_ORIGINS = [
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot",
  "https://ghvbot.pages.dev"
];

// Helper: add CORS headers
function cors(origin) {
  const allow = ALLOW_ORIGINS.includes(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export default {
  async fetch(req) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "*";

    // Handle OPTIONS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(origin) });
    }

    // Root page for sanity check
    if (url.pathname === "/" && req.method === "GET") {
      const html = `
        <!doctype html>
        <html><head><title>GHVBot Worker</title></head><body>
          <h2>✅ GHVBot Worker is running</h2>
          <p>Try:</p>
          <ul>
            <li><a href="/api?mode=api&op=ping">/api?mode=api&op=ping</a></li>
            <li><a href="/api/data?mode=data">/api/data?mode=data</a></li>
          </ul>
        </body></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...cors(origin) }});
    }

    // Proxy /api/* → Apps Script
    if (url.pathname.startsWith("/api")) {
      const isData = url.pathname.startsWith("/api/data");
      const target = new URL(GAS_BASE);

      // Keep query string or set default mode
      target.search = url.search || (isData ? "?mode=data" : "?mode=api");

      const init = { method: req.method, headers: { "Content-Type": "application/json" } };

      if (req.method === "POST") {
        const body = await req.text();
        init.body = body || "{}";

        // Ensure op is set in query string if in body
        const q = new URLSearchParams(target.search.slice(1));
        if (!q.get("mode")) q.set("mode", "api");
        try {
          const obj = body ? JSON.parse(body) : {};
          if (!q.get("op") && obj.op) q.set("op", obj.op);
        } catch {}
        target.search = "?" + q.toString();
      }

      const res = await fetch(target.toString(), init);
      const text = await res.text();

      return new Response(text, {
        status: res.status,
        headers: {
          "Content-Type": res.headers.get("content-type") || "application/json",
          ...cors(origin)
        }
      });
    }

    // Fallback 404
    return new Response("Not found", { status: 404, headers: cors(origin) });
  }
};
