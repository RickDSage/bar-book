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
  await c.addInitScript(() => (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99, "bar:Angel": 99, "floor:Angel": 99 }))));
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
  await p.click("[data-hf-open]"); await p.click('[data-hf-mode="times"]');
  for (const d of ["2026-11-03", "2026-11-10"]) await p.click(`[data-hf-day="${d}"]`);
  await p.fill('[data-hf="start"]', "17:00"); await p.fill('[data-hf="end"]', "23:00");
  await p.click('[data-hf-brk="30"]'); await p.click("[data-hf-save]");
  await p.click("[data-hf-cancel]"); await p.click('[data-pay-tab="more"]'); await p.click("[data-sec=shifts] summary");
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

