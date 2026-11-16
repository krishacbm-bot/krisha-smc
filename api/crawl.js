const cheerio = require("cheerio");
const { guard, getText } = require("./_lib");

const SMC = /\bsmc\b|school[\s_%20-]*management[\s_%20-]*committee|management[\s_%20-]*committee|\bsdmc\b|\bsmdc\b|governing[\s_%20-]*body|\bpta\b|parent[\s_-]*teacher[\s_-]*association/i;
const STRONG = /\bsmc\b|school[\s_%20-]*management[\s_%20-]*committee|management[\s_%20-]*committee/i;
const ROLE = /chair\s?(person|man|woman)?|president|vice[\s-]*president|secretary|treasurer|principal|head\s?(master|mistress)|member|convenor|co-?ordinator|parent\s+(rep|member)|teacher\s+(rep|member)|nominee|councillor|trustee/i;
const PATHS = ["/smc", "/smc/", "/smc.html", "/smc.php", "/school-management-committee", "/school-management-committee/",
  "/management-committee", "/sdmc", "/about-us/smc", "/about/smc", "/smc-members", "/governing-body"];
const SKIP_EXT = /\.(jpe?g|png|gif|svg|webp|ico|zip|rar|mp4|mp3|avi|css|js|xml|docx?|xlsx?|pptx?)$/i;
const MAX_PAGES = 25, MAX_DEPTH = 2;

const host = (u) => new URL(u).hostname.replace(/^www\./, "");

async function load(url) {
  try {
    const r = await getText(url, 9000);
    if (r.status === 200 && /html/i.test(r.type)) return r;
  } catch (_) { /* unreachable */ }
  return null;
}

function members($) {
  const out = [];
  $("table").each((_, t) => {
    const rows = $(t).find("tr");
    if (rows.length < 2) return;
    const cells = (tr) => $(tr).find("th,td").map((_, c) => $(c).text().replace(/\s+/g, " ").trim()).get();
    const head = cells(rows[0]).map((h) => h.toLowerCase());
    const ni = head.findIndex((h) => h.includes("name") || h.includes("member"));
    if (ni < 0) return;
    const ri = head.findIndex((h) => /designation|post|role|position|capacity/.test(h));
    rows.slice(1).each((_, tr) => {
      const c = cells(tr);
      if (c[ni]) out.push({ name: c[ni], role: ri >= 0 ? c[ri] || "" : "" });
    });
  });
  if (out.length) return out;
  $("li,p,span,div").each((_, el) => {
    if ($(el).find("li,p,div,table").length) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 5 && text.length < 150 && ROLE.test(text)) {
      const parts = text.split(/\s[-–—:|]\s|,\s/);
      if (parts.length >= 2) {
        const a = parts[0], b = parts.slice(1).join(" ");
        if (ROLE.test(b) && !ROLE.test(a)) out.push({ name: a, role: b });
        else if (ROLE.test(a)) out.push({ name: b, role: a });
      }
    }
  });
  const seen = new Set();
  return out.filter((m) => { const k = m.name + "|" + m.role; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
}

// Crawls ONE school website: finds SMC pages, the members they list, and SMC-related PDFs.
module.exports = async (req, res) => {
  const body = await guard(req, res);
  if (!body) return;
  let start = String(body.url || "").trim();
  if (!start) return res.status(400).json({ error: "No website given." });
  if (!/^https?:\/\//i.test(start)) start = "http://" + start;
  try { new URL(start); } catch { return res.status(400).json({ error: "That is not a valid link." }); }

  const deadline = Date.now() + 100000;
  let first = await load(start);
  if (!first && start.startsWith("https://")) first = await load("http://" + start.slice(8));   // broken certificates
  if (!first) return res.status(200).json({ status: "Website unreachable", website: start, smc_pages: [], members: [], pdfs: [] });

  const root = first.url, h = host(root);
  const seen = new Set([root]);
  let frontier = [root, ...PATHS.map((p) => new URL(p, root).toString())];
  frontier.forEach((u) => seen.add(u));
  const pages = { [root]: first }, smcPages = {}, pdfs = {};
  let checked = 0, depth = 0;

  while (frontier.length && checked < MAX_PAGES && depth <= MAX_DEPTH && Date.now() < deadline) {
    const todo = frontier.splice(0, MAX_PAGES - checked);
    frontier = [];
    const fetched = [];
    for (let i = 0; i < todo.length; i += 5) {
      if (Date.now() > deadline) break;
      fetched.push(...await Promise.all(todo.slice(i, i + 5).map(async (u) => [u, pages[u] || await load(u)])));
    }
    for (const [, r] of fetched) {
      if (!r) continue;
      checked++;
      const $ = cheerio.load(r.text);
      const title = $("title").first().text().replace(/\s+/g, " ").trim();
      const body = $("body").text().replace(/\s+/g, " ").slice(0, 6000);
      const isSmc = STRONG.test(new URL(r.url).pathname) || STRONG.test(title) || (body.match(new RegExp(STRONG.source, "gi")) || []).length >= 3;
      if (isSmc && !smcPages[r.url]) smcPages[r.url] = { title, members: members($) };
      $("a[href]").each((_, a) => {
        let href;
        try { href = new URL($(a).attr("href").trim(), r.url); } catch { return; }
        if (!/^https?:$/.test(href.protocol)) return;
        href.hash = "";
        const link = href.toString(), text = $(a).text().replace(/\s+/g, " ").trim();
        if (/\.pdf$/i.test(href.pathname)) {
          if (SMC.test(link) || SMC.test(text) || isSmc) {
            pdfs[link] = { url: link, title: text || decodeURIComponent(href.pathname.split("/").pop()), found_on: r.url };
          }
          return;
        }
        if (host(link) !== h || SKIP_EXT.test(href.pathname) || seen.has(link)) return;
        seen.add(link);
        frontier.push(link);
      });
    }
    frontier.sort((a, b) => (SMC.test(a) ? 0 : 1) - (SMC.test(b) ? 0 : 1));
    depth++;
  }

  const smcList = Object.entries(smcPages);
  const pdfList = Object.values(pdfs);
  res.status(200).json({
    status: smcList.length || pdfList.length ? "SMC found" : "No SMC info found on website",
    website: root,
    pages_checked: checked,
    smc_pages: smcList.map(([url, d]) => ({ url, title: d.title })),
    members: smcList.flatMap(([url, d]) => d.members.map((m) => ({ page: url, ...m }))),
    pdfs: pdfList,
  });
};
