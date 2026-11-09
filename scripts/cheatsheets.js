// Renders the laminate cheat sheets as one A4 PDF and a JPEG per page, from the built app (run npm run build first).
// Usage: node scripts/cheatsheets.js <outDir>
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.join(__dirname, "..");
const CHEAT = require(path.join(root, "src/cheatsheet.js"));
const out = process.argv[2];
if (!out) throw new Error("Give an output folder");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const at = html.indexOf("const DATA = ");
if (at < 0) throw new Error("index.html has no drinks data: run npm run build");
const { drinks } = JSON.parse(html.slice(at + 13, html.indexOf(";\n", at)));
const ART = new Function(fs.readFileSync(path.join(root, "src/art.js"), "utf8") + "; return ART;")();
const byName = new Map(drinks.map((d) => [d.name, d]));
const gone = CHEAT.missing(byName);
if (gone.length) throw new Error("Not in the drinks list: " + gone.join(", "));
const art = (d) => ART(/martini glass/i.test(d.glass) ? "martini" : d.g, d.c, d.garnish, d.ice);
const font = "data:font/woff2;base64," + fs.readFileSync(path.join(root, "src/oswald.woff2")).toString("base64");
const when = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const doc = `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}.cs-page{break-after:page}${CHEAT.css(font)}</style>${CHEAT.SHEETS.map((s, i) => CHEAT.page(s, i, byName, art, when)).join("")}`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2.5 });
  await p.setContent(doc);
  await p.evaluate(() => document.fonts.ready);
  // Stop if any spec or method runs past its row, so nothing is cut off on the laminate.
  const over = await p.$$eval(".cs-row", (rows) => rows.filter((r) => { const end = r.getBoundingClientRect().bottom + 0.5; return [...r.querySelectorAll("h3, li, p")].some((x) => x.getBoundingClientRect().bottom > end); }).map((r) => r.querySelector("h3").textContent + " (" + [...r.querySelectorAll("h3, li, p")].filter((x) => x.getBoundingClientRect().bottom > r.getBoundingClientRect().bottom + 0.5).map((x) => x.closest("div").className + " " + Math.round(x.getBoundingClientRect().bottom - r.getBoundingClientRect().bottom) + "px").join(" ") + ")"));
  if (over.length && !process.env.CS_FORCE) { await b.close(); throw new Error("Text runs past its row: " + over.join(", ")); }
  await p.pdf({ path: path.join(out, "Black-Tap-Soho-Cheat-Sheets-A4.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  const pages = await p.$$(".cs-page");
  for (let i = 0; i < pages.length; i++) {
    await pages[i].screenshot({ path: path.join(out, `cheat-${String(i + 1).padStart(2, "0")}-${CHEAT.SHEETS[i].id}.jpg`), type: "jpeg", quality: 90 });
  }
  await b.close();
  console.log("pages", pages.length, "to", out);
})();
