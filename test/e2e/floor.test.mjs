// The floor side: splitting the close by heading, and what the floor sees that the bar doesn't need.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

const toFloor = async (p) => { await p.click("[data-tab=tally]"); await p.click("[data-mode=floor]"); await p.click(".ptabs [data-pane=fclose]"); };
const groupIds = (p, g) => p.evaluate((g) => shown("fclose").filter(([i]) => groupOf("fclose", i) === g).map(([i]) => i), g);

test("floor close: I'll do this takes a heading in your name, the others see it, and the rest stays free", async () => {
  await resetEmulators();
  const { A, B } = await team(browser, site, [["A", "Mounika"], ["B", "Anub"]]);
  for (const p of [A, B]) await toFloor(p);
  const shake = await groupIds(A, "Milkshake bar");
  await A.click('[data-claim=fclose][data-g="Milkshake bar"]');
  await B.waitForFunction((ids) => ids.every((i) => LIVE.tasks[`fclose-${i}`]?.status === "doing" && !LIVE.tasks[`fclose-${i}`].pending), shake);
  // Anub sees it's taken: Mounika's name on the heading, and Take over there instead of I'll do this. Other headings are still free.
  await B.waitForSelector(".lon");
  assert.match(await B.locator(".lon").first().innerText(), /Mounika on it/);
  assert.equal(await B.locator('[data-claim=fclose][data-g="Milkshake bar"]').innerText(), "Take over");
  assert.equal(await B.locator('[data-claim=fclose][data-g="Terrace"]').count(), 1);
  // Only that heading started; the run started too, so the clock shows.
  assert.equal(await B.evaluate(() => Object.values(LIVE.tasks).filter((x) => x.status === "doing").length), shake.length);
  await B.waitForFunction(() => runOf("fclose"));
  // Tick all on the heading finishes it as usual.
  await A.click('[data-tick-all=fclose][data-g="Milkshake bar"]');
  await B.waitForFunction((ids) => ids.every((i) => LIVE.tasks[`fclose-${i}`]?.status === "done"), shake);
  assert.deepEqual([A.errs, B.errs], [[], []]);
});

test("floor: new close items, floor quick 86s, and More leaves out the bar station", async () => {
  await resetEmulators();
  const { A } = await team(browser, site, [["A", "Pema"]]);
  await toFloor(A);
  const close = await A.locator("#tally").innerText();
  assert.match(close, /Card machines on charge/);
  assert.match(close, /Lost property bagged, dated and given to the duty manager/);
  await A.click(".ptabs [data-pane=stock]");
  assert.equal(await A.locator('[data-out-quick="Whipped cream"]').count(), 1);
  await A.click("[data-tab=info]");
  assert.equal(await A.locator('#v-info [data-go="station"]').count(), 0);
  await A.click("[data-tab=tally]"); await A.click("[data-mode=bar]");
  await A.click("[data-tab=info]");
  assert.equal(await A.locator('#v-info [data-go="station"]').count(), 1);
  assert.deepEqual(A.errs, []);
});
