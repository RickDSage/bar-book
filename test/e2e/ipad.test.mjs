// The restaurant iPad: a centred column at tablet width, and in Shared mode it asks who's using it, hides My pay and
// never stays unlocked. Logged out, so it needs no emulator data: live.js is blocked, as in local.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open(shared) {
  const c = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, timezoneId: "Europe/London" });
  await c.addInitScript((sh) => { localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.me", JSON.stringify("Angel")); if (sh) localStorage.setItem("btbar.shared", "true"); }, shared);
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url);
  return p;
}

test("on an iPad the app is one centred column, not a stretched phone", async () => {
  const p = await open(false);
  assert.match(await p.textContent("#w-name"), /Hi Angel/);
  await p.click("#w-ok");
  const w = await p.$eval("main", (m) => m.getBoundingClientRect().width);
  assert.ok(w <= 760, `main is ${w}px wide`);
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => !b.hidden));
  assert.deepEqual(p.errs, []);
});

test("a shared iPad asks who's using it, hides My pay and locks a senior's code after 5 idle minutes", async () => {
  const p = await open(true);
  assert.match(await p.textContent("#w-name"), /Shared iPad: who's using it\?/);
  await p.click("#w-ok");
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => b.hidden));
  await p.evaluate(() => show("pay"));
  assert.ok(await p.$eval("#v-pay", (v) => v.hidden));
  // A senior unlocked it and walked off: the next tap after 5 minutes puts it back to the team's view.
  const locked = await p.evaluate(() => {
    let n = 0;
    Object.assign(LIVE, { ready: true, role: "manager", api: { ...LIVE.api, lock: async () => { n++; } } });
    sharedLock(); const early = n;
    lastTap = Date.now() - 6 * 6e4; sharedLock();
    return [early, n];
  });
  assert.deepEqual(locked, [0, 1]);
  // Back to someone's own phone: My pay is there again.
  await p.evaluate(() => show("info"));
  await p.click('[data-shared-pick="off"]');
  assert.ok(await p.$eval('nav.tabs [data-tab="pay"]', (b) => !b.hidden));
  assert.deepEqual(p.errs, []);
});
