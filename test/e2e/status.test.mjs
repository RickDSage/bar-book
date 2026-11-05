// Tonight's status: each department says how it's doing, anyone reports what's holding service up, and managers hear
// about a slammed department or the same hold-up again and again.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const text = (p) => p.$eval("#status", (e) => e.innerText.replace(/\s+/g, " "));
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("staff set their department's status and report hold-ups; managers see it, are told when it's bad, and see patterns", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(S, "status");
  assert.match(await text(S), /Bar Not set Floor Not set Kitchen Not set/i);
  await S.click('[data-st-side="floor"]');
  await S.click("#st-go");
  await waitToast(S, /^Pick calm, busy or slammed first$/);
  await S.click('[data-st-level="slammed"]');
  await S.fill('[data-st="note"]', "Two parties of 12");
  await S.click("#st-go");
  await waitToast(S, /^Updated$/);
  for (let i = 0; i < 3; i++) { await S.click('[data-bk="glass"]'); await waitToast(S, /^Reported$/); }
  await S.fill('[data-st="bnote"]', "Washer's down");
  await S.click('[data-bk="equipment"]');
  await S.waitForFunction(() => /Reported tonight \(4\)/i.test($("#status").innerText));
  assert.match(await text(S), /Floor Slammed Two parties of 12 Sam Staff/i);
  assert.match(await text(S), /Equipment problem · Floor Washer's down, Sam Staff/);
  assert.equal(await S.$("#status details"), null, "staff don't get the patterns");

  // Managers: For you flags the slammed floor and the glasses, and the patterns count them.
  await part(M, "");
  await M.waitForFunction(() => /Floor is slammed: Two parties of 12/.test($("#foryou").innerText) && /Out of clean glasses: reported 3 times in the last hour/.test($("#foryou").innerText));
  assert.match(await M.$eval('#hub [data-tpane="status"]', (e) => e.innerText.replace(/\s+/g, " ")), /Bar not set · Floor slammed · Kitchen not set/);
  await part(M, "status");
  await M.click("#status details summary");
  assert.match(await text(M), /4 reports in the last four weeks\. WHAT Out of clean glasses 3 Equipment problem 1/i);
  assert.deepEqual([...M.errs, ...S.errs], []);
});
