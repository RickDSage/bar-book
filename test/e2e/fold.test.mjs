// Finding your way: Closing's headings fold, and the 🔍 at the top finds any screen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch, team, resetEmulators } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
test("Closing: a heading folds with a tap and stays folded on this phone; 🔍 at the top finds a screen", async () => {
  await resetEmulators();
  const { S: p } = await team(browser, site, [["S", "Sam Staff"]]);
  await p.evaluate(() => { setMode("bar"); pane = closeList(); show("tally"); });
  await p.waitForSelector(".lfbtn");
  const g = await p.$eval(".lfbtn", (b) => b.dataset.lf);
  const rows = () => p.locator("#tally .task").count();
  const all = await rows();
  await p.click(".lfbtn >> nth=0");
  assert.ok((await rows()) < all);
  assert.equal(await p.$eval(".lfbtn >> nth=0", (b) => b.getAttribute("aria-expanded")), "false");
  assert.equal(await p.evaluate((g) => JSON.parse(localStorage.getItem("btbar.lfShut"))[g], g), true);
  await p.click("[data-lf-all]"); assert.equal(await rows(), all);
  await p.click("[data-lf-all]"); assert.equal(await rows(), 0);
  await p.click("[data-lf-all]");
  // The top bar's 🔍 opens the Guide, where typing a screen goes there.
  await p.click(".brandbar [data-guide]");
  await p.fill("#gd-q", "labels"); await p.waitForTimeout(300);
  assert.match(await p.textContent("#gd-out"), /label/i);
  assert.deepEqual(p.errs, []);
});
