// The manager close and handover end to end: answering the questions, follow-ups on a no, what Bar Book saw tonight,
// the urgent issue a security no raises for the team, one close a night, accepting the last one, and the switch.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const QS = ["depts", "sales", "cash", "voids", "tips", "breaks", "incidents", "complaints", "food", "faults", "security", "ready"];
const text = (p) => p.$eval("#mclose", (e) => e.textContent);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// A JS value as Firestore REST fields, for records written past the rules.
const val = (v) => (typeof v === "string" ? { stringValue: v } : typeof v === "number" ? { integerValue: String(v) } : v instanceof Date ? { timestampValue: v.toISOString() }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } });
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, val(x)]));

test("a manager closes the night: a no asks what happened, a security no raises an urgent issue for the team, and staff never see it", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await part(M, "handover");
  await M.waitForSelector("#ho-go");
  // Bar Book's own view of tonight: no department has sent its report.
  assert.match(await text(M), /What Bar Book saw tonight.*Bar report not sent.*Floor report not sent/s);
  assert.match(await text(M), /Not sent yet: Bar, Floor/);

  await M.click("#ho-go");
  await waitToast(M, /^Answer every question first \(12 to go\)$/);
  for (const q of QS) await M.click(`[data-hoa="${q}"][data-v="${q === "security" ? "no" : "yes"}"]`);
  assert.match(await M.$eval('[data-hoq="security"]', (e) => e.textContent), /Risk\..*urgent issue the whole team sees/);
  await M.click("#ho-go");
  await waitToast(M, /^Fill in what's asked under each no \(Security\)$/);
  await M.fill('[data-hof="security:what"]', "Back door won't lock");
  await M.click('[data-hoyn="security:safe"][data-v="No"]');
  await M.fill('[data-hof="security:told"]', "Owner, by phone");
  await M.fill('[data-hon="note"]', "Locksmith booked for 9am");
  // A half-filled close survives a reload of the form.
  assert.equal(await M.evaluate(() => store.get("hodraft").f.security.what), "Back door won't lock");
  await M.click("#ho-go");
  await waitToast(M, /^Handover sent, and 1 urgent issue raised$/);
  await M.waitForFunction(() => LIVE.handovers[0] && !LIVE.handovers[0].pending);
  const h = await M.evaluate(() => LIVE.handovers[0]);
  assert.equal(h.risks, 1);
  assert.equal(h.answers.security, "no");
  assert.deepEqual(h.follow.security, { what: "Back door won't lock", safe: "No", told: "Owner, by phone" });
  assert.equal(h.snap.missing, 2);
  assert.ok(h.exceptions >= 2);
  assert.match(h.lines, /No report: Bar report not sent/);
  assert.match(await text(M), /Tonight's close is sent.*1 risk.*Not accepted yet.*Back door won't lock.*Raised as an urgent issue.*Locksmith booked/s);

  // The whole team sees the issue; only managers see the handover.
  await S.waitForFunction(() => LIVE.issues.some((x) => x.urgent && x.title === "Security: Back door won't lock"));
  assert.equal(await S.evaluate(() => LIVE.handovers.length), 0);
  await part(S, "");
  assert.equal(await S.$('#hub [data-tpane="handover"]'), null);

  // One close a night: a second one is refused, and the sent one can't be changed.
  const day = await O.evaluate(() => shiftDay());
  assert.equal(await attempt(O, (d) => LIVE.api.sendHandover(d, { answers: {}, follow: {}, risks: 0, exceptions: 0, lines: "", snap: {}, note: "", owner: "" }, []), day), "permission-denied");
  assert.deepEqual(M.errs, []);
});

