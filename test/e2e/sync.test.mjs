// Signal coming and going (5G, Wi-Fi, a cellar with none): a change made with no signal stays on the phone even when
// the app is closed, reaches everyone once there's signal, shows as waiting meanwhile, and two tabs share one copy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("an 86 made with no signal survives closing the app, is sent when the signal is back, and a second tab works too", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  const ctx = S.context();
  // A second tab of the app on the same device (a laptop) shares the offline copy instead of failing.
  const T = await ctx.newPage(); const terrs = []; T.on("pageerror", (e) => terrs.push(e.message));
  await T.goto(site.url); await T.click("#w-ok").catch(() => {});
  await T.waitForFunction(() => LIVE.me === "Sam Staff", null, { timeout: 20000 });
  await T.close();

  await ctx.setOffline(true);
  await S.waitForFunction(() => !navigator.onLine);
  await S.evaluate(() => { LIVE.api.set86("Limes", true); });
  await S.waitForFunction(() => LIVE.out.has("Limes"));
  await S.waitForFunction(() => !document.querySelector("#net").hidden && /No signal/.test(document.querySelector("#net").textContent));
  // The app is closed with the change still waiting.
  await S.close();
  assert.equal(await O.evaluate(() => LIVE.out.has("Limes")), false, "nothing reached the server yet");

  await ctx.setOffline(false);
  const S2 = await ctx.newPage(); const errs = []; S2.on("pageerror", (e) => errs.push(e.message));
  await S2.goto(site.url); await S2.click("#w-ok").catch(() => {});
  await S2.waitForFunction(() => LIVE.me === "Sam Staff", null, { timeout: 20000 });
  await O.waitForFunction(() => LIVE.out.has("Limes"), null, { timeout: 20000 });
  await S2.waitForFunction(() => document.querySelector("#net").hidden);
  assert.deepEqual([O.errs, errs, terrs], [[], [], []]);
});

test("coming back online says everything's sent", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff"]]);
  await S.context().setOffline(true);
  await S.waitForFunction(() => !navigator.onLine);
  await S.evaluate(() => { LIVE.api.set86("Mint", true); });
  await S.context().setOffline(false);
  await S.waitForFunction(() => /Everything's sent/.test(document.querySelector("#toast").textContent), null, { timeout: 20000 });
  await O.waitForFunction(() => LIVE.out.has("Mint"));
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
