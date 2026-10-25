// The app with no team logins, as it runs today and for anyone not logged in: everything stays on the phone.
// live.js is blocked, so this is exactly the site built without a Firebase config.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open({ start = "#w-ok", at, width = 390, recent } = {}) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: "Europe/London" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  if (at) await p.clock.setFixedTime(new Date(at));
  if (recent) await p.addInitScript((r) => localStorage.setItem("btbar.recent", r), recent);
  await p.goto(site.url);
  await p.click(start);
  return p;
}

test("86s, ticks and the report stay on the phone without logins", async () => {
  const p = await open();
  assert.equal(await p.evaluate(() => LIVE.api), null);
  await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=stock]");
  await p.selectOption("#s-86", "Guinness");
  assert.deepEqual(await p.evaluate(() => [...out]), ["Guinness"]);
  await p.click("[data-tab=drinks]");
  await p.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  await p.click("#sh-86");
  assert.equal(await p.evaluate(() => isOut("Negroni")), true);
  assert.equal(await p.$eval("#toast", (t) => t.textContent), "Negroni marked 86'd");
  await p.evaluate(() => closeSheet());

  await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=open]");
  for (const i of [0, 1, 2, 3]) await p.click(`[data-list=open][data-i="${i}"]`);
  assert.deepEqual(await p.evaluate(() => ticks.open), [0, 1, 2, 3]);
  const tally = await p.$eval("#tally", (e) => e.innerText);
  assert.doesNotMatch(tally, /Ticked by|sending/, "no names on ticks without logins");
  await p.click(".ptabs [data-pane=stock]");
  assert.match(await p.$eval("#tally", (e) => e.innerText), /Need something\?[\s\S]*Switches on with team logins/i);
  await p.click(".ptabs [data-pane=close]");
  assert.match(await p.$eval("#tally", (e) => e.innerText), /Closing photos[\s\S]*Switches on with team logins/i);
  await p.click(".ptabs [data-pane=send]");
  assert.equal(await p.$eval("#t-copy", (e) => e.textContent), "Send for sign-off");
  assert.match(await p.$eval("#t-text", (e) => e.value), /86'd: Guinness, Negroni/);
  await p.click("#t-reset"); await p.click("#t-yes");
  assert.deepEqual(await p.evaluate(() => [ticks.open, [...out]]), [[], []]);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");

  await p.evaluate(() => show("notices"));
  assert.match(await p.$eval("#team", (e) => e.innerText), /Team logins/i);
  assert.deepEqual(p.errs, []);
});

test("recently opened drinks come back as shortcuts", async () => {
  const p = await open({ recent: "[3,7,12]" });
  assert.equal(await p.$$eval("#quick [data-open]", (x) => x.length), 3);
  assert.deepEqual(p.errs, []);
});

test("the floor's lists follow the UK business day, which ends at 6am", async () => {
  // 25 Oct 2026 is when the clocks go back; Sunday and Monday nights add the toilets to the closing list.
  for (const [label, at, toilets] of [["Saturday 23:30 BST", "2026-10-24T22:30:00Z", false], ["Sunday 22:30 GMT", "2026-10-25T22:30:00Z", true], ["Tuesday 1am, still Monday's shift", "2026-10-27T01:00:00Z", true], ["Tuesday 7am, a new day", "2026-10-27T07:00:00Z", false]]) {
    const p = await open({ start: "#w-floor", at });
    assert.equal(await p.$eval("#shift-title", (e) => e.textContent), "Floor shift", label);
    if (!at.endsWith("07:00:00Z")) assert.equal(await p.$eval(".ptabs [aria-selected=true]", (e) => e.dataset.pane), "fclose", `${label}: late in the day opens on the closing list`);
    await p.click(".ptabs [data-pane=fclose]");
    assert.equal((await p.$eval("#tally", (e) => e.innerText)).includes("Toilets"), toilets, label);
    assert.deepEqual(p.errs, [], label);
    await p.context().close();
  }
  const p = await open({ start: "#w-floor", at: "2026-10-24T22:30:00Z" });
  await p.click(".ptabs [data-pane=fshake]");
  assert.match(await p.$eval("#tally", (e) => e.innerText), /Desserts[\s\S]*Mon 26 Oct[\s\S]*Strawberry and raspberry[\s\S]*Sat 7 Nov[\s\S]*Maraschino cherries[\s\S]*Sat 21 Nov/);
  await p.click("[data-mode=bar]");
  assert.equal(await p.$eval("#shift-title", (e) => e.textContent), "Bar shift");
  assert.deepEqual(p.errs, []);
});
