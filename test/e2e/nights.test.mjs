// Sales and covers: managers put in each night's figures from the till's report, and the forecast for the next nights
// comes from the same weekdays before. Staff never see them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p) => p.$eval("#nights", (e) => e.innerText.replace(/\s+/g, " "));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("managers put in each night's covers and sales, and get a forecast from the same weekdays; staff can't", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(S, "");
  assert.equal(await S.$('#hub [data-tpane="nights"]'), null);
  assert.equal(await attempt(S, () => LIVE.api.saveNight(shiftDay(), { covers: 1, wet: 1, dry: 1, note: "" })), "permission-denied");

  await part(M, "nights");
  await M.waitForSelector("#nt-go");
  assert.match(await text(M), /The forecast needs at least two of the same weekday/);
  // The same weekday for the last three weeks: 200, 180 and 160 covers.
  await M.evaluate(async () => {
    const d = shiftDay();
    await LIVE.api.saveNight(addDays(d, -7), { covers: 200, wet: 400000, dry: 200000, note: "" });
    await LIVE.api.saveNight(addDays(d, -14), { covers: 180, wet: 360000, dry: 180000, note: "England game" });
    await LIVE.api.saveNight(addDays(d, -21), { covers: 160, wet: 320000, dry: 160000, note: "" });
  });
  // Weighted 3, 2, 1, newest first: 187 covers and £5,600.
  await M.waitForFunction(() => /about 187 covers, £5,600\.00/.test($("#nights").innerText));
  assert.match(await text(M), /From the last 3 same nights/);
  assert.match(await text(M), /Nights so far \(3\).*200 covers · £6,000\.00.*£30\.00 a head.*England game/i);

  // Tonight's figures from the form.
  await M.click("#nt-go");
  await waitToast(M, /^Covers should be a whole number$/);
  await M.fill('[data-nt="covers"]', "210");
  await M.fill('[data-nt="wet"]', "4,200");
  await M.click("#nt-go");
  await waitToast(M, /^Sales should be in pounds, like 4250\.50$/);
  await M.fill('[data-nt="wet"]', "4200");
  await M.fill('[data-nt="dry"]', "2150.50");
  await M.click("#nt-go");
  await waitToast(M, /^Saved$/);
  await M.waitForFunction(() => /Nights so far \(4\)/i.test($("#nights").innerText));
  assert.match(await text(M), /210 covers · £6,350\.50.*Forecast 187 covers, £5,600\.00: sales \+13%/);
  // Change it: the form fills from what was saved.
  const day = await M.evaluate(() => shiftDay());
  await M.click(`[data-nt-edit="${day}"]`);
  assert.equal(await M.$eval('[data-nt="dry"]', (e) => e.value), "2150.50");
  // The briefing shows the managers tonight's forecast.
  await part(M, "brief");
  assert.match(await M.$eval("#br-fc", (e) => e.textContent), /^Forecast tonight: about 187 covers and £5,600\.00 net sales, from the last 3 same nights/);
  await part(S, "brief");
  assert.equal(await S.$("#br-fc"), null);
  assert.deepEqual([...M.errs, ...S.errs], []);
});
