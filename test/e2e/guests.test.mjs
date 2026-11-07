// Guest recovery end to end: staff log one, the limit on what they can give, needing a manager, closing it, the
// owner's limits, and what keeps happening.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p) => p.$eval("#guests", (e) => e.textContent);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("staff log a guest issue within their limit, flag it for a manager, and a manager closes it", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await part(S, "guests");
  assert.match(await text(S), /Ask a manager before giving anything away\./);
  await S.click("#g-form summary");
  await S.click("#g-go");
  await waitToast(S, /^Pick what kind of issue it is$/);
  await S.click('[data-g-kind="cold"]');
  await S.fill('[data-g="table"]', "12");
  await S.fill('[data-g="what"]', "Fries came out cold");
  await S.fill('[data-g="comp"]', "3.50");
  await S.click("#g-go");
  await waitToast(S, /^Ask a manager before giving anything$/);

  // The owner sets the limits: staff £5, managers £20.
  await part(O, "guests");
  // Older guest issues load when the page opens; the box stays open when they arrive.
  await O.click("text=What people can give without asking");
  await O.waitForFunction(() => LIVE.loaded.has("guests-hist"));
  assert.equal(await O.$eval("#g-lim", (e) => e.open), true);
  await O.fill("#g-lim-staff", "5"); await O.fill("#g-lim-mgr", "20");
  await O.click("#g-lim-go");
  await waitToast(O, /^Limits saved$/);
  await S.waitForFunction(() => LIVE.comp?.staff === 500);
  await S.waitForFunction(() => /You can give up to £5\.00 without asking a manager\./.test($("#guests").textContent));

  await S.fill('[data-g="comp"]', "6");
  await S.click("#g-go");
  await waitToast(S, /^That's over your limit of £5\.00\. Ask a manager$/);
  await S.fill('[data-g="comp"]', "3.50");
  await S.fill('[data-g="wants"]', "Fresh fries");
  await S.check('[data-g="escalate"]');
  await S.click("#g-go");
  await waitToast(S, /^Logged, and the managers can see it needs them$/);
  await S.waitForFunction(() => LIVE.guests[0] && !LIVE.guests[0].pending);
  const g = await S.evaluate(() => LIVE.guests[0]);
  assert.deepEqual([g.kind, g.table, g.comp, g.escalate, g.status], ["cold", "12", 350, true, "open"]);

  // Managers: on For you, hot, until it's closed.
  await part(M, "");
  await M.waitForFunction(() => [...document.querySelectorAll("#foryou .fy.hot")].some((b) => /Guest needs a manager: Cold food, table 12/.test(b.textContent)));
  await part(M, "guests");
  assert.match(await text(M), /Needs a manager.*Given £3\.50.*Fries came out cold.*Guest wanted: Fresh fries/s);
  const id = g.id;
  await M.click(`[data-g-close="${id}"]`);
  await waitToast(M, /^Say what was done in the end$/);
  await M.fill(`[data-gc="${id}:res"]`, "Remade and a dessert on us");
  await M.fill(`[data-gc="${id}:extra"]`, "25");
  await M.click(`[data-g-close="${id}"]`);
  await waitToast(M, /^That's over your limit of £20\.00\. Ask the owner$/);
  await M.fill(`[data-gc="${id}:extra"]`, "6.95");
  await M.check(`[data-gc="${id}:fu"]`);
  await M.click(`[data-g-close="${id}"]`);
  await waitToast(M, /^Closed$/);
  await S.waitForFunction(() => LIVE.guests[0]?.status === "closed" && LIVE.guests[0].extra === 695 && LIVE.guests[0].followUp === true);
  await part(M, "guests");
  assert.match(await text(M), /Last 7 days: 1 guest issue, £10\.45 given\./);
  assert.deepEqual([...O.errs, ...M.errs, ...S.errs], []);
});

test("managers see what keeps happening", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await S.evaluate(() => Promise.all(["Wrong burger", "Wrong side", "Wrong drink"].map((what) => LIVE.api.logGuest({ kind: "wrong", table: "", what, wants: "", done: "", comp: 0, escalate: false }))));
  await part(M, "guests");
  await M.waitForFunction(() => /Keeps happening.*Wrong order: 3 times in the last 7 days/s.test($("#guests").textContent));
  await part(S, "guests");
  assert.doesNotMatch(await text(S), /Keeps happening/);
});
