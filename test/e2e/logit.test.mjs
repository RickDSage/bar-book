// Log it (one line for anything, into tonight's handover), the Guide's search and Add it, Home, the phone's back, and
// the iPad button on the start screen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, adminGet } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

const logIt = async (p, kind, text, { side, told } = {}) => {
  await p.click(".logbar [data-log]"); await p.waitForSelector("#logit:not([hidden])");
  await p.click(`#logit [data-lg-kind="${kind}"]`);
  if (told) await p.click(`#logit [data-lg-told="${told}"]`);
  if (side) await p.click(`#logit [data-lg-side="${side}"]`);
  await p.fill("#lg-text", text); await p.click("#logit [data-lg-go]:not([data-lg-go=send])");
  assert.equal(await p.isHidden("#logit"), true);
};

test("Log it: each kind goes where it belongs, with the name and time, into the handover, tonight's report and the morning", async () => {
  await resetEmulators();
  const { O, K, E } = await team(browser, site, [["K", "Kadir"], ["E", "Emily"]]);
  await K.click("nav.tabs [data-tab=tally]"); await K.evaluate(() => setMode("bar"));
  await logIt(K, "note", "Found a broken glass under the well");
  await logIt(K, "told", "Two kegs of Peroni left", { told: await K.evaluate(() => STAFF.mgr[0]) });
  await logIt(K, "low", "Limes");
  await logIt(K, "next", "Change the CO2 first thing");
  await logIt(K, "out", "Prosecco");
  await logIt(K, "fix", "Glass washer leaking");
  await logIt(K, "low", "Napkins", { side: "floor" });
  // Everyone sees it: the other bar phone, the 86 board (under the stock list's own name) and Issues.
  await E.waitForFunction(() => logsOf("bar").length === 4);
  await E.waitForFunction(() => LIVE.out.has("Prosecco bottle") && LIVE.issues.some((x) => x.title === "Glass washer leaking"));
  await E.waitForFunction(() => logsOf("floor").length === 1);
  // The handover: the points carry their logs, the rest is under Logged tonight, with names.
  const shift = await E.evaluate(() => SHARE.shift());
  const part = (id) => shift.parts.find((x) => x.id === id).lines.join(" | ");
  assert.match(part("low"), /^Limes \(Kadir \d\d:\d\d\)$/);
  assert.match(part("next"), /Change the CO2 first thing \(Kadir/);
  assert.match(part("logged"), /Found a broken glass under the well \(Kadir.*Told .*: Two kegs of Peroni left/);
  assert.doesNotMatch(part("low"), /Napkins/);
  // The report the morning reads keeps them, and the order picks up what ran low.
  const text = await E.evaluate(() => tallyText());
  assert.match(text, /Running low: Limes \(Kadir/); assert.match(text, /\n\nLogged tonight:\n- Found a broken glass/);
  const h = await E.evaluate((t) => handoverOf({ text: t, name: "Kadir" }), text);
  assert.equal(h.logged.length, 2); assert.match(h.low, /Limes/); assert.match(h.next, /CO2/); assert.doesNotMatch(h.next, /Logged/);
  // The handover pane lists them; the managers' report and glance have both sides.
  await E.click("nav.tabs [data-tab=tally]"); await E.evaluate(() => { pane = "send"; renderTally(); });
  assert.equal(await E.locator("#tally .lg-list li").count(), 4);
  const tonight = await O.evaluate(() => SHARE.tonight());
  assert.match(tonight.parts.find((x) => x.id === "order").lines.join(" | "), /Bar: Limes.*Floor: Napkins/);
  assert.match(tonight.parts.find((x) => x.id === "logged").lines.join(" | "), /Bar: Found a broken glass/);
  // Log it and send opens the Send page with it.
  await K.click(".logbar [data-log]"); await K.click('#logit [data-lg-kind="note"]'); await K.fill("#lg-text", "Fire exit was blocked, moved the boxes");
  await K.click("#logit [data-lg-go=send]"); await K.waitForSelector("#sheet:not([hidden]) #send");
  assert.match(await K.textContent("#sheet"), /Fire exit was blocked/);
  // Only the writer or a manager takes one off; nobody else can, even from the console.
  const mine = await K.evaluate(() => logsOf("bar").find((e) => /broken glass/.test(e.label)).id);
  await assert.rejects(E.evaluate((id) => LIVE.api.dropLog(id), mine));
  await K.evaluate((id) => LIVE.api.dropLog(id), mine);
  await O.waitForFunction(() => !logsOf("bar").some((e) => /broken glass/.test(e.label)));
  await O.evaluate(() => LIVE.api.dropLog(logsOf("bar")[0].id));
  // Only the five kinds, the right shape and a real side.
  await assert.rejects(E.evaluate(() => LIVE.api.logIt("bar", "gossip", "x")));
  await assert.rejects(E.evaluate(() => LIVE.api.logIt("kitchen", "note", "x")));
  for (const p of [O, K, E]) assert.deepEqual(p.errs, []);
});

test("the Guide answers how do I make, what's and where, says when it isn't in Bar Book, and Add it goes to maintenance", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam"]]);
  await S.click(".brandr [data-guide]"); await S.waitForSelector("#gd-q");
  await S.fill("#gd-q", "how do i make a mojto"); await S.waitForTimeout(250);
  assert.match(await S.textContent("#gd-out .gd-row"), /Mojito/);
  await S.click("#gd-out [data-gd-drink]"); await S.waitForSelector("#sheet:not([hidden]) [data-view=steps][aria-pressed=true]");
  await S.click("#sh-close"); await S.waitForSelector("#sheet", { state: "hidden" });
  await S.click(".brandr [data-guide]"); await S.fill("#gd-q", "whats a dry shake"); await S.waitForTimeout(250);
  assert.match(await S.textContent("#gd-out .gd-term"), /Dry shake/);
  await S.fill("#gd-q", "where is the handovr"); await S.waitForTimeout(250);
  await S.click('#gd-out [data-gd-go="send"]'); assert.equal(await S.evaluate(() => [cur, pane].join()), "tally,send");
  // Not in Bar Book: says so, and Add it sends it to maintenance (no signal for Wikipedia here is fine).
  await S.click(".brandr [data-guide]"); await S.fill("#gd-q", "how do i make a zzqx flurble"); await S.waitForTimeout(250);
  assert.match(await S.textContent("#gd-out"), /isn't in Bar Book yet/);
  await S.click("#gd-out [data-gd-add]"); await S.waitForSelector("#gd-out .gd-miss:not(:has([data-gd-add]))");
  await O.waitForFunction(() => LIVE.tells.some((x) => x.kind === "missing" && /zzqx flurble/.test(x.text)));
  // The same search from Practise opens the Guide.
  await S.click("#help .hq-x"); await S.evaluate(() => show("practice")); await S.fill("#gd-q-p", "neg");
  await S.waitForSelector("#help:not([hidden]) #gd-q"); assert.equal(await S.inputValue("#gd-q"), "neg");
  assert.deepEqual(S.errs, []);
});

test("Home and the phone's back go where you'd expect, and the start screen's iPad button opens the bar station", async () => {
  const c = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  await c.addInitScript(() => { localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99, "bar:": 99 })); });
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ipad");
  await p.waitForSelector("#v-station:not([hidden]) .sx-top [data-log]");
  await p.evaluate(() => show("tally")); await p.click("#sx-back"); assert.equal(await p.evaluate(() => cur), "station");
  await p.click("#v-station [data-sx-exit]").catch(() => {});
  await p.evaluate(() => { stationOn = false; store.set("station", false); show("drinks"); show("notices"); show("info"); });
  await p.goBack(); await p.waitForFunction(() => cur === "notices");
  await p.click(".brandr [data-home]"); assert.equal(await p.evaluate(() => cur), "drinks");
  // An open drink: back shuts it and stays on the page.
  await p.click("#list .row"); await p.waitForSelector("#sheet:not([hidden])");
  await p.goBack(); await p.waitForSelector("#sheet", { state: "hidden" }); assert.equal(await p.evaluate(() => cur), "drinks");
  assert.deepEqual(errs, []);
  await c.close();
});
