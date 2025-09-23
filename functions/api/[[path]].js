// functions/api/[[path]].js
// Cloudflare Pages Function proxying to your GAS backend

const GAS_BASE = "https://script.google.com/macros/s/AKfycbzgtXFMYHb2Vg29UiFMlHx2Wm-KzWFXb35o56Bx3rrjfSJ8inP04I8HuVVO5cceBWftsA/exec";

const ALLOW = new Set([
  "https://bot-81z.pages.dev",
  "https://globalhillview1.github.io",
  "https://globalhillview1.github.io/GHVBot"
]);

const COOKIE = "ghv_session";

function cors(origin) {
  const h = new Headers();
  if (ALLOW.has(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Credentials", "true");
  } else {
    h.set("Access-Control-Allow-Origin", "null");
  }
  h.set("Access-Control-Allow-Headers", "content-type");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return h;
}
function json(data, init = {}, origin = "") {
  const h = cors(origin);
  h.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers: h });
}
function parseCookies(req) {
  const out = {};
  (req.headers.get("cookie") || "").split(";").forEach(c=>{
    const [k,v] = c.split("=");
    if(k) out[k.trim()] = decodeURIComponent(v||"");
  });
  return out;
}
function setCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin") || "";
  const mode = url.searchParams.get("mode");

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors(origin) });
  }

  // ping/session/login/logout
  if (mode === "api") {
    const op = url.searchParams.get("op");
    if (op === "ping") return json({ ok:true, ts:Date.now() }, {}, origin);
    if (op === "sessionInfo") {
      const cookies = parseCookies(request);
      const role = cookies[COOKIE]==="admin" ? "admin" : (cookies[COOKIE] ? "user" : "user");
      return json({ ok:true, info:{ ok:true, role } }, {}, origin);
    }
    if (op === "login") {
      if (request.method!=="POST") return json({ok:false,error:"POST only"},{status:405},origin);
      let body={}; try{ body=await request.json(); }catch{}
      const user=(body.username||"").toLowerCase(); const pw=body.password||"";
      const admin=(user==="admin" && pw);
      const h=cors(origin); h.append("Set-Cookie", setCookie(COOKIE, admin?"admin":"user", 8*3600)); h.set("Content-Type","application/json");
      return new Response(JSON.stringify({ ok:true, role:admin?"admin":"user" }), { headers:h });
    }
    if (op === "logout") {
      const h=cors(origin); h.append("Set-Cookie", setCookie(COOKIE,"",0)); h.set("Content-Type","application/json");
      return new Response(JSON.stringify({ok:true}),{headers:h});
    }
    if (op === "update") {
      const cookies=parseCookies(request);
      if(cookies[COOKIE]!=="admin") return json({success:false,message:"unauthorized"},{status:401},origin);
      let payload={}; try{payload=await request.json();}catch{}
      const upstream = await fetch(GAS_BASE+"?mode=api&op=update",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const h=cors(origin); h.set("Content-Type", upstream.headers.get("content-type")||"application/json");
      return new Response(upstream.body,{status:upstream.status,headers:h});
    }
    return json({ok:false,error:"bad_op"},{status:400},origin);
  }

  if (mode === "data") {
    const upstream = await fetch(GAS_BASE+"?mode=data",{cf:{cacheTtl:0,cacheEverything:false}});
    const h=cors(origin); h.set("Content-Type", upstream.headers.get("content-type")||"application/json");
    return new Response(upstream.body,{status:upstream.status,headers:h});
  }

  return json({ok:false,error:"not_found"},{status:404},origin);
}
