// Send with photos, or just save: the handover saves for the whole team either way, photos included, opens from a link
// on any phone or the iPad, and only whoever saved something (or a manager) can delete it. Work someone started shows
// for anyone to carry on. The share sheet is stood in for where a test needs one.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt, part } from "./helpers.mjs";

let site, browser, data;
before(async () => {
  site = await serve(".emusite"); browser = await launch();
  const g = await browser.newPage();
  data = await g.evaluate(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 240; const x = c.getContext("2d"); x.fillStyle = "#6a5"; x.fillRect(0, 0, 320, 240); return c.toDataURL("image/jpeg", 0.8); });
  await g.close();
});
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff"], ["T", "Tia Staff"]];
const addPhoto = async (p, n) => { await p.evaluate((d) => LIVE.api.addPhoto(d, "bar"), data); await p.waitForFunction((n) => draftPhotos().length === n, n); };

test("just save hands over without sending; anyone opens it from the link, photos included; only the sender or a manager deletes it", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, people);
  await addPhoto(S, 1);
  // Another person on the bar adds a photo part-way: it goes with the same handover.
  await T.waitForFunction(() => draftPhotos().length === 1);
  await addPhoto(T, 2);
  // Only whoever took a photo, or a manager, sees Delete, and the rules say the same.
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await S.waitForFunction(() => document.querySelectorAll("#tally .photo").length === 2);
  assert.equal(await S.$$eval("#tally [data-ph-del]", (x) => x.length), 1);
  const tias = await T.evaluate(() => draftPhotos().find((p) => p.uid === LIVE.uid).id);
  assert.equal(await attempt(S, (id) => LIVE.api.deletePhoto(id), tias), "permission-denied");
  // The close says the checklist goes with its photos, and saves itself.
  assert.match(await S.$eval("#tally [data-send=shift]", (e) => e.textContent), /^Send the checklist with 2 photos$/);

  await S.click(".ptabs [data-pane=send]");
  assert.match(await S.$eval("#t-save", (e) => e.textContent), /just save$/);
  S.answer = "unused";
  await S.click("#t-save");
  await S.waitForSelector("#ho-sent");
  assert.equal(await S.$eval("#sheet", (e) => e.hidden), true, "nothing opens to send");
  const id = await S.evaluate(() => sentTonight("bar").id);
  await M.waitForFunction((id) => LIVE.reports.some((r) => r.id === id && r.photos === 2), id);

  // The message's link opens the handover itself; it says the photos are there for a phone that can't attach them.
  const words = await S.evaluate((id) => shareText("report", true, id), id);
  assert.match(words, new RegExp(`📷 2 photos and the rest in Bar Book \\(team only\\): \\S+#at=rep:${id}$`));
  assert.doesNotMatch(words, /73019264/, "never the team code");
  await T.evaluate((id) => openLink(`#at=rep:${id}`), id);
  await T.waitForSelector("#rep-ph img");
  assert.equal(await T.$$eval("#rep-ph img", (x) => x.length), 2);
  assert.match(await T.$eval("#sh-name", (e) => e.textContent), /^Bar handover, /);
  assert.equal(await T.$$eval("#rep [data-rep-del]", (x) => x.length), 0, "not Tia's to delete");
  // Send from the handover, and Back comes back to it.
  await T.click("#rep [data-send=report]");
  await T.waitForSelector("#send");
  await T.click("#sh-close");
  await T.waitForSelector("#rep");
  assert.equal(await attempt(T, (id) => LIVE.api.deleteReport(id), id), "permission-denied");

  // Sam sent it, so Sam can delete it, and its photos go with it.
  T.answer = ""; S.answer = "";
  await S.click("#ho-sent ~ .actions [data-rep-del]");
  await M.waitForFunction((id) => !LIVE.reports.some((r) => r.id === id), id);
  assert.equal(await M.evaluate((id) => LIVE.api.loadPhotos(id).then((x) => x.length), id), 0);
  assert.deepEqual([M.errs, S.errs, T.errs], [[], [], []]);
});

