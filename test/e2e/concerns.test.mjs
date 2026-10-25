// Report a concern end to end: photos, anonymous reports, who each one goes to, dealing with them, and withdrawing.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf } from "./helpers.mjs";

let site, browser, jpeg;
before(async () => {
  site = await serve(".emusite"); browser = await launch();
  // A small photo, drawn in the browser, for the photo picker.
  const g = await browser.newPage();
  const data = await g.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 240; const x = c.getContext("2d");
    x.fillStyle = "#6a5"; x.fillRect(0, 0, 320, 240); x.fillStyle = "#222"; x.fillRect(40, 40, 120, 90);
    return c.toDataURL("image/jpeg", 0.9);
  });
  jpeg = { name: "concern.jpg", mimeType: "image/jpeg", buffer: Buffer.from(data.split(",")[1], "base64") };
  await g.close();
});
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];
const text = (p) => p.$eval("#concerns", (e) => e.textContent);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// Fills in the form the way someone would, then sends it.
async function report(p, { reason, area, note = "", to, anon = false, photo = false }) {
  await p.evaluate(() => show("notices"));
  if (!(await p.$eval("#cn-form", (d) => d.open))) await p.click("#cn-form summary");
  await p.click(`[data-cn-reason="${reason}"]`);
  await p.selectOption("#cn-area", area);
  if (note) await p.fill("#cn-note", note);
  if (photo) { await p.setInputFiles("#cn-in", jpeg); await p.waitForSelector("#cn-form .photo img"); }
  await p.click(`[data-cn-to="${to}"]`);
  if (anon) await p.check("#cn-anon");
  await p.click("#cn-go");
}

test("an anonymous concern with a photo reaches managers only, without a name, and is dealt with", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  await report(S, { reason: "cleaning", area: "toilets", note: "Sink blocked", to: "managers", anon: true, photo: true });
  await waitToast(S, /^Sent anonymously to the managers$/);

  await M.evaluate(() => show("notices"));
  await M.waitForFunction(() => LIVE.concerns.length === 1 && !LIVE.concerns[0].pending);
  const c = await M.evaluate(() => LIVE.concerns[0]);
  assert.deepEqual([c.reason, c.area, c.to, c.anon, c.photos, "uid" in c, "name" in c], ["cleaning", "toilets", "managers", true, 1, false, false]);
  assert.match(await text(M), /Needs cleaning · Toilets.*Managers only.*Anonymous.*Sink blocked.*Sent anonymously/s);
  assert.doesNotMatch(await text(M), /Sam Staff/);
  await M.click("[data-cn-photos]");
  await M.waitForSelector("[data-cn-photos-of] img");
  assert.match(await M.$eval("[data-cn-photos-of] img", (i) => i.src), /^data:image\/jpeg;base64,/);

  // Nobody else on the team can see it, the sender included.
  for (const p of [S, T]) { await p.evaluate(() => show("notices")); assert.equal(await p.evaluate(() => LIVE.concerns.length), 0); }
  assert.match(await text(T), /No open concerns/);

  await O.evaluate(() => show("notices"));
  await O.waitForFunction(() => /1\s*open concerns/.test(document.querySelector("#dash").textContent));
  await M.fill("[data-cn-fixt]", "Unblocked the sink"); await M.click("[data-cn-fix]");
  await O.waitForFunction(() => LIVE.concerns[0]?.status === "closed");
  assert.match(await text(O), /No open concerns/);
  await O.click("[data-tpane=managers]"); await O.click("#msub [data-msub=act]"); await O.click('[data-act="concerns"]');
  const act = await O.$eval("#act", (e) => e.textContent);
  assert.match(act, /Someone \(anonymous\) reported a concern to the managers: Needs cleaning, Toilets/);
  assert.match(act, /Mia Manager dealt with a concern: Needs cleaning, Toilets/);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("concerns to the team carry the name, follow the side, and anyone can deal with them or withdraw their own", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, people);
  await T.evaluate(() => setMode("floor"));
  await report(S, { reason: "unkempt", area: "terrace", to: "bar" });
  await waitToast(S, /^Sent to the bar team$/);
  await report(S, { reason: "other", area: "bar", to: "all" });
  assert.equal(await toastOf(S), "Say what it is in the box");
  await S.fill("#cn-note", "Ice scoop left in the ice"); await S.click("#cn-go");
  await waitToast(S, /^Sent to everyone$/);

  // The floor phone shows the one for everyone, not the bar one. The owner sees both, with the name.
  await T.evaluate(() => show("notices"));
  await T.waitForFunction(() => /Ice scoop/.test(document.querySelector("#concerns").textContent));
  assert.deepEqual(await T.$$eval("#concerns article .meta b", (x) => x.map((e) => e.textContent)), ["Something else"]);
  await O.evaluate(() => show("notices"));
  await O.waitForFunction(() => LIVE.concerns.filter((x) => !x.pending).length === 2);
  assert.match(await text(O), /From Sam Staff/);

  assert.equal(await T.locator("[data-cn-del]").count(), 0, "only the sender or a manager can take it down");
  await T.click("[data-cn-fix]");
  await S.waitForFunction(() => LIVE.concerns.find((x) => x.to === "all")?.status === "closed");
  assert.equal(await S.evaluate(() => LIVE.concerns.find((x) => x.to === "all").fixedBy), "Tia Staff");
  await S.click("[data-cn-del]");
  await O.waitForFunction(() => !LIVE.concerns.some((x) => x.to === "bar"));
  assert.match(await text(O), /No open concerns/);
  assert.deepEqual([O.errs, S.errs, T.errs], [[], [], []]);
});
