const { guard, getBuffer } = require("./_lib");

const MAX = 4.2 * 1024 * 1024;   // Vercel limits a response to about 4.5 MB

// Fetches one PDF for the browser (browsers cannot fetch other sites' PDFs directly).
module.exports = async (req, res) => {
  const body = await guard(req, res);
  if (!body) return;
  let r;
  try { r = await getBuffer(String(body.url || ""), MAX, 25000); }
  catch (e) { return res.status(502).json({ error: "Could not download: " + e.message }); }
  if (r.status !== 200) return res.status(502).json({ error: "The website answered with error " + r.status });
  if (r.tooBig) return res.status(413).json({ error: "File is larger than 4 MB - open the link instead." });
  if (r.buf.slice(0, 5).toString() !== "%PDF-") return res.status(415).json({ error: "That link is not a PDF file." });
  res.setHeader("Content-Type", "application/pdf");
  res.status(200).send(r.buf);
};
