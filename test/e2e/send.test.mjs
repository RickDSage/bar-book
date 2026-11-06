// The Send page: every Send button opens it. Summary first, a tick box for each part, a note, the message as it will
// look, then WhatsApp, Email, copy or print. Logged out, on My pay, so it needs no emulator data: live.js is blocked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London", colorScheme: "dark" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  await p.goto(site.url);
  await p.click("#w-ok");
  // WhatsApp and Email are links filled in as they're tapped. Opening them is stopped.
  await p.evaluate(() => addEventListener("click", (e) => { if (e.target.closest("a[data-share]")) e.preventDefault(); }, true));
  await p.click("[data-tab=pay]");
  await p.click("[data-hf-open]");
  for (const d of ["2026-11-03", "2026-11-10"]) await p.click(`[data-hf-day="${d}"]`);
  await p.fill('[data-hf="start"]', "17:00"); await p.fill('[data-hf="end"]', "23:00");
  await p.click('[data-hf-brk="30"]'); await p.click("[data-hf-save]");
  return p;
}
const link = async (p, via) => { const a = `#send [data-share][data-via=${via}]`; await p.click(a); return new URL(await p.getAttribute(a, "href")); };
const preview = (p) => p.$eval("#send-pre", (e) => e.textContent);
// Back goes through the phone's history, so wait for the page to close before opening the next.
const back = async (p) => { await p.click("#sh-close"); await p.waitForSelector("#sheet", { state: "hidden" }); };

test("one Send page: tick what goes in, add a note, see it, then WhatsApp with bold headings or email without", async () => {
  const p = await open();
  await p.click("[data-send=hours]");
  assert.equal(await p.$eval("#sh-name", (e) => e.textContent), "My hours");
  assert.equal(await p.$eval("#send .sendsum", (e) => e.textContent), "In all: 11 h from 2 shifts");
  assert.deepEqual(await p.$$eval("#send .sendpart", (x) => x.map((l) => [l.textContent, l.querySelector("input").checked])), [["Shifts2", true]]);
  // The preview shows WhatsApp's bold as bold, not as marks.
  assert.equal(await p.$eval("#send-pre b", (e) => e.textContent), "My hours for November");
  await p.fill("#send-note", "Can you check the 10th?");
  const words = "My hours for November\nIn all: 11 h from 2 shifts\n\nShifts (2)\n• Tue 3 Nov 17:00–23:00, 30 min break: 5.5 h\n• Tue 10 Nov 17:00–23:00, 30 min break: 5.5 h\n\nNote\nCan you check the 10th?";
  assert.equal(await preview(p), words);
  assert.deepEqual(await p.$$eval("#send-pre b", (x) => x.map((b) => b.textContent)), ["My hours for November", "Shifts (2)", "Note"]);
  const wa = await link(p, "wa");
  assert.equal(wa.host, "wa.me");
  assert.equal(wa.searchParams.get("text"), "*My hours for November*\nIn all: 11 h from 2 shifts\n\n*Shifts (2)*\n• Tue 3 Nov 17:00–23:00, 30 min break: 5.5 h\n• Tue 10 Nov 17:00–23:00, 30 min break: 5.5 h\n\n*Note*\nCan you check the 10th?");
  const mail = await link(p, "mail");
  assert.equal(mail.protocol, "mailto:");
  assert.equal(mail.searchParams.get("subject"), "My hours for November");
  assert.equal(mail.searchParams.get("body"), words);
  // Untick a part and it's gone from the message, its summary stays.
  await p.uncheck('[data-send-part="shifts"]');
  assert.equal(await preview(p), "My hours for November\nIn all: 11 h from 2 shifts\n\nNote\nCan you check the 10th?");
  assert.doesNotMatch((await link(p, "wa")).searchParams.get("text"), /Shifts/);
  // Print: the message on its own, without the marks.
  await p.evaluate(() => { window.print = () => (window.printed = document.querySelector("#print").innerText); });
  await p.click("#send [data-send-print]");
  assert.equal(await p.evaluate(() => window.printed), "My hours for November\nIn all: 11 h from 2 shifts\n\nNote\nCan you check the 10th?");
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  // Back closes it, and the next Send starts fresh.
  await p.click("#sh-close");
  await p.click("[data-send=hours]");
  assert.equal(await p.inputValue("#send-note"), "");
  assert.equal(await p.isChecked('[data-send-part="shifts"]'), true);
  assert.deepEqual(p.errs, []);
});

