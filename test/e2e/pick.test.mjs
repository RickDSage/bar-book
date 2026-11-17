// The one item picker (src/pick.js): typo search, kinds, recent and most 86'd, several at once, swaps, and the same
// picker in restocking, running low, Log it, date labels, the stock count and the bar station.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, pickRows, pickClose, pick86 } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

const rows = (p) => p.$$eval("#pk-list .pk-t b", (xs) => xs.map((x) => x.textContent));
const stock = async (p) => { await p.click("nav.tabs [data-tab=tally]"); await p.evaluate(() => setMode("bar")); await p.click(".ptabs [data-pane=stock]"); };

test("86 from the picker: typos, kinds, several at once, swaps, and recent on top", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await stock(S);
  // Typos and other names find the stock list's own item.
  assert.equal((await pickRows(S, "lymes"))[0], "Limes");
  for (const [q, n] of [["tanq", "Tanqueray"], ["jamesn", "Jameson"], ["triple sec", "Cointreau"], ["oat", "Oat milk"], ["chesecake", "Cheesecake"]]) {
    await S.fill("#pk-q", q); assert.equal((await rows(S))[0], n, q);
  }
  // A kind narrows it: Frozen is the ice creams, Cakes the cakes.
  await S.fill("#pk-q", ""); await S.click("[data-pk-cat=frozen]");
  assert.deepEqual(await rows(S), ["Ice cream", "Vegan ice cream", "Oreo ice cream sandwich", "Jammie Dodger ice cream sandwich"]);
  await S.click("[data-pk-cat=cakes]");
  assert.ok((await rows(S)).includes("Guinness cake"));
  // Several at once: tick, then one 86 for all of them.
  await S.click("[data-pk-cat=cakes]"); await S.fill("#pk-q", "lime");
  await S.click('#pk-list [data-pk-tog="Limes"]'); await S.click('#pk-list [data-pk-tog="Lime juice"]');
  assert.match(await S.$eval("#pk-foot", (e) => e.innerText), /86 these 2/);
  await S.click("[data-pk-go=out]");
  await O.waitForFunction(() => LIVE.out.has("Limes") && LIVE.out.has("Lime juice"));
  // The rows say it's out, how many drinks use it, and the swap; one tap brings it back.
  await S.waitForFunction(() => /86'd by Sam Staff/.test($('#pk-list [data-pk-tog="Lime juice"]').innerText));
  assert.match(await S.$eval('#pk-list [data-pk-tog="Lime juice"]', (e) => e.innerText), /drinks use it[\s\S]*Swap: /);
  await S.click('#pk-list [data-pk-one="Limes"]');
  await O.waitForFunction(() => !LIVE.out.has("Limes"));
  // Nothing typed: what's 86'd now and the recent ones come first.
  await S.fill("#pk-q", "");
  assert.match(await S.$eval("#pk-top", (e) => e.innerText), /86'D NOW \(1\)[\s\S]*Lime juice[\s\S]*RECENT AND MOST 86'D[\s\S]*Limes/i);
  await pickClose(S);
  // The 86 board on the Shift page shows the swap too.
  await S.waitForSelector('[data-out-back="Lime juice"]');
  assert.match(await S.$eval('[data-out-back="Lime juice"]', (e) => e.parentElement.innerText), /Swap: /);
  // A Guinness cake 86'd doesn't take the Guinness drinks with it.
  await pick86(S, "guinness cake", "Guinness cake");
  await S.waitForFunction(() => LIVE.out.has("Guinness cake"));
  assert.equal(await S.evaluate(() => plOutKeys().has("guinness")), false);
  for (const p of [O, S]) assert.deepEqual(p.errs, []);
});

test("the same picker picks for restocking, running low, Log it, date labels and the stock count", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await stock(S);
  // Restocking: pick one, or use what's typed.
  await pickRows(S, "kraken", "#rs-item"); await S.click('#pk-list [data-pk-tog="Kraken"]');
  assert.match(await S.$eval("#rs-item", (e) => e.innerText), /Kraken/);
  await pickRows(S, "Paper cups", "#rs-item"); await S.click("[data-pk-typed]");
  assert.match(await S.$eval("#rs-item", (e) => e.innerText), /Paper cups/);
  // Running low on the handover: several at once go on the line.
  await S.click(".ptabs [data-pane=send]");
  await pickRows(S, "mint", "[data-ho-pick]"); await S.click('#pk-list [data-pk-tog="Mint"]');
  await S.fill("#pk-q", "red bull"); await S.click('#pk-list [data-pk-tog="Red Bull"]');
  await S.click("[data-pk-go=add]");
  assert.equal(await S.inputValue("#ho-low"), "Mint, Red Bull");
  // Log it: running low picks from the list; 86 opens the 86 picker.
  await S.click(".logbar [data-log]"); await S.click('#logit [data-lg-kind="low"]');
  await pickRows(S, "lemons", "[data-lg-pklow]"); await S.click('#pk-list [data-pk-tog="Lemons"]'); await S.click("[data-pk-go=add]");
  assert.equal(await S.inputValue("#lg-text"), "Lemons");
  await S.click('#logit [data-lg-kind="out"]'); await S.click("[data-lg-pk86]");
  assert.equal(await S.isHidden("#logit"), true); assert.equal(await S.isVisible("#pick"), true);
  await S.fill("#pk-q", "prosecco"); await S.click('#pk-list [data-pk-one="Prosecco bottle"]'); await pickClose(S);
  await O.waitForFunction(() => LIVE.out.has("Prosecco bottle"));
  // Date labels (managers add them): pick it, and the typical days fill in.
  await stock(O); await O.click(".ptabs [data-pane=labels]"); await O.click("#lb-add summary");
  await pickRows(O, "oat", "[data-lb-pick]"); await O.click('#pk-list [data-pk-tog="Oat milk"]');
  assert.equal(await O.inputValue("#lb-item"), "Oat milk");
  assert.notEqual(await O.inputValue("#lb-life"), "");
  // The stock count: find an item and its line opens.
  await S.click(".ptabs [data-pane=stock]"); await S.click("[data-ct-open]");
  await S.waitForSelector("[data-ct-find]");
  await pickRows(S, "tanquery", "[data-ct-find]");
  await S.click('#pk-list [data-pk-tog="Tanqueray"]');
  await S.waitForSelector(".ct-row.on");
  assert.match(await S.$eval(".ct-row.on", (e) => e.innerText), /Tanqueray/);
  for (const p of [O, S]) assert.deepEqual(p.errs, []);
});
