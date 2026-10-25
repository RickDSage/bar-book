// Closing photos end to end: shrinking a phone photo, notes, deleting, sending with a report, the 8-photo cap,
// who can change what once it's sent, and the 30-day clear-out.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { serve, resetEmulators, launch, team, attempt, adminWrite, adminGet } from "./helpers.mjs";

let site, browser, dir, big, small;
before(async () => {
  site = await serve(".emusite"); browser = await launch();
  // A noisy 12-megapixel "phone photo" and a tiny one, drawn in the browser.
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "bar-book-photos-"));
  const g = await browser.newPage();
  const draw = (w, h) => g.evaluate(([w, h]) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    for (let i = 0; i < 4000; i++) { x.fillStyle = `hsl(${Math.random() * 360},70%,${30 + Math.random() * 50}%)`; x.fillRect(Math.random() * w, Math.random() * h, 60 + Math.random() * 300, 60 + Math.random() * 300); }
    // Grain on every pixel, so it compresses about as badly as a real photo.
    const px = x.getImageData(0, 0, w, h);
    for (let i = 0; i < px.data.length; i++) px.data[i] = Math.min(255, Math.max(0, px.data[i] + (Math.random() - 0.5) * 60));
    x.putImageData(px, 0, 0);
    return c.toDataURL("image/jpeg", 0.95);
  }, [w, h]);
  big = path.join(dir, "big.jpg"); small = path.join(dir, "small.jpg");
  fs.writeFileSync(big, Buffer.from((await draw(4032, 3024)).split(",")[1], "base64"));
  fs.writeFileSync(small, Buffer.from((await draw(320, 240)).split(",")[1], "base64"));
  await g.close();
});
after(async () => { await browser.close(); site.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// "Take a photo" is a label for the camera input; the test hands the input a file as the camera would.
const addPhoto = async (p, file, n) => {
  await p.waitForSelector('label[for="ph-in"]');
  await p.setInputFiles("#ph-in", file);
  await p.waitForFunction((n) => LIVE.myPhotos.length === n, n, { timeout: 20000 });
};

test("a phone photo is shrunk, noted, sent with the report and locked once sent", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  assert.ok(fs.statSync(big).size > 1e6, "the test photo is a few MB");
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await addPhoto(S, big, 1);
  const data = await S.evaluate(() => LIVE.myPhotos[0].data);
  assert.ok(data.startsWith("data:image/jpeg;base64,") && data.length <= 600000, `stored as a JPEG of ${data.length} characters`);
  await addPhoto(S, big, 2);
  await S.fill("[data-ph-note] >> nth=0", "Back bar wiped and restocked"); await S.press("[data-ph-note] >> nth=0", "Tab");
  await S.waitForFunction(() => LIVE.myPhotos[0].note === "Back bar wiped and restocked");
  await S.click("[data-ph-del] >> nth=1");
  await S.waitForFunction(() => LIVE.myPhotos.length === 1);
  const mine = await S.evaluate(() => LIVE.myPhotos[0].id);
  assert.equal(await attempt(O, (id) => LIVE.api.notePhoto(id, "Not yours"), mine), "permission-denied", "nobody else can change a photo before it's sent");

  await S.click(".ptabs [data-pane=send]"); await S.click("#t-copy");
  await S.waitForFunction(() => LIVE.myPhotos.length === 0);
  await O.waitForFunction(() => LIVE.reports.length === 1);
  assert.match(await O.evaluate(() => LIVE.reports[0].summary), / · 1 photo$/);
  assert.equal(await O.evaluate(() => LIVE.reports[0].photos), 1);
  await O.evaluate(() => show("notices")); await O.click("[data-tpane=reports]"); await O.click("[data-photos]");
  await O.waitForSelector("[data-photos-of] img");
  assert.match(await O.$eval("[data-photos-of]", (e) => e.innerText), /Back bar wiped and restocked/);

  assert.equal(await attempt(S, (id) => LIVE.api.notePhoto(id, "Changed later"), mine), "permission-denied");
  assert.equal(await attempt(S, (id) => LIVE.api.deletePhoto(id), mine), "permission-denied");
  assert.equal(await attempt(O, (id) => LIVE.api.deletePhoto(id), mine), "permission-denied", "a manager can't delete it inside the 30 days either");
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("eight photos is the most for one report", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  for (let n = 1; n <= 8; n++) await addPhoto(S, small, n);
  await S.waitForFunction(() => /8 photos is the most for one report/.test(document.querySelector("#tally").innerText));
  assert.equal(await S.$('label[for="ph-in"]'), null, "no button for a ninth");
  await S.click(".ptabs [data-pane=send]"); await S.click("#t-copy");
  await S.waitForFunction(() => LIVE.myPhotos.length === 0 && LIVE.reports.length === 1 && !LIVE.reports[0].pending);
  assert.equal(await S.evaluate(() => LIVE.reports[0].photos), 8);
  assert.deepEqual(S.errs, []);
});

test("a photo isn't lost when a teammate ticks something while the camera is open", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await S.waitForSelector('label[for="ph-in"]');
  const camera = await S.$("#ph-in");
  await O.evaluate(() => LIVE.api.tick("close", 2, true));
  await S.waitForFunction(() => (LIVE.ticks.close || []).includes(2));
  assert.equal(await camera.evaluate((e) => e.isConnected), true, "the list was redrawn but the camera input is the same one");
  await camera.setInputFiles(small);
  await S.waitForFunction(() => LIVE.myPhotos.length === 1, null, { timeout: 20000 });
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("photos older than 30 days are cleared when a manager opens the app", async () => {
  await resetEmulators();
  const { O } = await team(browser, site);
  const old = new Date(Date.now() - 40 * 864e5).toISOString(), recent = new Date(Date.now() - 5 * 864e5).toISOString();
  const photo = (at) => ({ data: { stringValue: "data:image/jpeg;base64,AAAA" }, note: { stringValue: "" }, report: { stringValue: "abcdefghijklmnopqrst" }, uid: { stringValue: "someone" }, name: { stringValue: "Sam Staff" }, at: { timestampValue: at } });
  await adminWrite("photos/old1", photo(old)); await adminWrite("photos/new1", photo(recent));
  await O.reload(); await O.click("#w-ok");
  await O.waitForFunction(() => LIVE.owner);
  for (let i = 0; i < 40 && (await adminGet("photos/old1")).status !== 404; i++) await O.waitForTimeout(250);
  assert.equal((await adminGet("photos/old1")).status, 404, "the 40-day-old photo is gone");
  assert.equal((await adminGet("photos/new1")).status, 200, "the 5-day-old one stays");
  assert.deepEqual(O.errs, []);
});