test("a manager can delete anyone's photo or handover", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people.slice(0, 2));
  await addPhoto(S, 1);
  await M.waitForFunction(() => tonightPhotos().length === 1);
  const pid = await M.evaluate(() => tonightPhotos()[0].id);
  assert.equal(await attempt(M, (id) => LIVE.api.deletePhoto(id), pid), "allowed");
  await addPhoto(S, 1);
  await S.evaluate(() => LIVE.api.sendReport("bar", "Bar shift", "Bar · test", draftPhotos()));
  await M.waitForFunction(() => LIVE.reports.length === 1 && !LIVE.reports[0].pending);
  const id = await M.evaluate(() => LIVE.reports[0].id);
  await part(M, "reports"); await M.click("#tc-reports details summary");
  assert.equal(await M.$$eval("#tc-reports [data-rep-del]", (x) => x.length), 1);
  assert.equal(await attempt(M, (id) => LIVE.api.deleteReport(id), id), "allowed");
  await S.waitForFunction(() => LIVE.reports.length === 0);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});

test("work someone started shows for anyone to carry on, and the team hears about a saved draft", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, people);
  await S.evaluate(() => { const [i, t] = shown("close")[0]; return LIVE.api.setTask("close", i, t, "done"); });
  await S.click("[data-tab=tally]"); await S.click(".ptabs [data-pane=close]");
  await addPhoto(S, 1);
  await S.evaluate(() => LIVE.api.saveDraft("bar", { low: "Limes", issues: "", next: "", closer: "", noPhotos: "" }));
  // Tia's phone: the Team page says Sam started the bar, and Carry on takes her to the bar close.
  await T.evaluate(() => show("notices"));
  await T.waitForSelector("#tm-cards .carry");
  assert.match(await T.$eval("#tm-cards .carry", (e) => e.innerText), /Bar: started by Sam Staff[\s\S]*1 photo[\s\S]*handover draft saved by Sam Staff[\s\S]*anyone can carry on/);
  await T.click("#tm-cards [data-carry=bar]");
  await T.waitForSelector("#tally .addph");
  assert.equal(await T.evaluate(() => [mode, pane].join()), "bar,close");
  // Not shown to Sam on the Shift tab: it's Sam's own.
  assert.equal(await S.$$eval("#tally .carry", (x) => x.length), 0);
  // The draft and the photo came up as pop-ups, and stay in Since you were last here.
  assert.ok(await M.evaluate(() => changesSince(0).some((c) => /Sam Staff saved the bar handover so far: anyone can carry on/.test(c.msg))));
  assert.ok(await M.evaluate(() => changesSince(0).some((c) => /Sam Staff added a bar closing photo/.test(c.msg))));
  // Once handed over, it's no longer waiting on anyone.
  await S.evaluate(() => LIVE.api.sendReport("bar", "Bar shift", "Bar · test", draftPhotos()));
  await T.evaluate(() => show("notices"));
  await T.waitForFunction(() => !document.querySelector("#tm-cards .carry"));
  assert.deepEqual([M.errs, S.errs, T.errs], [[], [], []]);
});

test("the iPad has no WhatsApp: Send with photos goes to its share sheet, and a phone that can't attach photos gets the link", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, people.slice(1, 2));
  await addPhoto(S, 1);
  // An iPad (iPadOS says it's a Mac with a touch screen) that can share files.
  await S.evaluate(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15" });
    Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
    navigator.canShare = () => true; navigator.share = (d) => { window.shared = d.files.map((f) => f.name); return Promise.resolve(); };
  });
  await S.evaluate(() => openSend("shift"));
  await S.waitForFunction(() => snd.files?.length === 1 && snd.cards?.length);
  assert.equal(await S.$$eval("#send [data-via=wa]", (x) => x.length), 0, "no WhatsApp link on the iPad");
  assert.match(await S.$eval("#send .sendhow", (e) => e.textContent), /Pick Mail, Messages, AirDrop or Save to Files\./);
  await S.click("#send [data-send-sheet]");
  await S.waitForFunction(() => window.shared);
  assert.equal((await S.evaluate(() => window.shared)).length, 2, "the words as a picture, then the photo");
  await S.evaluate(() => closeSheet()); await S.waitForSelector("#sheet", { state: "hidden" });

  // A phone that can't share files: the words carry a link to tonight's photos.
  await S.evaluate(() => { navigator.canShare = () => false; });
  await S.evaluate(() => openSend("shift"));
  await S.waitForSelector("#send .sendph img");
  assert.match(await S.$eval("#send", (e) => e.textContent), /This phone can't attach photos from Bar Book\. The message carries a link to them instead/);
  assert.match(await S.$eval("#send-pre", (e) => e.textContent), /📷 1 photo and the rest in Bar Book \(team only\): \S+#at=photos:bar$/);
  assert.deepEqual(S.errs, []);
});
