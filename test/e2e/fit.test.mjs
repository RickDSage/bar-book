import { test, before, after } from "node:test";
// Every page and pane, on an iPhone XS Max width and a small 320 px phone, for the owner, a bar phone, a floor phone and a
// visitor: no sideways scrolling, no button off the edge or without a name, no field under 16px (an iPhone zooms
// into those), no "undefined" or em dash on screen or in a WhatsApp message, and no script errors.
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, phone } from "./helpers.mjs";
let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const audit = (p, where) => p.evaluate((where) => {
  const out = [], vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`${where}: sideways scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
  for (const e of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea")) if (vis(e) && parseFloat(getComputedStyle(e).fontSize) < 16) out.push(`${where}: small field ${e.tagName}#${e.id}.${e.className}[${[...e.attributes].map(a=>a.name).filter(n=>n.startsWith("data-")).join(",")}] ${getComputedStyle(e).fontSize}`);
  for (const e of document.querySelectorAll("button, a, [role=button]")) if (vis(e)) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 && !e.closest(".hscroll, .chips, .recent, [style*=overflow], .ptabs, .seg, nav")) { let anc = e.parentElement, scrolls = false; while (anc) { const ox = getComputedStyle(anc).overflowX; if (ox === "auto" || ox === "scroll") { scrolls = true; break; } anc = anc.parentElement; } if (!scrolls) out.push(`${where}: button off screen "${e.textContent.trim().slice(0,30)}"`); } if (!e.textContent.trim() && !e.getAttribute("aria-label") && !e.title && !e.querySelector("img[alt]")) out.push(`${where}: unlabelled button ${e.outerHTML.slice(0,80)}`); }
  const t = document.body.innerText;
  for (const bad of ["undefined", "NaN", "[object", "null ", "—"]) if (t.includes(bad)) out.push(`${where}: text has "${bad}" near "${t.slice(Math.max(0,t.indexOf(bad)-40), t.indexOf(bad)+20).replace(/\s+/g," ")}"`);
  return out;
}, where);
async function crawl(p, who, width) {
  await p.setViewportSize({ width, height: 896 });
  const res = [];
  const feats = await p.evaluate(() => FEATURES.map((f) => f.go));
  for (const go of [...new Set(feats)]) { await p.evaluate((g) => openAt(g), go); await p.waitForTimeout(250); await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); res.push(...await audit(p, `${who}@${width} ${go}`)); }
  for (const m of ["bar", "floor"]) { await p.evaluate((m) => { show("tally"); setMode(m); }, m); const panes = await p.$$eval(".ptabs [data-pane]", (b) => b.map((x) => x.dataset.pane));
    for (const pn of panes) { await p.click(`.ptabs [data-pane="${pn}"]`); await p.waitForTimeout(250); await p.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); res.push(...await audit(p, `${who}@${width} tally/${m}/${pn}`)); } }
  // A drink card and every send message
  await p.evaluate(() => { show("drinks"); openSheet(D.find((d) => d.name === "Espresso Martini")?.id ?? D[0].id); }); await p.waitForTimeout(300);
  res.push(...await audit(p, `${who}@${width} drink sheet`));
  await p.evaluate(() => closeSheet());
  const keys = await p.evaluate(() => Object.keys(SHARE));
  for (const k of keys) { const r = await p.evaluate((k) => { try { const s = shareText(k); return s; } catch (e) { return "THREW " + e.message; } }, k);
    if (/THREW|undefined|NaN|\[object|—/.test(r)) res.push(`${who} share ${k}: ${r.slice(0, 160)}`); }
  res.push(...p.errs.map((e) => `${who} PAGEERR ${e}`));
  return res;
}
test("every page fits a phone and reads cleanly", async () => {
  await resetEmulators();
  const { O, A, M } = await team(browser, site, [["A", "Angel"], ["M", "Mounika"]]);
  const all = [];
  for (const [p, who] of [[O, "owner"], [A, "Angel"], [M, "Mounika"]]) for (const w of [414, 320]) all.push(...await crawl(p, who, w));
  // A phone not on the team
  const X = await phone(browser, site);
  all.push(...await crawl(X, "visitor", 414));
  assert.deepEqual([...new Set(all)], []);
});
