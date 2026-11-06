// The pre-service briefing end to end: a manager posts it with last night's handover note, the team reads it, the
// managers see who hasn't, and a change asks everyone to read it again.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p) => p.$eval("#brief", (e) => e.textContent);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const forYou = (p) => p.$eval("#foryou", (e) => e.textContent);

test("a manager posts the briefing, staff read it, and a change makes it new again", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  // Last night's handover, for the "from the last shift" button.
  const day = await M.evaluate(() => addDays(shiftDay(), -1)), mia = await M.evaluate(() => LIVE.uid);
  const QS = ["depts", "sales", "cash", "voids", "tips", "breaks", "incidents", "complaints", "food", "faults", "security", "ready"];
  await adminWrite(`handovers/${day}`, { day: { stringValue: day }, answers: { mapValue: { fields: Object.fromEntries(QS.map((q) => [q, { stringValue: "yes" }])) } }, follow: { mapValue: { fields: {} } }, exceptions: { integerValue: "0" }, lines: { stringValue: "" }, note: { stringValue: "Ice machine slow" }, owner: { stringValue: "" }, risks: { integerValue: "0" },
    uid: { stringValue: mia }, name: { stringValue: "Mia Manager" }, at: { timestampValue: new Date(Date.now() - 8 * 36e5).toISOString() } });
  await M.evaluate(() => LIVE.api.set86("Limes", true));

  await part(S, "brief");
  assert.match(await text(S), /Nothing posted yet tonight\./);
  assert.equal(await S.$("#br-form"), null, "staff can't post one");

  await part(M, "brief");
  await M.click("#br-form summary");
  await M.click("#br-go");
  await waitToast(M, /^Add something to tell the team first$/);
  await M.fill('[data-br="covers"]', "18o");
  await M.fill('[data-br="allergies"]', "Table 12 coeliac");
  await M.click("#br-go");
  await waitToast(M, /^Covers should be a whole number$/);
  await M.fill('[data-br="covers"]', "180");
  await M.click("#br-prev");
  assert.match(await M.$eval('[data-br="previous"]', (e) => e.value), /^Handover \(Mia Manager\): Ice machine slow$/);
  await M.click("#br-go");
  await waitToast(M, /^Briefing posted$/);
  await M.waitForFunction(() => LIVE.briefing && !LIVE.briefing.pending);
  assert.match(await text(M), /Expected covers: 180.*Table 12 coeliac.*Ice machine slow.*86'd now.*Limes.*You posted it.*Read by 0/s);

  // Staff: on For you until they've read it.
  await part(S, "");
  await S.waitForFunction(() => /Read tonight's briefing/.test($("#foryou").textContent));
  assert.match(await forYou(S), /From Mia Manager, 180 covers/);
  await part(S, "brief");
  await S.click("#br-read");
  await waitToast(S, /^Marked as read$/);
  await S.waitForFunction(() => /You've read it/.test($("#brief").textContent));
  await M.waitForFunction(() => /Read by 1.*Sam Staff/s.test($("#brief").textContent));
  // Someone can't mark it for someone else, or an old version.
  assert.equal(await attempt(O, () => LIVE.api.saveBriefing({ ...LIVE.briefing, covers: -2 })), "permission-denied");

  // A change: everyone is asked to read it again.
  await part(O, "brief");
  await O.click("#br-form summary");
  // The form starts from what was posted.
  await O.waitForFunction(() => $('[data-br="covers"]').value === "180" && /Ice machine slow/.test($('[data-br="previous"]').value));
  await O.fill('[data-br="covers"]', "210");
  await O.click("#br-go");
  await waitToast(O, /^Briefing changed\. Everyone's asked to read it again$/);
  await S.waitForFunction(() => LIVE.briefing?.v === 2 && /I've read it/.test($("#brief").textContent));
  await M.waitForFunction(() => /Read by 0/.test($("#brief").textContent));
  assert.deepEqual([...O.errs, ...M.errs, ...S.errs], []);
});
