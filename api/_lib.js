// Shared helpers (files starting with "_" are not public web addresses on Vercel).
const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");

const CODE = process.env.ACCESS_CODE || "";                    // optional password for your boss
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === "1";       // ONLY for local testing
const UA = "Mozilla/5.0 (compatible; SMC-Finder/2.0)";

function sameCode(given) {
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(CODE).digest();
  return crypto.timingSafeEqual(a, b);
}

async function guard(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST." }); return null; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (CODE && !sameCode(body.code)) {
    await new Promise((r) => setTimeout(r, 800));
    res.status(401).json({ error: "Wrong access code." });
    return null;
  }
  return body;
}

function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x === "::1" || x === "::") return true;
  if (x.startsWith("::ffff:")) return privateIp(x.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(x);
}

// Blocks addresses inside the server's own network (so the tool cannot be abused to reach them).
async function assertPublic(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https links are allowed.");
  if (ALLOW_PRIVATE) return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Blocked address.");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error("Blocked address.");
  return url;
}

// Fetch that follows redirects by hand (checking every hop) and times out as a whole.
async function request(u, reader, { timeout = 9000, maxRedirects = 5 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    let cur = u;
    for (let i = 0; i <= maxRedirects; i++) {
      await assertPublic(cur);
      const r = await fetch(cur, { redirect: "manual", signal: ctl.signal,
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-IN,en;q=0.9" } });
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
      return await reader(r, cur);
    }
    throw new Error("Too many redirects.");
  } finally { clearTimeout(t); }
}

const getText = (u, timeout) => request(u, async (r, url) => ({
  status: r.status, type: r.headers.get("content-type") || "", url, text: await r.text() }), { timeout });

const getBuffer = (u, max, timeout) => request(u, async (r, url) => {
  const len = Number(r.headers.get("content-length") || 0);
  if (len > max) return { status: r.status, tooBig: true, url };
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, url, buf, tooBig: buf.length > max, type: r.headers.get("content-type") || "" };
}, { timeout });

function cleanSite(val) {
  for (const tok of String(val || "").replace(/<[^>]+>/g, " ").trim().split(/[\s,;|]+/)) {
    const t = tok.replace(/^[()\[\]<>.:;,'"]+|[()\[\]<>.:;,'"]+$/g, "");
    if (t.includes(".") && !t.includes("@") && t.length > 4 && !/^n\.?a\.?$|^n\/a$/i.test(t)) {
      return /^https?:\/\//i.test(t) ? t : "http://" + t;
    }
  }
  return "";
}

module.exports = { guard, getText, getBuffer, cleanSite };
