// Someone leaves early: a teammate takes over their part of the close, and the record keeps who started it and who
// finished it, on the list and in the report.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("Take over: the part keeps who started it, and the report says who finished it", async () => {
  await resetEmulators();
  const { S, T } = await team(browser, site, [["S", "Sam Staff"], ["T", "Tia Staff"]]);
  for (const p of [S, T]) { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=close]"); }
  const [g, ids] = await S.evaluate(() => { const [g, xs] = groupsOf("close").find(([g]) => g); return [g, xs.map(([i]) => i)]; });
  await S.click(`[data-claim="close"][data-g="${g}"]`);
  await T.waitForFunction((ids) => ids.every((i) => LIVE.tasks[`close-${i}`]?.status === "doing"), ids);
  // Sam leaves. Tia sees Take over, and ticks the rest herself.
  await T.waitForSelector(`[data-claim="close"][data-g="${g}"]`);
  assert.equal(await T.textContent(`[data-claim="close"][data-g="${g}"]`), "Take over");
  await T.evaluate(([ids]) => Promise.all(ids.map((i) => LIVE.api.setTask("close", i, itemText("close", i), "done"))), [ids]);
  await S.waitForFunction((ids) => ids.every((i) => LIVE.tasks[`close-${i}`]?.status === "done" && !LIVE.tasks[`close-${i}`].pending), ids);
  assert.deepEqual(await S.evaluate((ids) => secWho("close", ids), ids), { first: "Sam Staff", last: "Tia Staff" });
  assert.match(await S.evaluate(() => tallyText()), new RegExp(`- ${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: started by Sam Staff, finished by Tia Staff`));
  assert.deepEqual([S.errs, T.errs], [[], []]);
});