test("the Send page reads in the phone's language, and the message goes in English", async () => {
  const p = await open();
  await p.evaluate(() => setLang("pl"));
  await p.click("[data-send=hours]");
  assert.equal(await p.$eval("#sh-name", (e) => e.textContent), "Moje godziny");
  assert.match(await p.$eval("#send", (e) => e.textContent), /Co wysłać[\s\S]*Dodaj notatkę \(opcjonalnie\)/);
  assert.equal(await preview(p), "My hours for November\nIn all: 11 h from 2 shifts\n\nShifts (2)\n• Tue 3 Nov 17:00–23:00, 30 min break: 5.5 h\n• Tue 10 Nov 17:00–23:00, 30 min break: 5.5 h");
  assert.equal((await link(p, "wa")).searchParams.get("text"), "*My hours for November*\nIn all: 11 h from 2 shifts\n\n*Shifts (2)*\n• Tue 3 Nov 17:00–23:00, 30 min break: 5.5 h\n• Tue 10 Nov 17:00–23:00, 30 min break: 5.5 h");
  assert.deepEqual(p.errs, []);
});

// The quick messages, written from the rota. The rota is put straight on the phone: these only read it.
async function onRota(p, admin = false) {
  await p.evaluate((admin) => {
    const team = [{ uid: "u1", name: "Sam Staff" }, { uid: "u2", name: "Tia Staff" }];
    Object.assign(LIVE, { me: "Sam Staff", uid: "u1", admin, staff: team, directory: team }); LIVE.loaded.add("shifts");
    const s = (id, day, start, end, side, who, whoName, x = {}) => ({ id, pub: true, day, week: weekOf(day), start, end, side, who, whoName, wants: {}, ...x });
    LIVE.shifts = [s("a", "2026-11-20", "18:00", "02:00", "bar", "u1", "Sam Staff"), s("b", "2026-11-22", "12:00", "20:00", "floor", "u1", "Sam Staff"),
      s("c", "2026-11-21", "18:00", "02:00", "bar", "u2", "Tia Staff"), s("d", "2026-11-21", "18:00", "23:00", "bar", "", ""),
      s("e", "2026-11-24", "17:00", "23:00", "bar", "u1", "Sam Staff")];
  }, admin);
}

test("quick messages: running late, off sick, cover my shift and my shifts, written from the rota", async () => {
  const p = await open();
  await onRota(p);
  assert.equal(await p.evaluate(() => shareText("late", false)), "Running late\nHi, it's Sam. I'm running about 15 minutes late for my shift (today, 18:00–02:00). Sorry, I'll be there as soon as I can.");
  assert.equal(await p.evaluate(() => shareText("sick", false)), "Off sick\nHi, it's Sam. I'm not well and can't make my shift today, 18:00–02:00. I'll let you know how I'm doing.");
  assert.equal(await p.evaluate(() => shareText("myweek", false)), "My shifts · week of Monday 16 November\n2 shifts, 16 h before breaks\n\nShifts (2)\n• Fri 20 Nov 18:00–02:00 (Bar)\n• Sun 22 Nov 12:00–20:00 (Floor)");
  // How late is a tap; the note is the person's own words, with no heading.
  await p.evaluate(() => openSend("late"));
  assert.deepEqual(await p.$$eval("#send [data-send-opt]", (x) => x.map((b) => b.textContent)), ["5 min", "10 min", "15 min", "20 min", "30 min", "45 min", "An hour"]);
  await p.click('#send [data-send-opt="60"]');
  await p.fill("#send-note", "The Victoria line is down");
  assert.equal(await preview(p), "Running late\nHi, it's Sam. I'm running about an hour late for my shift (today, 18:00–02:00). Sorry, I'll be there as soon as I can.\n\nThe Victoria line is down");
  await back(p);
  // Cover my shift: pick which one.
  await p.evaluate(() => openSend("swap"));
  assert.deepEqual(await p.$$eval("#send [data-send-opt]", (x) => x.map((b) => b.textContent)), ["Fri 20 Nov 18:00–02:00", "Sun 22 Nov 12:00–20:00", "Tue 24 Nov 17:00–23:00"]);
  await p.click('#send [data-send-opt="b"]');
  assert.equal(await preview(p), "Can anyone cover my shift?\nSunday 22 November, 12:00–20:00, floor.\nA manager still has to agree the swap. Message me if you can take it.");
  await back(p);
  // Everything in one place, staff see only their own and tonight's.
  await p.evaluate(() => { tpane = "send"; renderSendHub(); });
  assert.deepEqual(await p.$$eval("#sendhub .sec", (x) => x.map((e) => e.textContent)), ["From you", "Tonight"]);
  assert.deepEqual(await p.$$eval("#sendhub .place b", (x) => x.map((e) => e.textContent).slice(0, 5)), ["Running late", "Off sick", "Cover my shift", "My shifts", "My hours"]);
  assert.deepEqual(p.errs, []);
});

