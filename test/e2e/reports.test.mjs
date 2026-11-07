// The Reports tab: every shift report and incident in one place, night by night, with older ones read a page at a
// time, and the Black Tap name at the top going home.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, adminWrite, attempt, toastOf, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const flat = (s) => s.replace(/\s+/g, " ");
const text = async (p) => flat(await p.$eval("#reports", (e) => e.innerText));
const SIDES = ["Bar", "Floor", "Kitchen"];
// One report a night for the last 34 nights, a minute before now on each, so each falls on its own night.
const at = (i) => ({ timestampValue: new Date(Date.now() - i * 864e5 - 6e4).toISOString() });
const str = (v) => ({ stringValue: v });
async function seed(sam) {
  for (let i = 0; i < 34; i++) {
    const signed = i % 4 ? { signedBy: str("Olly Owner"), signedByUid: str("x"), signedAt: at(i) } : {};
    await adminWrite(`reports/night${String(i).padStart(2, "0")}`, { side: str(SIDES[i % 3].toLowerCase()), text: str(`Report for night ${i}`),
      summary: str(`${SIDES[i % 3]} · Night ${i}`), photos: { integerValue: "0" }, uid: str(sam), name: str("Sam Staff"), at: at(i), ...signed });
  }
  // 51 incidents, one a night: one more than the 50 that stay live. Tonight's is still open.
  for (let i = 0; i < 51; i++) {
    const closed = i ? { status: str("closed"), outcome: str(`Sorted ${i}`), closedBy: str("Olly Owner"), closedByUid: str("x"), closedAt: at(i) } : { status: str("open") };
    await adminWrite(`incidents/inc${String(i).padStart(2, "0")}`, { kind: str("Guest complaint"), text: str(`Incident ${i}`), uid: str(sam), name: str("Sam Staff"), at: at(i), ...closed });
  }
  // A flag on night 31's report, which is older than the 30 that stay live.
  await adminWrite("reviews/flag31", { report: str("night31"), verdict: str("flag"), text: str("Bins missed"), uid: str("x"), name: str("Olly Owner"), at: at(31) });
}