test("the next manager accepts the last handover, saying what they'll do about its risks; the owner can switch it off", async () => {
  await resetEmulators();
  const { O, M } = await team(browser, site, people);
  // Last night's close, sent by the manager with a cash risk and a note for the owner.
  const day = await O.evaluate(() => addDays(shiftDay(), -1)), mia = await M.evaluate(() => LIVE.uid);
  await adminWrite(`handovers/${day}`, fields({ day, answers: Object.fromEntries(QS.map((q) => [q, q === "cash" ? "no" : "yes"])),
    follow: { cash: { amount: "£20 short", till: "Bar till", recount: "Yes", second: "Sam", told: "GM" } }, risks: 1, exceptions: 0, lines: "", snap: {},
    note: "Recount the float", owner: "Cash short again, second time this week", uid: mia, name: "Mia Manager", at: new Date(Date.now() - 8 * 36e5) }));

  await part(O, "");
  await O.waitForFunction(() => [...document.querySelectorAll("#foryou .fy")].some((b) => /Accept Mia Manager's handover/.test(b.textContent) && b.classList.contains("hot")));
  assert.match(await O.$eval("#foryou", (e) => e.textContent), /For the owner, from Mia Manager.*Cash short again/s);
  await part(O, "handover");
  assert.match(await text(O), /Last handover: read it and accept it.*1 risk.*£20 short.*Recount the float.*Cash short again/s);
  await O.click(`[data-ho-accept="${day}"]`);
  await waitToast(O, /^Say what you'll do about the risks first$/);
  await O.fill(`[data-hoack="${day}"]`, "Recounting at 10 with the GM");
  await O.click(`[data-ho-accept="${day}"]`);
  await waitToast(O, /^Handover accepted$/);
  await M.waitForFunction(() => LIVE.handovers[0]?.ackBy === "Olly Owner" && LIVE.handovers[0].ackNote === "Recounting at 10 with the GM");
  await part(O, "handover");
  assert.match(await text(O), /Earlier handovers \(1\)/);

  // Switched off for the venue, its card goes.
  await part(O, "");
  await O.waitForSelector('#hub [data-tpane="handover"]');
  await O.evaluate(() => LIVE.api.setOff(["handover"]));
  await M.waitForFunction(() => !isOn("handover"));
  await part(M, "");
  assert.equal(await M.$('#hub [data-tpane="handover"]'), null);
  assert.deepEqual([...O.errs, ...M.errs], []);
});

test("a manager adds the venue's own question; a no on it asks what happened and, if it's a risk, raises an urgent issue", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(M, "handover");
  await M.click("#hq-box summary");
  await M.click("#hq-go");
  await waitToast(M, /^Write the question first$/);
  await M.fill("#hq-t", "Keg room locked?");
  await M.check("#hq-crit");
  await M.click("#hq-go");
  await waitToast(M, /^Question added$/);
  await M.waitForSelector('[data-hoxa][data-v="no"]');
  assert.equal(await attempt(S, () => LIVE.api.saveHoq([{ id: "abc", t: "Mine", crit: false }])), "permission-denied");

  for (const q of QS) await M.click(`[data-hoa="${q}"][data-v="yes"]`);
  await M.click("#ho-go");
  await waitToast(M, /^Answer every question first \(1 to go\)$/);
  await M.click('[data-hoxa][data-v="no"]');
  await M.click("#ho-go");
  await waitToast(M, /^Fill in what happened and who's been told under each no$/);
  const id = await M.$eval("[data-hoxa]", (e) => e.dataset.hoxa);
  await M.fill(`[data-hoxf="${id}:what"]`, "Padlock missing");
  await M.fill(`[data-hoxf="${id}:told"]`, "GM");
  await M.click("#ho-go");
  await waitToast(M, /^Handover sent, and 1 urgent issue raised$/);
  await M.waitForFunction(() => LIVE.handovers[0] && !LIVE.handovers[0].pending);
  const h = await M.evaluate(() => LIVE.handovers[0]);
  assert.equal(h.risks, 1);
  assert.deepEqual(h.extra[id], { t: "Keg room locked?", crit: true, a: "no", what: "Padlock missing", told: "GM" });
  assert.match(await text(M), /Keg room locked\?.*Padlock missing/s);
  await S.waitForFunction(() => LIVE.issues.some((x) => x.urgent && x.title === "Keg room locked?: Padlock missing"));
  assert.deepEqual([...M.errs, ...S.errs], []);
});