test("managers: someone's week, shifts that need cover, and the rota by day or by person", async () => {
  const p = await open();
  await onRota(p, true);
  assert.equal(await p.evaluate(() => shareText("theirweek", false, "u2")), "Your shifts · week of Monday 16 November\nHi Tia, you're on for 1 shift this week. Can't make one? Say so in Bar Book as soon as you can.\n\nShifts (1)\n• Sat 21 Nov 18:00–02:00 (Bar)");
  assert.equal(await p.evaluate(() => shareText("cover", false)), "Shifts that need cover\n1 shift in the next 7 days. Put your hand up in Bar Book (Team, then Rota), or reply here.\n\nShifts (1)\n• Sat 21 Nov 18:00–23:00 (Bar)");
  assert.match(await p.evaluate(() => shareText("rota", false, "person")), /\n\nWho's on\nSam Staff\n   ◦ Fri 20 Nov 18:00–02:00 \(Bar\)\n   ◦ Sun 22 Nov 12:00–20:00 \(Floor\)\nTia Staff\n   ◦ Sat 21 Nov 18:00–02:00 \(Bar\)$/);
  await p.evaluate(() => openSend("shout", "u2"));
  await p.fill("#send-note", "Ran the bar alone for an hour and didn't drop a ticket");
  assert.equal(await preview(p), "Shout-out to Tia Staff 👏\n\nRan the bar alone for an hour and didn't drop a ticket");
  await back(p);
  // What's on: the next 7 days from the calendar, anything running for days listed once with its dates, then the games.
  await p.evaluate(() => {
    LIVE.cal = [{ id: "c1", kind: "school", title: "Half term", date1: "2026-11-16", date2: "2026-11-22", note: "", name: "Owner" },
      { id: "c2", kind: "closed", title: "Refit", date1: "2026-11-25", date2: "2026-11-25", note: "Back on the 26th", name: "Owner" }];
    LIVE.fixtures = [{ day: "2026-11-21", ko: "17:30", home: "Arsenal", away: "Spurs", comp: "Premier League", channel: "Sky Sports", screen: "Main" }];
  });
  assert.equal(await p.evaluate(() => shareText("whatson", false)), "What's on at Black Tap Soho · next 7 days\n3 things on, 1 game on our screens\n\nWhat's on (3)\n• Mon 16 Nov to Sun 22 Nov: Half term\n• Wed 25 Nov: Refit (venue closed), Back on the 26th\n• Thu 26 Nov: Thanksgiving (US)\n\nGames on our screens (1)\n• Sat 21 Nov 17:30 Arsenal v Spurs, Sky Sports, screen: Main");
  // A broadcast, for anyone not on the app, with who hasn't tapped Got it yet.
  await p.evaluate(() => { LIVE.notices = [{ id: "n1", uid: "u1", name: "Sam Staff", text: "New Guinness lines go in on Monday, so no Guinness until 6pm", side: "all" }]; LIVE.seen = []; });
  assert.equal(await p.evaluate(() => shareText("pin", false)), "Broadcast from Sam Staff\nNew Guinness lines go in on Monday, so no Guinness until 6pm\nRead it in Bar Book too and tap Got it, so we know you've seen it.\n\nStill to read it (1)\n• Tia Staff");
  await p.evaluate(() => { tpane = "send"; renderSendHub(); });
  assert.deepEqual(await p.$$eval("#sendhub .sec", (x) => x.map((e) => e.textContent)), ["From you", "Tonight", "For managers"]);
  assert.deepEqual(p.errs, []);
});
