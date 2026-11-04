// House photos and how-to videos on the drinks: managers add them on a drink, everyone logged in sees them there, live.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];

const flat = (s) => s.replace(/\s+/g, " ").trim();
const media = async (p) => flat(await p.$eval("#dmedia", (e) => e.innerText));
const waitToast = (p, text) => p.waitForFunction((t) => document.querySelector("#toast").textContent === t, text);
const openDrink = (p, name) => p.evaluate((n) => openSheet(D.find((d) => d.name === n).id), name);

test("a manager adds a drink's house photo and how-to video, and the team sees them on the drink", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  // Any JPEG will do: a picture of the screen.
  const jpeg = await M.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: 300, height: 400 } });

  await openDrink(S, "Negroni");
  assert.equal(await media(S), "", "nothing yet");
  assert.equal(await S.locator("#dm-box").count(), 0, "staff don't get the managers' box");

  await openDrink(M, "Negroni");
  await M.click("#dm-box summary");
  await M.setInputFiles("#dm-in", { name: "negroni.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await waitToast(M, "Photo saved on Negroni for everyone");
  // Sam has the drink open and the photo arrives: in the drawing's place at the top, and in full after the method.
  await S.waitForSelector("#dmedia img.dphoto");
  assert.equal(await S.$eval("#dmedia img", (i) => i.alt), "Negroni, as we serve it");
  assert.equal(await S.evaluate(() => LIVE.media.photo.startsWith("data:image/jpeg;base64,")), true);
  assert.equal(await S.evaluate(() => document.querySelector("#sh-g img").src === LIVE.media.photo), true);
  assert.equal(await S.evaluate(() => !!document.querySelector("#sh-g svg")), false, "the drawing has gone");
  assert.ok(await S.evaluate(() => document.querySelector("#dmedia").compareDocumentPosition(document.querySelector(".spec")) & Node.DOCUMENT_POSITION_PRECEDING), "the spec comes first");
  assert.equal(await media(S), "", "staff see the photo, not who added it");
  await M.waitForFunction(() => /Last changed by Mia Manager, .*\d\d:\d\d\.$/.test(document.querySelector("#dm-box p").innerText));
  // Tapping the photo at the top goes to it in full.
  await S.click("#sh-g img");
  await S.waitForFunction(() => { const r = document.querySelector(".dphoto").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });

  // The video link: only from the video sites.
  assert.equal(await M.$eval("#dm-box", (d) => d.open), true, "the box stays open");
  await M.fill("#dm-video", "https://evil.example/watch");
  await M.click("[data-dm-video-save]");
  await waitToast(M, "Paste a link to YouTube, Vimeo, Instagram, TikTok or Google Drive, starting https://");
  await M.fill("#dm-video", "https://youtu.be/abc123");
  await M.click("[data-dm-video-save]");
  await waitToast(M, "Video link saved");
  await S.waitForSelector('#dmedia a[href="https://youtu.be/abc123"]');
  assert.equal(await S.$eval("#dmedia a", (a) => [a.textContent, a.target, a.rel].join()), "Watch how it's made,_blank,noopener");
  assert.ok(await S.$("#dmedia img"), "the photo stays");

  // Staff can't change them, and the next drink shows nothing of this one's.
  assert.equal(await attempt(S, () => LIVE.api.setMedia("Negroni", "", "https://youtu.be/mine")), "permission-denied");
  await S.click('#sheet [data-go="1"]');
  await S.waitForFunction(() => document.querySelector("#sh-name")?.textContent !== "Negroni");
  assert.equal(await media(S), "");
  assert.deepEqual(await S.evaluate(() => [!!document.querySelector("#sh-g svg"), !!document.querySelector("#sh-g img")]), [true, false], "its drawing");
  await S.click('#sheet [data-go="-1"]');
  await S.waitForSelector("#dmedia img.dphoto");

  // Taking the photo off asks first (each test phone says yes) and leaves the video; taking the link off as well clears
  // the drink.
  const asked = new Promise((r) => M.once("dialog", (d) => r(d.message())));
  await M.click("[data-dm-photo-del]");
  assert.equal(await asked, "Remove the photo of Negroni for everyone?");
  await waitToast(M, "Photo removed");
  await S.waitForFunction(() => !document.querySelector("#dmedia img"));
  assert.equal(await media(S), "Watch how it's made");
  assert.ok(await S.$("#sh-g svg"), "the drawing is back");
  await M.click("[data-dm-video-del]");
  await waitToast(M, "Video link removed");
  await S.waitForFunction(() => document.querySelector("#dmedia").innerText.trim() === "");
  assert.equal(await M.evaluate(() => LIVE.media.photo + LIVE.media.video), "");
  assert.ok((await toastOf(S)) !== "Video link removed", "only the manager's own phone says so");
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
