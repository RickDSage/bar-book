// The cleaning schedule end to end: managers set up the jobs, anyone ticks them off, and each one comes due again.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];
const text = (p, sel) => p.$eval(sel, (e) => e.textContent);
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const managers = async (p, sub) => { await p.evaluate(() => show("notices")); await p.click("[data-tpane=managers]"); await p.click(`[data-msub=${sub}]`); };
const logs = async (p) => { await p.click("[data-tab=tally]"); await p.click(".ptabs [data-pane=logs]"); };
const due = (p) => p.$eval(".ptabs [data-pane=logs] small", (e) => e.textContent);
const tile = (p) => p.$eval("#dash", (e) => [...e.querySelectorAll("button")].map((b) => `${b.innerText.replace(/\n+/g, " ")}${b.classList.contains("hot") ? " (hot)" : ""}`).find((t) => /cleaning/.test(t)));

test("managers set up cleaning jobs, anyone ticks them off, and each comes due again", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, people);
  await T.evaluate(() => setMode("floor"));
  await managers(O, "safety");
  await O.click("#msafety details[data-keep=jobs] > summary");
  await O.click("#j-go");
  assert.equal(await toastOf(O), "Say what the job is");
  for (const [name, every, side, how] of [["Descale the glass washer", 7, "bar", "Machine empty, gloves on, run the descale cycle"],
    ["Deep clean the fridges and door seals", 28, "bar", ""], ["Clean the high chairs", 14, "floor", ""]]) {
    await O.fill("#j-name", name); await O.click(`[data-job-every="${every}"]`); await O.click(`[data-job-side="${side}"]`);
    if (how) await O.fill("#j-how", how);
    await O.click("#j-go");
    await O.waitForFunction((n) => LIVE.jobs.some((j) => j.name === n && !j.pending), name);
  }
  assert.equal(await attempt(S, () => LIVE.api.addJob("Fake job", 7, "bar", "")), "permission-denied");

  // Each phone shows its own side's jobs. None has been done yet, so they're all due.
  await logs(S); await S.waitForFunction(() => LIVE.jobs.length === 3);
  assert.equal(await due(S), "2 due");
  assert.match(await text(S, "#tally"), /Descale the glass washer Not logged in 5 weeks\s*Every week · Machine empty, gloves on, run the descale cycle/);
  assert.doesNotMatch(await text(S, "#tally"), /high chairs/);
  await logs(T); await T.waitForFunction(() => LIVE.jobs.length === 3);
  assert.equal(await due(T), "1 due");

  const id = (n) => S.evaluate((x) => LIVE.jobs.find((j) => j.name === x).id, n);
  const [washer, fridges, chairs] = [await id("Descale the glass washer"), await id("Deep clean the fridges and door seals"), await id("Clean the high chairs")];
  await S.fill(`[data-jn="${washer}"]`, "Used the last of the descaler"); await S.click(`[data-job="${washer}"]`);
  await waitToast(S, /^Done: Descale the glass washer$/);
  await S.click(`[data-job="${fridges}"]`);
  await S.waitForFunction(() => LIVE.cleans.length === 2 && !LIVE.cleans.some((r) => r.pending));
  assert.equal(await due(S), "", "nothing due once each one is done");
  const [nextWeek, nextMonth] = await S.evaluate(() => [dayName(addDays(shiftDay(), 7)), dayName(addDays(shiftDay(), 28))]);
  assert.match(await text(S, "#tally"), new RegExp(`Descale the glass washer Next due ${rx(nextWeek)}.*by Sam Staff · Used the last of the descaler`, "s"));
  assert.match(await text(S, "#tally"), new RegExp(`Deep clean the fridges and door seals Next due ${rx(nextMonth)}`));

  // A tick made by mistake can be taken back for 15 minutes, by whoever made it.
  const tick = (j) => S.evaluate((x) => LIVE.cleans.find((r) => r.job === x).id, j);
  assert.equal(await attempt(T, (x) => LIVE.api.unlogClean(x), await tick(washer)), "permission-denied");
  await S.click(`[data-jb-undo="${await tick(fridges)}"]`);
  await S.waitForFunction(() => LIVE.cleans.length === 1);
  assert.equal(await due(S), "1 due");

  // The floor job was last done 20 days ago and is due every 2 weeks, so it's overdue.
  const ago = await T.evaluate(() => addDays(shiftDay(), -20)), str = (s) => ({ stringValue: s });
  await adminWrite("cleans/oldtick00000000000000", { job: str(chairs), jobName: str("Clean the high chairs"), side: str("floor"), note: str(""), day: str(ago),
    uid: str("x"), name: str("Tia Staff"), at: { timestampValue: new Date(Date.now() - 20 * 864e5).toISOString() } });
  const since = await T.evaluate(() => dayName(addDays(shiftDay(), -6)));
  await T.waitForFunction(() => LIVE.cleans.some((r) => r.job && r.jobName === "Clean the high chairs"));
  assert.match(await text(T, "#tally"), new RegExp(`Clean the high chairs Overdue since ${rx(since)}`));
  await T.evaluate(() => show("notices"));
  assert.equal(await tile(T), "1 cleaning jobs due on the floor (hot)");
  await S.evaluate(() => show("notices"));
  assert.equal(await tile(S), "1 cleaning jobs due on the bar (hot)");

  // Managers see every job at a glance, the log as a spreadsheet, and who did what in Activity.
  await managers(O, "safety");
  const page = await text(O, "#msafety");
  assert.match(page, new RegExp(`Descale the glass washer Bar Next due ${rx(nextWeek)}\\s*Every week · last done .* by Sam Staff`));
  assert.match(page, new RegExp(`Clean the high chairs Floor Overdue since ${rx(since)}`));
  await O.click("#cleaning-csv");
  await O.waitForSelector("#cleaning-save");
  const { name, csv } = await O.evaluate(async () => { const a = document.querySelector("#cleaning-save"); return { name: a.download, csv: (await (await fetch(a.href)).text()).replace(/^\ufeff/, "") }; });
  assert.match(name, /^black-tap-cleaning-log-\d{4}-\d\d-\d\d\.csv$/);
  const lines = csv.split("\r\n");
  assert.equal(lines[0], "Night,Time,Side,Job,Note,By");
  assert.equal(lines.length, 3);
  assert.match(csv, /\r\n\d{4}-\d\d-\d\d,\d\d:\d\d,Bar,Descale the glass washer,Used the last of the descaler,Sam Staff/);
  assert.match(csv, new RegExp(`\\r\\n${ago},\\d\\d:\\d\\d,Floor,Clean the high chairs,,Tia Staff$`));
  await managers(O, "act"); await O.click('[data-act="cleaning"]');
  assert.match(await text(O, "#act"), /Sam Staff did a cleaning job: Descale the glass washer/);

  // Removing a job keeps its past ticks. (The jobs list is still open from before.)
  await managers(O, "safety");
  assert.ok(await O.$eval("#msafety details[data-keep=jobs]", (d) => d.open));
  await O.click(`[data-job-del="${fridges}"]`);
  await O.waitForFunction(() => LIVE.jobs.length === 2);
  assert.equal(await O.evaluate(() => LIVE.cleans.length), 2);
  assert.deepEqual([O.errs, S.errs, T.errs], [[], [], []]);
});
