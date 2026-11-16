const cheerio = require("cheerio");
const { guard, getText, cleanSite } = require("./_lib");

// Reads the website each school declared in CBSE's official record (by affiliation number).
async function one(aff) {
  const url = "https://saras.cbse.gov.in/SARAS/AffiliatedList/AfflicationDetails/" + aff;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await getText(url, 20000);
      if (r.status !== 200) continue;
      const $ = cheerio.load(r.text);
      const cells = $("td,th").map((_, c) => $(c).text().replace(/\s+/g, " ").trim()).get();
      const i = cells.findIndex((c) => /^website\b/i.test(c));
      let val = "";
      if (i >= 0) {
        const same = cells[i].replace(/^website\s*:?\s*/i, "");
        const next = cells[i + 1] || "";
        val = same || (/^year of foundation/i.test(next) ? "" : next);
      }
      const site = cleanSite(val);
      return site ? { website: site, note: "From CBSE official record" }
                  : { website: "", note: "CBSE record lists no website" };
    } catch (_) { /* retry */ }
  }
  return { website: "", note: "Could not open the CBSE record" };
}

module.exports = async (req, res) => {
  const body = await guard(req, res);
  if (!body) return;
  const affs = [...new Set((body.affs || []).map((a) => String(a).split(".")[0].replace(/\D/g, "")).filter(Boolean))].slice(0, 25);
  const results = {};
  for (let i = 0; i < affs.length; i += 5) {
    await Promise.all(affs.slice(i, i + 5).map(async (a) => { results[a] = await one(a); }));
  }
  res.status(200).json({ results });
};
