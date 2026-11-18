// Football on the screens: managers add tonight's games, everyone on shift sees them at the top of the Shift tab.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt, ukDay } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("a manager types tonight's game in one line; staff see it live; nothing set shows the Google link on Morning only", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]]);
  await S.evaluate(() => { pane = "closing"; show("tally"); });
  assert.equal(await S.$eval("#football", (e) => e.innerText), "", "nothing on top of every Shift page when no game is set");
  await S.evaluate(() => { pane = "morning"; show("tally"); });
  assert.match(await S.$eval("#football", (e) => e.innerText), /No game on our screens tonight · ⚽ Football on TV today/);
  assert.match(await S.$eval("#football a", (e) => e.href), /^https:\/\/www\.google\.com\/search\?q=football\+on\+TV\+today/);
  assert.equal(await S.locator("#fx-line").count(), 0, "staff can't add one");
  assert.deepEqual(await S.evaluate(() => [fxParse("Arsenal v Spurs 8pm, both screens"), fxParse("Liverpool vs Chelsea 17:30"), fxParse("Arsenal Spurs")]),
    [{ home: "Arsenal", away: "Spurs", ko: "20:00", screen: "both screens" }, { home: "Liverpool", away: "Chelsea", ko: "17:30", screen: "" }, null]);

  await M.evaluate(() => { pane = "morning"; show("tally"); });
  await M.fill("#fx-line", "Arsenal v PSG"); await M.click("#fx-go");
  await M.waitForFunction(() => /Like this: Arsenal v Spurs 8pm/.test(document.querySelector("#toast").textContent));
  await M.fill("#fx-line", "Arsenal v PSG 8pm, all screens"); await M.press("#fx-line", "Enter");
  await S.waitForFunction(() => document.querySelector("#football").innerText.includes("Arsenal v PSG"));
  assert.match(await S.$eval("#football", (e) => e.innerText), /Football tonight[\s\S]*20:00 Arsenal v PSG[\s\S]*all screens/);
  assert.equal(await S.locator("[data-fx-drop]").count(), 0, "staff can't take games down");
  assert.equal(await attempt(S, () => LIVE.api.addFixture({ day: "2026-12-01", ko: "20:00", home: "A", away: "B", comp: "", channel: "", screen: "" })), "permission-denied");

  await M.click("#football .fx:has-text('Arsenal') [data-fx-drop]");
  await S.waitForFunction(() => /No game on our screens tonight/.test(document.querySelector("#football").innerText));
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
