// Start again (Maintenance settings): after testing, Maintenance saves a backup, types START AGAIN, and everything the
// team logged goes on every phone. The team, codes, lists, date labels and drinks stay.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const toastIs = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("Maintenance backs up, then wipes every log on every phone; the team, lists and labels stay", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff"]]);
  await O.evaluate(() => LIVE.api.label(null, "added", { item: "Lime juice", side: "bar", life: 2, on: true, station: "" }));
  await S.waitForFunction(() => LIVE.labels.some((x) => x.item === "Lime juice"));
  await S.evaluate(async () => {
    const k = "close", [a] = LISTS[k].items;
    await LIVE.api.setTask(k, a.id, a.t, "done");
    await LIVE.api.setRun(k, LISTS[k].title, "started", 0, 2);
    await LIVE.api.set86("Limes", true);
    await LIVE.api.logIt("bar", "low", "=Tonic, nearly out");
    await LIVE.api.sendReport("bar", "Bar handover\nAll good", "Bar · Close 2/40", []);
    await LIVE.api.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: true });
    await LIVE.api.countLine(ctId(shiftDay(), "Speed rail", "Smirnoff"), { day: shiftDay(), area: "Speed rail", item: "Smirnoff", unit: "bottle", full: 2, open: 45 });
    await LIVE.api.addPhoto("data:image/jpeg;base64,AAAA", "bar");
    const x = LIVE.labels.find((l) => l.item === "Lime juice");
    await LIVE.api.label(x, "opened", { useBy: addDays(shiftDay(), 2) });
  });
  await M.waitForFunction(() => LIVE.out.has("Limes") && LIVE.issues.length && LIVE.labels.some((l) => l.state === "open"));

  // Only Maintenance has it, and nobody else can delete the history.
  await part(M, "mgr").catch(() => {});
  assert.equal(await M.locator("#sa-backup").count(), 0);
  assert.equal(await attempt(M, async () => { const r = await LIVE.api.eventsOn([shiftDay()]); return LIVE.api.dropLog(r.find((e) => e.kind === "task").id); }), "permission-denied");

  await part(O, "mgr");
  assert.match(await O.textContent('[data-card="mgr"]'), /Start again.*Goes for good:.*Stays: the team and everyone's codes/);
  // Step 1: the backup, with everything that's about to go.
  const [dl] = await Promise.all([O.waitForEvent("download"), O.click("#sa-backup")]);
  const file = JSON.parse(await (await import("node:fs")).promises.readFile(await dl.path(), "utf8"));
  assert.equal(file.kind, "backup");
  for (const k of ["events", "outlog", "out", "counts", "issues", "reports", "shift-tasks", "shift-runs"]) assert.ok(file.data[k]?.length, `${k} in the backup`);
  assert.equal(file.data.photos, undefined, "photos stay out of the file");
  await O.waitForSelector("#sa-go");

  // Step 2: anything but START AGAIN wipes nothing.
  O.answer = "start"; await O.click("#sa-go"); await toastIs(O, /Nothing wiped/);
  assert.ok(await O.evaluate(() => LIVE.out.has("Limes")));
  O.answer = "start again"; await O.click("#sa-go");
  await toastIs(O, /^Done: \d+ records wiped/);

  // Gone on every phone: the 86 board, tonight's ticks, the count, issues, reports, photos, the open label.
  await S.waitForFunction(() => !LIVE.out.size && !LIVE.issues.length && !LIVE.events.length && !Object.keys(LIVE.tasks).length && !LIVE.draftPhotos.length);
  await S.click("[data-tab=count]"); await S.waitForSelector("#ct .ct-row");
  assert.equal(await S.evaluate(() => LIVE.counts.length), 0);
  assert.deepEqual(await S.evaluate(() => LIVE.labels.map((l) => [l.item, l.state])), [["Lime juice", "none"]]);
  assert.deepEqual(await M.evaluate(async () => { const b = await LIVE.api.backup(); return [b.reports.length, b.outlog.length, b.issues.length]; }), [0, 0, 0]);
  // Stays: the team and its codes. Sam carries on as normal.
  assert.equal(await S.evaluate(() => LIVE.staff.length), 3);
  assert.equal(await M.evaluate(() => LIVE.role), "manager");
  await S.evaluate(() => LIVE.api.set86("Mint", true));
  await M.waitForFunction(() => LIVE.out.has("Mint"));
  assert.equal(await O.locator("#sa-go").count(), 0, "step 2 closes once it's done");
  for (const p of [O, M, S]) assert.deepEqual(p.errs, []);
});
