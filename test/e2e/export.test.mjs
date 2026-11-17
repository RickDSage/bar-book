// Export (managers): every log read back from the shared database, filtered by nights, side, person and which logs,
// then out as an Excel workbook, CSV files, print or copy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const waitText = (p, sel, re) => p.waitForFunction(([s, r]) => new RegExp(r, "i").test((document.querySelector(s)?.innerText || "").replace(/\s+/g, " ")), [sel, re.source], { timeout: 15000 });
const lines = (p) => p.evaluate(() => Object.fromEntries(exTables().map((x) => [x.L.k, x.rows.length])));

test("a manager exports every log, filtered, as a workbook, CSV files and a table", async () => {
  await resetEmulators();
  const { M, S, O } = await team(browser, site, people);
  // Sam closes part of the bar, 86s limes and brings them back, logs a note, hands over and raises an issue.
  await S.evaluate(async () => {
    const k = "close", [a, b] = LISTS[k].items;
    await LIVE.api.setTask(k, a.id, a.t, "doing");
    await LIVE.api.setRun(k, LISTS[k].title, "started", 0, 2);
    await LIVE.api.setTask(k, a.id, a.t, "done");
    await LIVE.api.setTask(k, b.id, b.t, "done");
    await LIVE.api.set86("Limes", true);
  });
  await S.waitForFunction(() => LIVE.out.has("Limes"));
  await S.evaluate(async () => {
    await LIVE.api.set86("Limes", false);
    await LIVE.api.logIt("bar", "low", "=Tonic, nearly out");
    await LIVE.api.sendReport("bar", "Bar handover\nAll good", "Bar · Close 2/40", []);
    await LIVE.api.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: true });
    await LIVE.api.countLine(ctId(shiftDay(), "Speed rail", "Smirnoff"), { day: shiftDay(), area: "Speed rail", item: "Smirnoff", unit: "bottle", full: 2, open: 45 });
  });
  // Mia finishes the section Sam started: a take over.
  await M.evaluate(async () => { const it = LISTS.close.items.find((x) => x.g === LISTS.close.items[0].g && x.id !== LISTS.close.items[0].id && x.id !== LISTS.close.items[1].id); if (it) await LIVE.api.setTask("close", it.id, it.t, "done"); });

  // Staff don't get it.
  await S.evaluate(() => show("notices"));
  assert.equal(await S.locator('[data-card="export"]').count(), 0);

  await part(M, "export");
  await waitText(M, "#tc-export", /Closing ticks \d+ lines/);
  const n = await lines(M);
  assert.equal(n.out, 2);
  assert.equal(n.logit, 1);
  assert.equal(n.handover, 1);
  assert.equal(n.issues, 1);
  assert.equal(n.count, 1);
  assert.ok(n.closing >= 3);
  assert.equal(n.lists, 1);
  // Who did each section, and who took over.
  const sec = await M.evaluate(() => exTables().find((x) => x.L.k === "sections").rows);
  assert.ok(sec.some((r) => r[5] === "Sam Staff" && (r[6] === "Mia Manager" ? r[7] === "Yes" : r[6] === "Sam Staff")));
  // 86 back in says how long it was out.
  assert.match(await M.evaluate(() => exTables().find((x) => x.L.k === "out").rows.at(-1).join("|")), /Limes\|Back in\|Sam Staff\|0 min/);
  // Stock count: the open bottle as a fraction and the total.
  assert.deepEqual(await M.evaluate(() => exTables().find((x) => x.L.k === "count").rows[0].slice(2)), ["Speed rail", "Smirnoff", 2, 0.45, 2.45, "bottle", "Sam Staff"]);

  // Floor only: the bar's lines go, things for both sides (86s, stock) stay.
  await M.click('#tc-export [data-ex-side="floor"]');
  let f = await lines(M);
  assert.equal(f.closing, 0); assert.equal(f.logit, 0); assert.equal(f.out, 2); assert.equal(f.count, 1);
  await M.click('#tc-export [data-ex-side="all"]');
  // One person.
  await M.selectOption("#tc-export [data-ex-who]", "Mia Manager");
  f = await lines(M);
  assert.equal(f.out, 0); assert.equal(f.logit, 0);
  await M.selectOption("#tc-export [data-ex-who]", "");

  // Untick everything but Log it: the files hold that log only.
  await M.click('#tc-export [data-ex-all="0"]');
  await M.check('#tc-export [data-ex-log="logit"]');
  assert.deepEqual(await M.evaluate(() => exPicked().map((x) => x.L.k)), ["logit"]);
  const csv = await M.evaluate(() => { const x = exPicked()[0]; return toCsv(x.head, x.rows); });
  assert.ok(csv.startsWith("﻿Shift date,Time,Side,Kind,What,By\r\n"));
  // A cell that looks like a formula is made safe.
  assert.match(csv, /,Bar,Running low,"'=Tonic, nearly out",Sam Staff/);

  // The workbook: a real zip with a tab per log plus About, opened by node here and by Excel-type readers by hand.
  await M.click('#tc-export [data-ex-all="1"]');
  const b64 = await M.evaluate(async () => { const xs = exPicked(); const blob = exXlsx([...xs.map((x) => [x.L.n, x.head, x.rows]), ["About this export", ["About", "Detail"], exAbout()]]);
    const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); });
  const buf = Buffer.from(b64, "base64");
  if (process.env.EX_OUT) fs.writeFileSync(process.env.EX_OUT, buf);
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const s = buf.toString("utf8");
  assert.match(s, /<sheet name="Closing ticks"/);
  assert.match(s, /<sheet name="About this export"/);
  assert.match(s, /formatCode="dd\/mm\/yyyy"/);

  // Word: a real .docx with each log as a table.
  const d64 = await M.evaluate(async () => { const u = new Uint8Array(await exDocx(exPicked()).arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); });
  const dbuf = Buffer.from(d64, "base64");
  if (process.env.DOCX_OUT) fs.writeFileSync(process.env.DOCX_OUT, dbuf);
  assert.equal(dbuf.readUInt32LE(0), 0x04034b50);
  assert.match(dbuf.toString("utf8"), /<w:tbl>.*Closing ticks|Closing ticks.*<w:tbl>/s);

  // The table to read or print: nothing wider than the phone.
  await M.locator("#tc-export .ex-prev summary").first().click();
  assert.ok(await M.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual([...M.errs, ...S.errs, ...O.errs], []);
});

