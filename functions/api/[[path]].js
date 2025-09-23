// functions/api/[[path]].js
// Proxies all /api/* requests to your GAS web app

const GAS_BASE = "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Build target URL
  const target = new URL(GAS_BASE);
  target.search = url.search; // preserve ?mode=data etc.

  // Copy method + body
  const init = { method: request.method, headers: {} };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
    init.headers["Content-Type"] = request.headers.get("Content-Type") || "application/json";
  }

  // Forward
  const res = await fetch(target.toString(), init);
  const text = await res.text();

  return new Response(text, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
