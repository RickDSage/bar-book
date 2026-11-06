// The team: when each person can work (and the rota's warnings from it), shout-outs, how was your shift, and new
// starters' checklists.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const forYou = (p) => p.$$eval("#foryou .fy", (x) => x.map((b) => `${b.innerText.replace(/\s*›$/, "").replace(/\s*\n+\s*/g, " | ")} > ${b.dataset.go}${b.classList.contains("hot") ? " (hot)" : ""}`));
const card = (p, k) => p.$eval(`#hub [data-tpane="${k}"]`, (b) => `${b.querySelector("b").textContent} | ${b.querySelector("small").textContent}${b.querySelector(".pc") ? ` (${b.querySelector(".pc").textContent})` : ""}`);
const uidOf = (p, name) => p.evaluate((n) => LIVE.staff.find((x) => x.name === n).uid, name);

test("availability: each person says when they can work, and the rota shows it and warns", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(S, "avail");
  await S.waitForSelector("#av-save");
  assert.deepEqual(await S.$$eval("#avail .avrow > b", (x) => x.map((e) => e.textContent)), ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  await S.click('[data-av-day="1"][data-av="no"]');
  await S.click('[data-av-day="4"][data-av="win"]');
  assert.equal(await S.inputValue('[data-av-from="4"]'), "17:00");
  await S.fill('[data-av-from="4"]', "");
  await S.click("#av-save");
  await waitToast(S, /^Put in both times for Friday$/);
  await S.fill('[data-av-from="4"]', "18:00");
  await S.fill("[data-av-note]", "Uni on Tuesdays until December");
  await S.click("#av-save");
  await waitToast(S, /^Saved\. The managers see it when they make the rota$/);
  await S.waitForFunction(() => LIVE.avail[0]?.days?.[4] === "18:00-23:00" && !LIVE.avail[0].pending);
  await part(S, "");
  assert.equal(await card(S, "avail"), "My availability | Saved. Change it when your week changes");

  // Managers see everyone's, and who hasn't said yet.
  const sam = await uidOf(M, "Sam Staff");
  await M.waitForFunction(() => LIVE.avail.length === 1);
  await part(M, "");
  assert.equal(await card(M, "avail"), "Availability | 1 of 3 have said when they can work");
  await part(M, "avail");
  assert.match(await text(M, "#avail"), /THE TEAM What each person has said\. .* Sam Staff Can't work Tue · Fri 18:00–23:00 Uni on Tuesdays until December Not said yet: Mia Manager, Olly Owner\./);
  assert.equal(await M.evaluate(() => shareText("avask", false)), "When can you work?\nPut your usual week in Bar Book, so the rota fits it: Team, then My availability. It takes a minute, and you can change it any time.\n\nStill to do it (2)\n• Mia Manager\n• Olly Owner");

  // The rota: a warning outside it, and the grid shows the days they can't work.
  const [tue, fri] = await M.evaluate(() => [addDays(weekOf(shiftDay()), 1), addDays(weekOf(shiftDay()), 4)]);
  const clash = await M.evaluate(([u, tue, fri]) => [roClash(u, { day: tue, start: "18:00", end: "23:00" }, ""), roClash(u, { day: fri, start: "17:00", end: "23:00" }, ""),
    roClash(u, { day: fri, start: "18:00", end: "23:00" }, ""), roClash(u, { day: fri, start: "19:00", end: "01:00" }, "")], [sam, tue, fri]);
  assert.deepEqual(clash, ["has said they can't work Tuesdays", "can only work 18:00–23:00 on Fridays", "", "can only work 18:00–23:00 on Fridays"]);
  await part(M, "rota");
  await M.waitForSelector("#rota .rgrid");
  assert.equal(await M.$eval(`[data-ro-cell="${sam}|${tue}"]`, (b) => `${b.className} ${b.innerText.trim()}`), "rg-c cant Can't");
  assert.equal(await M.$eval(`[data-ro-cell="${sam}|${fri}"]`, (b) => b.innerText.replace(/\s+/g, " ").trim()), "18:00 23:00");
  assert.match(await M.$eval(`[data-ro-cell="${sam}|${tue}"]`, (b) => b.getAttribute("aria-label")), /: has said they can't work that day$/);
  assert.match(await text(M, "#rota .rgkey"), /Can't, or two grey times: what someone has said they can work\./);
  // Staff never see anyone else's.
  assert.equal(await S.evaluate(() => LIVE.avail.length), 1);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

test("shout-outs: anyone thanks someone in front of the team, who gets a pop-up and sees it under For you", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const mia = await uidOf(M, "Mia Manager");
  await S.waitForFunction(() => LIVE.directory.length === 3);
  // Away from the Team page, so the pop-ups show.
  for (const p of [O, M]) await p.click("nav.tabs [data-tab=drinks]");
  await part(S, "shouts");
  assert.deepEqual(await S.$$eval('[data-sh="to"] option', (x) => x.map((o) => o.textContent)), ["Pick someone", "Mia Manager", "Olly Owner"]);
  await S.click("#sh-go");
  await waitToast(S, /^Pick who it's for$/);
  await S.selectOption('[data-sh="to"]', mia);
  await S.click("#sh-go");
  await waitToast(S, /^Say what they did$/);
  await S.fill('[data-sh="text"]', "Ran the bar alone for an hour and didn't drop a ticket");
  await S.click("#sh-go");
  await waitToast(S, /^Posted\. The team can see it$/);
  await waitToast(M, /^Sam Staff gave you a shout-out$/);
  await waitToast(O, /^Sam Staff gave Mia Manager a shout-out$/);
  assert.match(await text(S, "#shouts"), /LATEST 👏 Mia Manager · from you · .* Ran the bar alone for an hour and didn't drop a ticket Send on WhatsApp Take it down$/);

  // The person thanked: the bell, For you and the card.
  assert.equal(await M.$eval("#bell-n", (e) => e.hidden ? "" : e.textContent), "1");
  await M.click("nav.tabs [data-tab=notices]");
  assert.deepEqual((await forYou(M)).filter((x) => /shout-out/.test(x)), ["Sam Staff gave you a shout-out | Ran the bar alone for an hour and didn't drop a ticket > shouts"]);
  assert.equal(await card(M, "shouts"), "Shout-outs | Latest: Sam Staff to Mia Manager (1)");
  await part(M, "shouts");
  assert.match(await text(M, "#shouts"), /LATEST 👏 You · from Sam Staff · .* Ran the bar alone for an hour and didn't drop a ticket Take it down$/);

  // Sent on WhatsApp, it starts with what was said.
  await S.click('#shouts [data-send="shout"]');
  assert.equal(await S.$eval("#send-pre", (e) => e.innerText), "Shout-out to Mia Manager 👏\n\nRan the bar alone for an hour and didn't drop a ticket");
  await S.click("#sh-close");

  // Whoever wrote it, or a manager, takes it down.
  const id = await S.evaluate(() => LIVE.shouts[0].id);
  assert.equal(await O.evaluate(() => LIVE.shouts.length), 1);
  await S.click(`[data-sh-drop="${id}"]`);
  await waitToast(S, /^Taken down$/);
  await M.waitForFunction(() => LIVE.shouts.length === 0);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("how was your shift: one tap near the end of a shift, and the managers see each night and who's struggling", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const sam = await uidOf(M, "Sam Staff");
  // Sam's shift tonight ends in half an hour.
  await M.evaluate(async (uid) => {
    const d = shiftDay(), start = hhmm(new Date(Date.now() - 4 * 36e5)), end = hhmm(new Date(Date.now() + 30 * 6e4));
    await LIVE.api.shiftsAdd([{ week: weekOf(d), day: d, start, end, side: "bar", note: "", who: uid, whoName: "Sam Staff", offer: "", offerName: "" }], true);
  }, sam);
  await S.waitForFunction(() => LIVE.shifts.length === 1 && LIVE.loaded.has("pulse"));
  await part(S, "");
  await S.waitForSelector("#pulse .pucard");
  assert.equal(await text(S, "#pulse"), "How was your shift? 😣 Rough 😕 Not great 😐 OK 🙂 Good 😄 Great One tap. Only managers see it, with your name. Not tonight");
  // Only those on tonight's rota are asked, as their shift ends.
  for (const p of [O, M]) { await part(p, ""); assert.equal(await p.$eval("#pulse", (e) => e.innerHTML), ""); }
  // It's where the shift report is sent too.
  await S.evaluate(() => { pane = "send"; show("tally"); });
  assert.equal(await S.locator("#tally .pucard").count(), 1);
  await S.click('#tally [data-pu="2"]');
  await waitToast(S, /^Thanks\. Only managers see it$/);
  await S.fill("#pu-note", "Two down on the bar all night");
  await S.click("#pu-save");
  await waitToast(S, /^Sent\. Only managers see it$/);
  assert.equal(await S.locator("#tally .pucard").count(), 0);
  await S.click("nav.tabs [data-tab=notices]");
  assert.equal(await S.$eval("#pulse", (e) => e.innerHTML), "");

  // The managers: For you, the card, each night and what was said.
  await M.waitForFunction(() => LIVE.pulse.some((x) => x.note && !x.pending));
  await part(M, "");
  assert.deepEqual((await forYou(M)).filter((x) => /bad shift/.test(x)), ["1 person had a bad shift | Sam Staff: Two down on the bar all night > pulse"]);
  assert.equal(await card(M, "pulse"), "Shift feedback | Last 7 nights: 2.0 out of 5 (1)");
  await part(M, "pulse");
  const night = await M.evaluate(() => dayName(shiftDay()));
  assert.match(await text(M, "#pulses"), new RegExp(`NIGHT BY NIGHT ${night} · 2\\.0 · 1 answer 😣 0 · 😕 1 · 😐 0 · 🙂 0 · 😄 0 WHAT THEY SAID Sam Staff · ${night} · 😕 Not great Two down on the bar all night`));
  // Sent on, it has no names.
  assert.equal(await M.evaluate(() => shareText("pulse", false)), `Shift feedback · Black Tap Soho · last 7 nights\n2.0 out of 5, from 1 answer\n\nNight by night (1)\n• ${night}: 2.0 (1 answer)\n\nWhat they said (1)\n• Not great: Two down on the bar all night`);
  // Staff don't have it.
  assert.equal(await S.locator('#hub [data-tpane="pulse"]').count(), 0);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("new starters: a manager ticks off each thing in someone's first weeks, and they see their own", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  const sam = await uidOf(M, "Sam Staff");
  await part(M, "onboard");
  assert.match(await text(M, "#onboard"), /Nobody in their first weeks\./);
  await M.click("#ob-add summary");
  await M.evaluate(() => renderOnboard());
  assert.equal(await M.$eval("#ob-add", (e) => e.open), true, "opened, it stays open when the page redraws");
  await M.click("#ob-go");
  await waitToast(M, /^Pick who it's for$/);
  await M.selectOption('[data-obf="who"]', sam);
  await M.click("#ob-go");
  await waitToast(M, /^Started\. Sam Staff can see it in My first weeks$/);
  await M.waitForFunction(() => LIVE.onboard.length === 1 && !LIVE.onboard[0].pending);
  assert.equal(await M.locator("#onboard .obi").count(), 15);
  await M.check('[data-ob-i="0"]');
  await M.check('[data-ob-i="3"]');
  await M.waitForFunction(() => Object.keys(LIVE.onboard[0].done).length === 2);
  const day = await M.evaluate(() => dayName(shiftDay()));
  assert.match(await text(M, "#onboard"), new RegExp(`SAM STAFF Started ${day} · 2 of 15 done Right to work checked before the first shift ${day}, Mia Manager Written statement`));

  // Sam sees their own.
  await S.waitForFunction(() => LIVE.onboard.length === 1 && Object.keys(LIVE.onboard[0].done).length === 2);
  await part(S, "");
  assert.equal(await card(S, "myob"), "My first weeks | 2 of 15 done");
  await part(S, "myob");
  assert.match(await text(S, "#myob"), new RegExp(`^MY FIRST WEEKS What you'll be shown and trained on in your first weeks\\. A manager ticks each one off with you\\. 2 of 15 done · Started ${day} ✓ Right to work checked before the first shift ${day}, Mia Manager ○ Written statement of terms given on day one`));
  assert.equal(await S.locator("#myob input").count(), 0, "staff can't tick");

  // Unticked, and the venue's own checklist: ticks stay with what hasn't changed.
  await M.uncheck('[data-ob-i="3"]');
  await S.waitForFunction(() => Object.keys(LIVE.onboard[0].done).length === 1);
  await M.click("#ob-list summary");
  await M.fill('[data-obf="text"]', "Right to work checked before the first shift\nFire drill\n\nCellar tour\nFire drill");
  await M.click("#ob-save");
  await waitToast(M, /^Saved\. Every new starter's checklist has changed$/);
  await S.waitForFunction(() => LIVE.onboardList?.length === 3);
  await part(S, "");
  assert.equal(await card(S, "myob"), "My first weeks | 1 of 3 done");
  assert.equal(await M.evaluate(() => shareText("onboard", false)), `Sam Staff's first weeks · Black Tap Soho\nStarted ${day}: 1 of 3 done\n\nStill to do (2)\n• Fire drill\n• Cellar tour\n\nDone (1)\n• Right to work checked before the first shift (${day}, Mia Manager)`);

  // Removed, it's gone for them too.
  await M.click(`[data-ob-drop="${sam}"]`);
  await waitToast(M, /^Removed$/);
  await S.waitForFunction(() => LIVE.onboard.length === 0);
  await part(S, "");
  assert.equal(await S.locator('#hub [data-tpane="myob"]').count(), 0);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