test("every report in one tab: waiting first, night by night, filters, and older ones a page at a time", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await seed(await O.evaluate(() => LIVE.staff.find((p) => p.name === "Sam Staff").uid));
  // Reviews are read once Reports is opened, not when the app opens.
  await part(O, "reports");
  await O.waitForFunction(() => LIVE.reports.length === 30 && LIVE.incidents.length === 50 && LIVE.reviews.length === 1);

  // The managers' Nights and Incidents pages are part of this tab now.
  assert.deepEqual(await O.$$eval("[data-rp-show]", (x) => x.map((b) => b.dataset.rpShow)), ["all", "bar", "floor", "kitchen", "flagged", "incidents"]);
  let t = await text(O);
  assert.match(t, /^WAITING FOR SIGN-OFF .*OPEN INCIDENTS Guest complaint Open Sam Staff · .* Incident 0 /);
  assert.equal(await O.$$eval("#reports [data-sign]", (x) => x.length), 8, "nights 0, 4 ... 28 are waiting");
  assert.match(t, /EVERY REPORT .*Bar · Sam Staff Waiting \d\d:\d\d · Night 0 /, "night 0's report");
  assert.match(t, /Floor · Sam Staff Signed off \d\d:\d\d · Night 1 Signed off by Olly Owner/);
  assert.equal(await O.$$eval("#reports .nfacts", (x) => x.length), 7, "the counts show for the last 7 nights only");
  assert.match(await O.$eval("#reports .nfacts", (e) => e.textContent), /^1 incident$/);
  assert.doesNotMatch(t, /Night 30 /, "older than the live 30");

  // Flagged: night 31's flag is loaded, but its report isn't yet.
  await O.click("[data-rp-show=flagged]");
  assert.match(await text(O), /None in the ones loaded so far\. Show older to look further back\./);
  await O.click("#rp-older");
  await O.waitForFunction(() => /Night 31/.test(document.querySelector("#reports").innerText));
  t = await text(O);
  assert.match(t, /Floor · Sam Staff Signed off Flagged \d\d:\d\d · Night 31 /);
  assert.match(t, /That's every flagged report\./);
  assert.equal(await O.$$eval("#reports [data-sign]", (x) => x.length), 9, "night 32 joins the waiting ones");

  // Signing off a report older than the live 30 updates it here too.
  await O.click("[data-rp-show=kitchen]");
  assert.ok((await O.$$eval("#reports article .staffrow .n", (x) => x.map((e) => e.textContent))).every((n) => n.startsWith("Kitchen")));
  await O.click('[data-sign="night32"]');
  await O.waitForFunction(() => [...document.querySelectorAll("#reports article .staffrow")].some((r) => /Night 32/.test(r.textContent) && /Signed off by Olly Owner/.test(r.textContent)));
  assert.equal(await O.$$eval("#reports [data-sign]", (x) => x.length), 8);
  assert.equal(await O.$$eval('[data-sign="night32"]', (x) => x.length), 0);

  // Incidents: 50 live, then the last one; closing one keeps what was done.
  await O.click("[data-rp-show=incidents]");
  assert.match(await text(O), /Incident 49 /); assert.doesNotMatch(await text(O), /Incident 50 /);
  await O.click("#rp-older");
  await O.waitForFunction(() => /Incident 50/.test(document.querySelector("#reports").innerText));
  assert.match(await text(O), /That's every incident\./);
  await O.fill('[data-inct="inc00"]', "Comped the fries"); await O.click('[data-inc-close="inc00"]');
  await O.waitForFunction(() => /What was done: Comped the fries · Olly Owner/.test(document.querySelector("#reports").innerText));
  assert.match(await text(O), /No open incidents\. Anyone can log one in My requests\./);

  // The spreadsheet has every report, not only the ones on screen.
  await O.click("[data-rp-show=all]");
  await O.click("#rp-csv"); await O.waitForSelector("#rp-save");
  assert.equal(await O.$eval("#rp-save", (e) => e.textContent), "Save the spreadsheet (34 rows)");

  // Reviews of older reports come with their page; staff can't read reviews or incidents.
  assert.equal(await O.evaluate(() => LIVE.api.reviewsOf(["night31", "night30"]).then((v) => v.map((x) => x.text).join())), "Bins missed");
  assert.equal(await attempt(S, () => LIVE.api.reviewsOf(["night31"])), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.olderThan("incidents", LIVE.reports[0].at, 30)), "permission-denied");

  // Staff: the same list by side, without flags or incidents, and older reports too.
  await part(S, "reports");
  assert.deepEqual(await S.$$eval("[data-rp-show]", (x) => x.map((b) => b.dataset.rpShow)), ["all", "bar", "floor", "kitchen"]);
  assert.doesNotMatch(await text(S), /open incidents|flagged/i);
  await S.click("#rp-older");
  await S.waitForFunction(() => /That's every report\./.test(document.querySelector("#reports").innerText));
  assert.match(await text(S), /Bar · Sam Staff Signed off \d\d:\d\d · Night 33 /);
  assert.equal(await S.$$eval("#reports [data-sign]", (x) => x.length), 0, "only managers sign off");

  // On a small phone nothing runs off the side.
  await O.setViewportSize({ width: 320, height: 700 });
  assert.ok(await O.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("the Black Tap name at the top goes home, to the drinks from the top", async () => {
  await resetEmulators();
  const { O } = await team(browser, site);
  await O.evaluate(() => show("notices"));
  await O.click("#home");
  assert.deepEqual(await O.evaluate(() => [$("#v-drinks").hidden, $("#v-notices").hidden, scrollY, location.hash]), [false, true, 0, ""]);
  await O.click("[data-tab=info]"); await O.evaluate(() => scrollTo(0, 400));
  await O.click("#home");
  assert.deepEqual(await O.evaluate(() => [$("#v-drinks").hidden, scrollY]), [false, 0]);
  assert.equal(await toastOf(O), "");
  assert.deepEqual(O.errs, []);
});
