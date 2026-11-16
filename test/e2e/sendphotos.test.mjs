// Photos on the Send page: a message's own photos (a concern's, a drink's house photo, tonight's closing photos with the
// handover, the rota as a picture) and photos added there, sent through the phone's share sheet. The words are copied
// with their own tap and the share sheet gets the photos alone, because an iPhone given both drops the photos
// (WebKit bug 251500). The share sheet and the clipboard are stood in for, as a phone that can share files.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser, jpeg, data;
before(async () => {
  site = await serve(".emusite"); browser = await launch();
  const g = await browser.newPage();
  data = await g.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
    x.fillStyle = "#6a5"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#222"; x.fillRect(80, 80, 240, 180);
    return c.toDataURL("image/jpeg", 0.9);
  });
  jpeg = (n) => ({ name: `photo${n}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(data.split(",")[1], "base64") });
  await g.close();
});
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const stubShare = (p) => p.evaluate(() => {
  window.shared = null; window.copied = null;
  navigator.canShare = () => true;
  navigator.share = (d) => { window.shared = { text: d.text, files: (d.files || []).map((f) => [f.name, f.type, f.size > 1000]) }; return Promise.resolve(); };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.copied = t; return Promise.resolve(); } } });
  addEventListener("click", (e) => { if (e.target.closest("a[data-share]")) e.preventDefault(); }, true);
});
const preview = (p) => p.$eval("#send-pre", (e) => e.textContent);
const actions = (p) => p.$$eval("#send .actions .btn", (x) => x.map((b) => b.textContent));
const addButtons = (p) => p.$$eval("#send .addph label", (x) => x.map((l) => [l.htmlFor, l.textContent]));
const photosReady = (p, n) => p.waitForFunction((n) => snd?.photos.length === n && snd.files?.length === n, n, { timeout: 20000 });

test("photos added to an issue: copy the words, then the share sheet gets the photos on their own", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [people[1]]);
  await S.evaluate(() => LIVE.api.raise({ title: "Glass washer leaking", detail: "Water under the machine", area: "bar", urgent: true, again: null }));
  await part(S, "issues");
  await S.waitForSelector("#tc-issues [data-send=issue]");
  await stubShare(S);
  await S.click("#tc-issues [data-send=issue]");
  assert.equal(await S.$eval("#sh-name", (e) => e.textContent), "An issue");
  assert.match(await preview(S), /^Urgent: Glass washer leaking · Black Tap Soho\nBar, raised .+\nNobody on it yet\n\nMore detail\nWater under the machine$/);
  assert.equal(await S.getAttribute("#send-note", "placeholder"), "When can you come?");
  // No photos yet: WhatsApp is the main button and there's nothing to send through the share sheet but the words.
  assert.deepEqual(await actions(S), ["WhatsApp", "Email", "Other apps…", "Copy", "Print"]);
  // Photos come from the camera, or several at once from the phone's photos.
  assert.deepEqual(await addButtons(S), [["send-cam", "Take a photo"], ["send-in", "Choose from your photos"]]);
  assert.deepEqual(await S.evaluate(() => [document.querySelector("#send-cam").getAttribute("capture"), document.querySelector("#send-in").multiple]), ["environment", true]);

  await S.setInputFiles("#send-in", [jpeg(1), jpeg(2)]);
  await photosReady(S, 2);
  await S.setInputFiles("#send-cam", jpeg(3));
  await photosReady(S, 3);
  assert.equal(await S.$$eval("#send .sendph img", (x) => x.length), 3);
  assert.equal((await addButtons(S)).length, 2, "both buttons stay for more");
  assert.deepEqual(await actions(S), ["Copy the words", "Send with photos", "WhatsApp, words only", "Email", "Print"]);
  assert.deepEqual(await S.$$eval("#send .sendhow li", (x) => x.map((l) => l.textContent)),
    ["Tap Copy the words, then Send with photos.", "Pick WhatsApp, then the chat.", "Press and hold the caption box, tap Paste, then send."]);
  await S.click('[data-send-unphoto="1"]');
  await photosReady(S, 2);

  await S.fill("#send-note", "Can you come before 5?");
  // Two taps: Safari opens the share sheet only from a fresh tap, and copying first could use it up.
  await S.click("#send [data-send-copy]");
  await S.waitForFunction(() => window.copied);
  assert.match(await S.evaluate(() => window.copied), /^\*Urgent: Glass washer leaking · Black Tap Soho\*\n[\s\S]*\n\n\*Note\*\nCan you come before 5\?$/);
  assert.equal(await S.$eval("#toast", (e) => e.textContent), "Copied. Now tap Send with photos");
  await S.click("#send [data-send-sheet]");
  await S.waitForFunction(() => window.shared);
  assert.deepEqual(await S.evaluate(() => window.shared), { text: undefined, files: [["photo-1.jpg", "image/jpeg", true], ["photo-2.jpg", "image/jpeg", true]] });
  // WhatsApp on its own still takes the words.
  await S.click("#send [data-share][data-via=wa]");
  assert.match(new URL(await S.getAttribute("#send [data-share][data-via=wa]", "href")).searchParams.get("text"), /^\*Urgent: Glass washer leaking/);

  // Ten is the most; the rest are left out and it says so.
  await S.setInputFiles("#send-in", Array.from({ length: 11 }, (_, i) => jpeg(i + 3)));
  await photosReady(S, 10);
  assert.deepEqual(await addButtons(S), [], "no buttons for an eleventh");
  assert.match(await S.$eval("#send", (e) => e.textContent), /10 photos is the most\./);
  // Photos added here are only for this message.
  await S.click("#sh-close"); await S.waitForSelector("#sheet", { state: "hidden" });
  await S.click("#tc-issues [data-send=issue]");
  assert.equal(await S.evaluate(() => snd.photos.length), 0);
  assert.equal(await S.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  assert.deepEqual(S.errs, []);
});

test("a drink goes with its house photo, captioned, and Back goes back to the drink", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await M.evaluate((d) => LIVE.api.setMedia("Negroni", d, ""), data);
  await S.evaluate(() => openSheet(D.find((d) => d.name === "Negroni").id));
  await S.waitForFunction(() => LIVE.media?.photo);
  await stubShare(S);
  await S.click("#sheet [data-send=drink]");
  assert.equal(await S.$eval("#sh-name", (e) => e.textContent), "Negroni");
  await photosReady(S, 1);
  assert.equal(await preview(S), "Negroni · Black Tap Soho\nGlass: Rocks\nIce: 1 large cube\nGarnish: Orange slice\nAllergens: Sulphites (vermouth)\n\nSpec (3)\n• 25 ml Tanqueray\n• 25 ml Campari\n• 25 ml Martini Rosso\n\nMethod (2)\n• Stir 20 seconds\n• Strain over a large cube");
  // The photo carries the drink's name in a strip below it, so it still says what it is in the chat.
  const f = await S.evaluate(async () => { const b = await createImageBitmap(snd.files[0]); return [snd.files[0].name, snd.files[0].type, b.width, b.height]; });
  assert.deepEqual(f.slice(0, 3), ["negroni.jpg", "image/jpeg", 640]);
  assert.ok(f[3] > 480, "taller than the photo by the strip");
  await S.click("#sh-close");
  await S.waitForFunction(() => document.querySelector("#sheet .spec") && document.querySelector("#sh-name").textContent === "Negroni");
  await S.click("#sh-close");
  await S.waitForSelector("#sheet", { state: "hidden" });
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

