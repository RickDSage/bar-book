// Running low (count.js lowNow): a manager sets a level on a product; a count under it flags it on the count, the 86
// board, the bar station, Needs you now, the handover and the morning's order, before it's an 86. 86 it moves it to
// the 86 board, so it's never listed twice. Par and the running-low level are set together.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const openCount = async (p) => { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=stock]"); await p.click("[data-ct-open]"); await p.waitForSelector("#ct .ct-row"); };
const lows = (p) => p.evaluate(() => lowNow().map((x) => `${x.item} ${x.n} ${x.low}`));

test("running low: a level, a count under it, flagged everywhere until it's 86'd", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  // The manager sets it on the line while counting.
  await openCount(M);
  await M.fill("#ct-say", "smirnoff"); await M.press("#ct-say", "Enter");
  await M.waitForSelector('.ct-lowset [data-ct-f="low"]');
  await M.fill('.ct-lowset [data-ct-f="low"]', "3"); await M.press('.ct-lowset [data-ct-f="low"]', "Tab");
  await M.waitForFunction(() => LIVE.countSetup?.items?.Smirnoff?.low === 3);
  // Staff don't get the level box.
  await openCount(S);
  await S.fill("#ct-say", "smirnoff"); await S.press("#ct-say", "Enter");
  await S.waitForSelector(".ct-row.on");
  assert.equal(await S.$(".ct-lowset"), null);

  // Nothing counted, nothing low. Then a count under the level.
  assert.deepEqual(await lows(S), []);
  await S.fill("#ct-say", "smirnoff 2.4"); await S.press("#ct-say", "Enter"); await S.click("#ct-heard-ok");
  await S.waitForFunction(() => lowNow().length === 1);
  await M.waitForFunction(() => lowNow().length === 1);
  assert.deepEqual(await lows(M), ["Smirnoff 2.4 3"]);
  await S.click('[data-ct-show="done"]');
  assert.match(await text(S, '[data-ct-row="Speed rail|Smirnoff"].ct-line'), /2\.4 bottles Running low/);
  await S.click("#ct-tot-box summary");
  assert.match(await text(S, ".ct-tot"), /Smirnoff Running low: below 3 bottles 2\.4 bottles/);
  assert.deepEqual(await S.evaluate(() => SHARE.count().parts.find((x) => x.id === "low").lines), ["Smirnoff: 2.4 bottles (low below 3 bottles)"]);
  await S.click("#sh-close");

  // The 86 board: a heads-up under it, with a badge on the tab, and Needs you now.
  await S.waitForSelector(".low-row");
  assert.match(await text(S, ".low-row"), /^Smirnoff 2\.4 bottles left, low below 3 bottles · counted .* 86 it$/);
  assert.match(await text(S, '.ptabs [data-pane="stock"]'), /1 low/);
  await M.evaluate(() => renderAlerts(true));
  assert.match(await text(M, "#alerts"), /Running low: Smirnoff\. 86 it when it runs out/);
  // The handover's Running low chips start with it, and the morning's order has it.
  assert.equal(await S.evaluate(() => hoChips("low")[0]), "Smirnoff");
  assert.ok(await S.evaluate(() => orderLines(null).includes("Smirnoff")));
  // A delivery logged after the count lifts it over the level. (Logged for tomorrow: deliveries count from the day after.)
  await S.evaluate(() => LIVE.api.addReceived({ day: addDays(shiftDay(), 1), item: "Smirnoff", unit: "bottle", qty: 100 }));
  await S.waitForFunction(() => lowNow().length === 0);
  await S.evaluate(() => LIVE.api.dropReceived(LIVE.received[0].id));
  await S.waitForFunction(() => lowNow().length === 1);

  // The bar station's Tonight tile has it under the 86s, with 86 it there too.
  await S.evaluate(() => show("station")); await S.waitForSelector(".sx-lowl", { state: "attached" });
  assert.match(flat(await S.$eval(".sx-lowl", (e) => e.textContent)), /Smirnoff2\.4 bottles left, low below 3 bottles86 it/);
  assert.match(await text(S, "#sx-tsum"), /1 low/);
  await S.evaluate(() => { pane = "stock"; show("tally"); }); await S.waitForSelector(".low-row");
  // 86 it: on the 86 board instead, and off the running-low list.
  await S.click('.low-row [data-out-quick="Smirnoff"]');
  await M.waitForFunction(() => LIVE.out.has("Smirnoff") && lowNow().length === 0);
  await S.waitForFunction(() => !document.querySelector(".low-row"));

  // Par and running low are set together on the order draft, and the setup shows them.
  await M.evaluate(() => sdOrderPar("Tanqueray", "6", "2"));
  await M.waitForFunction(() => LIVE.countSetup.items.Tanqueray?.par === 6 && LIVE.countSetup.items.Tanqueray?.low === 2 && LIVE.countSetup.items.Smirnoff.low === 3);
  await M.evaluate(() => sdOrderPar("Tanqueray", "", ""));
  await M.waitForFunction(() => LIVE.countSetup.items.Tanqueray && !("par" in LIVE.countSetup.items.Tanqueray) && !("low" in LIVE.countSetup.items.Tanqueray));
  assert.deepEqual([...M.errs, ...S.errs], []);
});
