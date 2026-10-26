// Football on the screens: managers add tonight's games, everyone on shift sees them at the top of the Shift tab.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt, ukDay } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("a manager adds tonight's game and one next week; staff see them live and can't add their own", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]]);
  await S.click("[data-tab=tally]");
  assert.equal(await S.$eval("#football", (e) => e.innerText), "", "nothing shows for staff until there's a game");
  await M.click("[data-tab=tally]");
  await M.click("#fx-add summary");
  await M.fill("[data-fx=ko]", "20:00"); await M.fill("[data-fx=home]", "Arsenal"); await M.fill("[data-fx=away]", "PSG");
  await M.fill("[data-fx=comp]", "Champions League"); await M.fill("[data-fx=channel]", "TNT Sports 1"); await M.fill("[data-fx=screen]", "All screens");
  await M.click("#fx-go");
  await S.waitForFunction(() => document.querySelector("#football").innerText.includes("Arsenal v PSG"));
  assert.match(await S.$eval("#football", (e) => e.innerText), /Football tonight[\s\S]*20:00 Arsenal v PSG[\s\S]*Champions League · TNT Sports 1 · Screen: All screens/);
  assert.equal(await S.locator("[data-fx-drop]").count(), 0, "staff can't take games down");
  assert.equal(await S.locator("#fx-add").count(), 0, "or add them");

  const next = ukDay(Date.now() + 7 * 864e5);
  await M.fill("[data-fx=day]", next); await M.fill("[data-fx=ko]", "17:30"); await M.fill("[data-fx=home]", "Liverpool"); await M.fill("[data-fx=away]", "Chelsea");
  await M.click("#fx-go");
  await S.waitForFunction(() => /Coming up \(1\)/.test(document.querySelector("#football").innerText));
  assert.equal(await attempt(S, () => LIVE.api.addFixture({ day: "2026-12-01", ko: "20:00", home: "A", away: "B", comp: "", channel: "", screen: "" })), "permission-denied");

  await M.click("#football .fx:has-text('Arsenal') [data-fx-drop]");
  await S.waitForFunction(() => !document.querySelector("#football").innerText.includes("Arsenal"));
  assert.match(await S.$eval("#football", (e) => e.innerText), /No games on our screens today/);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