const tab = (p) => p.click('#tc-export [data-ex-tab="in"]');
const upload = async (p, kind, name, text) => {
  await p.click(`#tc-export [data-im-kind="${kind}"]`);
  await p.setInputFiles("#tc-export [data-im-file]", { name, mimeType: name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv", buffer: Buffer.from(text) });
  await waitText(p, "#tc-export", /3\. Check it, then save|im-err|: /);
  await p.waitForFunction(() => IM.plan || IM.err);
  return p.evaluate(() => IM.err || IM.plan.map((x) => `${x.st}${x.why ? ": " + x.why : ""}`));
};

test("a manager imports a spreadsheet: preview first, saves new and changed lines, never deletes", async () => {
  await resetEmulators();
  const { M, S, O } = await team(browser, site, people);
  await M.evaluate(() => LIVE.api.label(null, "added", { item: "Apple juice", side: "bar", life: 3, on: true }));
  await M.waitForFunction(() => LIVE.labels.some((x) => x.item === "Apple juice" && !x.pending));
  await part(M, "export");
  await tab(M);
  await waitText(M, "#tc-export", /1\. Get the template/);

  // Date labels from Numbers or Excel saved as CSV with semicolons: a new one, a change, one the same, two that can't go in.
  const plan = await upload(M, "labels", "labels.csv", "Item;Side;Keeps (days);On the list;Station\r\nApple juice;Bar;5;Yes;\r\nMint;bar;2;yes;Garnish station\r\nCream;Kitchen;2;Yes;\r\nLime juice;Floor;0;Yes;\r\n");
  assert.deepEqual(plan, ["change", "new", "skip: Side must be Bar or Floor", "skip: Keeps (days) must be a whole number, 1 to 365"]);
  assert.equal(await M.evaluate(() => LIVE.labels.length), 1, "nothing saved before Save");
  await M.click("#tc-export [data-im-save]");
  await waitText(M, "#tc-export", /Saved 2/);
  await S.waitForFunction(() => LIVE.labels.find((x) => x.item === "Apple juice")?.life === 5 && LIVE.labels.some((x) => x.item === "Mint" && x.station === "Garnish station"));

  // Names: adds and moves, keeps everyone not in the file.
  assert.deepEqual(await upload(M, "names", "names.csv", "Name,Role\nZoe,Bar\nEmily,Floor\nKadir,Bar\nBob,Chef"), ["new", "change", "same", "skip: Role must be Manager, Bar or Floor"]);
  await M.click("#tc-export [data-im-save]");
  await S.waitForFunction(() => STAFF.bar.includes("Zoe") && STAFF.floor.includes("Emily") && !STAFF.bar.includes("Emily") && STAFF.mgr.includes("Hassan"));

  // A stock count file straight from Export goes back in; the Open column is a part (0.45).
  const day = await M.evaluate(() => shiftDay());
  assert.deepEqual(await upload(M, "count", "stock-counts.csv", `\uFEFFShift date,Time,Place,Item,Full,Open,Total,Unit,Counted by\r\n${day},21:00,Speed rail,Smirnoff,2,0.45,2.45,bottle,Sam\r\n2999-01-01,21:00,Speed rail,Smirnoff,1,0,1,bottle,Sam\r\n`), ["new", "skip: Count date is in the future"]);
  await M.click("#tc-export [data-im-save]");
  await waitText(M, "#tc-export", /Saved 1/);
  assert.equal(await M.evaluate(async () => (await LIVE.api.daysOf("counts", shiftDay(), shiftDay(), 10)).map((x) => `${x.item} ${x.full} ${x.open}`).join()), "Smirnoff 2 45");

  // Stock setup from the Excel template: change Smirnoff's weights, round trip through a real .xlsx.
  const x64 = await M.evaluate(async () => { const K = IM_KINDS.setup, rows = K.tpl().map((r) => (r[0] === "Smirnoff" ? [r[0], r[1], "bottle", 700, 520, 1180, "", "Yes"] : r));
    const u = new Uint8Array(await exXlsx([[K.n, K.cols, rows]]).arrayBuffer()); let s = ""; for (const c of u) s += String.fromCharCode(c); return btoa(s); });
  await M.click('#tc-export [data-im-kind="setup"]');
  await M.setInputFiles("#tc-export [data-im-file]", { name: "setup.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(x64, "base64") });
  await M.waitForFunction(() => IM.plan || IM.err);
  assert.deepEqual(await M.evaluate(() => IM.err || IM.plan.filter((x) => x.st !== "same").map((x) => x.line)), ["Smirnoff · Speed rail · bottle · 700 ml · 520 to 1180 g"]);
  await M.click("#tc-export [data-im-save]");
  await S.waitForFunction(() => LIVE.countSetup?.items?.Smirnoff?.f === 1180);

  // A manager's new item waits for Maintenance; one in Bar Book's own list is skipped.
  assert.deepEqual(await upload(M, "items", "items.csv", "Item,Side,Group,Kind,Kept in,Date label,Keeps (days),At close,Note\nYuzu purée,Bar,Fruit,Purée,Fridge,Yes,7,,\nSmirnoff,Bar,Spirits,Spirit,Back bar,No,0,,"), ["new", "skip: Already in Bar Book's own list"]);
  await M.click("#tc-export [data-im-save]");
  await O.waitForFunction(() => LIVE.items.some((x) => x.item === "Yuzu purée" && x.status === "waiting"));

  // Nothing is deleted: Apple juice is still there after files without it.
  assert.ok(await M.evaluate(() => LIVE.labels.some((x) => x.item === "Apple juice")));
  assert.ok(await M.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual([...M.errs, ...S.errs, ...O.errs], []);
});
