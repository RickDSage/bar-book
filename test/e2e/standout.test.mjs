// Standout features on real phones against the emulators: last orders on every phone, the seasonal menu switch, the
// closing timer and its best time, Shift replay, the order draft from the stock count, voice commands with a confirm
// step, and the offline badge.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, handOver } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("standout: last orders, seasonal menu, closing timer, replay, order draft, voice, offline", async () => {
  await resetEmulators();
  const { O, K } = await team(browser, site, [["K", "Kadir"]]);

  // Last orders: a manager sets it; 10 minutes away, every phone shows it and the brief says it.
  const soon = await O.evaluate(() => { const t = new Date(Date.now() + 10 * 6e4).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: UK }); return t; });
  await O.evaluate((lo) => LIVE.api.saveVenue({ lastOrders: lo, dayAt: "07:00", nightAt: "19:00" }), soon);
  await K.waitForFunction((lo) => LIVE.venue?.lastOrders === lo, soon);
  await K.evaluate(() => sdTick());
  assert.match(await K.textContent("#sd-last"), new RegExp(`Last orders at ${soon}`));
  assert.equal(await K.isVisible("#sd-last"), true);
  assert.equal((await K.evaluate(() => briefParts()))[0].label, "Last orders");

  // Seasonal menu: Mojito off and Negroni first; staff lose Mojito from the menu list but search still finds it.
  const ids = await O.evaluate(() => [D.find((d) => d.name === "Mojito").id, D.find((d) => d.name === "Negroni").id]);
  await O.evaluate(() => LIVE.api.saveSeason("xmas", [{ id: "xmas", name: "Christmas", off: ["Mojito"], star: ["Negroni"] }]));
  await K.waitForFunction(() => LIVE.season?.on === "xmas");
  await K.click("nav.tabs [data-tab=drinks]"); await K.evaluate(() => renderList());
  assert.match(await K.textContent("#list"), /Christmas menu is on/);
  assert.equal(await K.locator(`#list .row[data-id="${ids[0]}"]`).count(), 0);
  await K.fill("#q", "mojito"); await K.evaluate(() => renderList());
  assert.ok(await K.locator(`#list .row[data-id="${ids[0]}"]`).count() >= 1);
  await K.fill("#q", ""); await O.evaluate(() => LIVE.api.saveSeason("", LIVE.season.sets));
  await K.waitForFunction(() => LIVE.season?.on === "");
  await K.evaluate(() => renderList());
  assert.ok(await K.locator(`#list .row[data-id="${ids[0]}"]`).count() >= 1);

  // Closing timer: ticks start it, the handover saves the time once, and it shows as the best.
  await K.click("nav.tabs [data-tab=tally]"); await K.evaluate(() => setMode("bar")); await K.click(".ptabs [data-pane=close]");
  await K.click('[data-list=close][data-i="0"]');
  await K.waitForFunction(() => sdCloseStart("bar") > 0);
  await K.evaluate(() => sdTick());
  assert.match(await K.textContent("#sd-timer"), /Bar close/);
  await K.click(".ptabs [data-pane=send]"); await K.click('[data-closer="Kadir"]').catch(() => {});
  await handOver(K);
  await O.waitForFunction(() => LIVE.closes.some((x) => x.side === "bar"));
  assert.ok(await O.evaluate(() => sdBest("bar")) >= 1);
  await K.evaluate(() => sdTick());
  assert.equal(await K.isHidden("#sd-timer"), true);

  // Shift replay: the manager sees tonight's tick and the handover in order.
  await part(O, "replay");
  await O.waitForSelector("#tc-replay .sd-tl li");
  const tl = await O.textContent("#tc-replay .sd-tl");
  assert.match(tl, /Handover sent/); assert.match(tl, /Kadir/);
  assert.ok((await O.evaluate(() => SHARE.replay())).parts[0].lines.length >= 2);

  // Order draft: two counts a day apart and a par give an order line.
  const day = await O.evaluate(() => shiftDay());
  const item = await O.evaluate(() => ctRows(true)[0]);
  await O.evaluate(([day, r]) => {
    const prev = addDays(day, -1);
    return Promise.all([LIVE.api.countLine(ctId(prev, r.area, r.item), { day: prev, area: r.area, item: r.item, unit: r.u, full: 10, open: 0 }),
      LIVE.api.countLine(ctId(day, r.area, r.item), { day, area: r.area, item: r.item, unit: r.u, full: 4, open: 0 })]);
  }, [day, item]);
  await O.evaluate((it) => sdOrderPar(it, 12), item.item);
  await O.waitForFunction((it) => ctSetup().items[it]?.par === 12, item.item);
  await O.evaluate(() => { SD.od.hist = null; });
  await part(O, "order");
  await O.waitForFunction(() => /to order/.test(document.querySelector("#tc-order")?.textContent || ""));
  const ord = await O.evaluate(() => SHARE.orderdraft());
  assert.match(ord.parts[0].lines[0], new RegExp(`${item.item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: 8`));

  // Voice: typed (as the iPhone keyboard's microphone would) and confirmed before it does anything.
  await K.evaluate(() => sdVoiceOpen());
  await K.fill("#sd-vtext", "86 limes"); await K.press("#sd-vtext", "Enter");
  assert.match(await K.textContent("#sd-voice"), /86 Limes for everyone\?/);
  assert.equal(await K.evaluate(() => LIVE.out.has("Limes")), false);
  await K.click("[data-sd-vgo]");
  await O.waitForFunction(() => LIVE.out.has("Limes"));
  await K.evaluate(() => sdVoiceOpen());
  await K.fill("#sd-vtext", "how do I make a negroni"); await K.press("#sd-vtext", "Enter"); await K.click("[data-sd-vgo]");
  await K.waitForSelector("#sheet:not([hidden]) #sh-name");
  assert.equal(await K.textContent("#sh-name"), "Negroni");
  await K.click("#sh-close");

  // Offline: the badge says everything is saved on the phone.
  await K.context().setOffline(true); await K.evaluate(() => sdTick());
  assert.match(await K.textContent("#sd-off"), /Working offline\. All saved\./);
  await K.context().setOffline(false); await K.evaluate(() => sdTick());
  assert.equal(await K.isHidden("#sd-off"), true);

  for (const p of [O, K]) assert.deepEqual(p.errs, []);
});
