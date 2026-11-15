// The staff-only team: joining with the team link (no login), live messages with the CODE RED banner, Got it, custom
// templates, 86 updates in the banner, messages to the manager (named or anonymous), the incident form and the
// Team only shift rating, and taking every phone off by changing the team code.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, phone, adminWrite, afterReload, TEAM_CODE } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const flat = (s) => s.replace(/\s+/g, " ").trim();

test("joining: the team link and a name, no login; a wrong code is refused", async () => {
  await resetEmulators();
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const p = await c.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(`${site.url}#join=${TEAM_CODE}`);
  // The link's code is kept and taken out of the address bar, so a screenshot of the page doesn't show it.
  assert.equal(await p.evaluate(() => location.hash), "");
  await p.click('[data-w-name="Kadir"]');
  await p.click("#w-ok");
  await p.waitForFunction(() => LIVE.me === "Kadir" && LIVE.anon && LIVE.role === "staff");
  assert.equal(await p.evaluate(() => LIVE.admin), false);
  // Changing name keeps the same phone on the team.
  const uid = await p.evaluate(() => LIVE.uid);
  await p.evaluate(() => setName("Emily"));
  await p.waitForFunction(() => LIVE.me === "Emily");
  assert.equal(await p.evaluate(() => LIVE.uid), uid);

  // Without the right code, nothing.
  const q = await phone(browser, site);
  const err = await q.evaluate(() => LIVE.api.join("wrong-code-123", "Vi").then(() => "allowed", (e) => e.message));
  assert.notEqual(err, "allowed");
  await q.evaluate(() => show("notices"));
  assert.match(flat(await q.$eval("#tm-top", (e) => e.innerText)), /Join the team .* Team code .* Owner or manager login/i);
  assert.deepEqual([p.errs, q.errs], [[], []]);
});

test("live messages: CODE RED on every phone until Got it, seen by, side and templates", async () => {
  await resetEmulators();
  const { A, B, F } = await team(browser, site, [["A", "Angel"], ["B", "Emily"], ["F", "Pema"]]);
  await F.evaluate(() => setMode("floor"));
  await A.evaluate(() => show("notices"));
  await A.click('[data-lvl="urgent"]');
  await A.fill("#m-text", "Need a hand at the bar now");
  await A.click("#m-wa"); // WhatsApp too is ticked for urgent ones: untick it for the test.
  await A.click("#m-go");
  await waitToast(A, /^CODE RED sent to everyone's phone$/);

  for (const p of [B, F]) {
    await p.waitForSelector("#bcast .bcast.lv-urgent");
    assert.match(flat(await p.$eval("#bcast", (e) => e.innerText)), /^CODE RED · Angel · .* 🔴 Need a hand at the bar now Got it$/);
    assert.equal(await p.evaluate(() => document.documentElement.classList.contains("codered")), true);
  }
  // The sender's own phone doesn't shout at them.
  assert.equal(await A.$$eval("#bcast .bcast", (x) => x.length), 0);
  await B.click("#bcast [data-bc-ok]");
  await B.waitForFunction(() => !document.querySelector("#bcast .bcast") && !document.documentElement.classList.contains("codered"));
  await A.waitForFunction(() => /Seen by Emily/.test(document.querySelector("#tm-msgs").innerText));
  // Still red on the floor until Pema taps it.
  assert.equal(await F.$$eval("#bcast .bcast.lv-urgent", (x) => x.length), 1);

  // An ASAP for the bar only: amber on the bar, nothing on the floor.
  await B.evaluate(() => LIVE.api.post("Need ice at the bar", "bar", "asap"));
  await A.waitForSelector("#bcast .bcast.lv-asap");
  await F.waitForFunction(() => LIVE.notices.length === 2);
  assert.equal(await F.$$eval("#bcast .bcast.lv-asap", (x) => x.length), 0);

  // A template the team makes is on every phone.
  await A.click('[data-lvl="asap"]');
  await A.fill("#m-text", "Keg change at the bar");
  await A.click("details.tpl summary");
  await A.click("#tpl-save");
  await waitToast(A, /^Saved for everyone$/);
  await F.waitForFunction(() => LIVE.templates.some((t) => t.text === "Keg change at the bar" && t.level === "asap"));
  assert.deepEqual([A.errs, B.errs, F.errs], [[], [], []]);
});

test("86 updates show in the banner on the other phones", async () => {
  await resetEmulators();
  const { A, B } = await team(browser, site, [["A", "Angel"], ["B", "Kadir"]]);
  const drink = await A.evaluate(() => D[0].name);
  await A.evaluate((n) => setOut(n, true), drink);
  await B.waitForSelector("#bcast .bcast.lv-out");
  assert.equal(flat(await B.$eval("#bcast .lv-out p", (e) => e.innerText)).startsWith(`🚫 ${drink} is 86'd (Angel,`), true);
  // Anyone can bring it back.
  await B.evaluate((n) => setOut(n, false), drink);
  await A.waitForFunction((n) => !LIVE.out.has(n) && !!document.querySelector("#bcast .lv-out"), drink);
  await B.click("#bc-out-ok");
  assert.equal(await B.$$eval("#bcast .bcast", (x) => x.length), 0);
  assert.deepEqual([A.errs, B.errs], [[], []]);
});

test("to the manager: named or anonymous, only the manager sees them, and the reply comes back", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, [["M", "Illias", "illias", "manager"], ["S", "Vi"], ["T", "PK"]]);
  await part(S, "ask");
  await S.waitForSelector("#ask-go");
  assert.equal(await S.$eval("#ask-go", (b) => b.textContent), "Send to Illias");
  await S.fill('[data-ask="when"]', "Sat 22 Nov");
  await S.fill('[data-ask="text"]', "Family wedding");
  await S.click("#ask-go");
  await waitToast(S, /^Sent to Illias$/);
  await S.click('[data-ask-kind="complaint"]');
  await S.fill('[data-ask="text"]', "Rota changed with no notice");
  await S.check('[data-ask="anon"]');
  await S.click("#ask-go");
  await waitToast(S, /^Sent to Illias$/);

  await M.waitForFunction(() => LIVE.asks.length === 2);
  const asks = await M.evaluate(() => LIVE.asks.map((a) => ({ kind: a.kind, anon: a.anon, name: a.name ?? null, uid: a.uid ?? null })).sort((a, b) => a.kind.localeCompare(b.kind)));
  assert.equal(asks[0].kind, "complaint"); assert.equal(asks[0].anon, true); assert.equal(asks[0].name, null); assert.equal(asks[0].uid, null);
  assert.equal(asks[1].kind, "dayoff"); assert.equal(asks[1].name, "Vi");
  // The rest of the team sees none of it.
  assert.equal(await T.evaluate(() => LIVE.asks.length), 0);
  assert.equal(await S.evaluate(() => LIVE.asks.length), 1);

  const id = await M.evaluate(() => LIVE.asks.find((a) => a.kind === "dayoff").id);
  await M.evaluate((id) => LIVE.api.answer(id, "done", "Fine, enjoy it"), id);
  await S.waitForFunction(() => LIVE.asks[0]?.status === "done" && LIVE.asks[0].reply === "Fine, enjoy it" && LIVE.asks[0].by === "Illias");
  assert.deepEqual([M.errs, S.errs, T.errs], [[], [], []]);
});

test("incident report says accident book and duty manager; Team only rating never touches the cloud", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Anub"]]);
  await part(S, "incident");
  await S.waitForSelector("#tc-incident .warnbox");
  assert.match(await S.$eval("#tc-incident .warnbox", (e) => e.innerText), /^Write it in the venue's accident book and tell the duty manager straight away\./);
  await S.fill('[data-inc="where"]', "Stairs");
  await S.fill('[data-inc="what"]', "Guest slipped on the stairs");
  await S.check('[data-inc="firstAid"]');
  const msg = await S.evaluate(() => shareText("incident", false));
  assert.match(msg, /Guest slipped on the stairs/);
  assert.match(msg, /✅ First aid given/);
  assert.match(msg, /⬜ Written in the accident book/);
  assert.match(msg, /⬜ Duty manager told/);

  await part(S, "rate");
  await S.click('[data-rate="7"]');
  await S.fill('[data-rt="feel"]', "Short-staffed again");
  const rate = await S.evaluate(() => shareText("rate", false));
  assert.match(rate, /7 out of 10 from Anub/);
  assert.match(rate, /Short-staffed again/);
  // There's no API for it at all.
  assert.equal(await S.evaluate(() => Object.keys(LIVE.api).some((k) => /rate|pulse/i.test(k))), false);
  assert.deepEqual(S.errs, []);
});

test("changing the team code takes every staff phone off; the owner and manager stay", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Derek"]]);
  await adminWrite("config/team", { code: { stringValue: "a-brand-new-code-456" } });
  const r = await S.evaluate(() => LIVE.api.post("Hello", "all", "info").then(() => "allowed", (e) => e.code));
  assert.equal(r, "permission-denied");
  assert.equal(await O.evaluate(() => LIVE.api.post("Owner here", "all", "info").then(() => "allowed", (e) => e.code)), "allowed");
  // The new link lets them back in.
  await S.evaluate(() => LIVE.api.join("a-brand-new-code-456", "Derek"));
  assert.equal(await S.evaluate(() => LIVE.api.post("Back", "all", "info").then(() => "allowed", (e) => e.code)), "allowed");
});

test("a phone taken off the team stays off until it opens the link again", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Mounika"]]);
  const uid = await S.evaluate(() => LIVE.uid);
  await O.evaluate((u) => LIVE.api.remove(LIVE.staff.find((p) => p.uid === u)), uid);
  // The phone resets to the welcome screen, forgets the team code and says why.
  await afterReload(S);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal(await S.evaluate(() => [LIVE.me, store.get("team")].join("|")), "|");
  await S.evaluate(() => show("notices"));
  assert.match(await S.$eval("#tm-top", (e) => e.innerText), /You were taken off the team on this phone/);
  await O.waitForFunction(() => LIVE.staff.length === 1);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("issues: raise, take on, give to someone, fix, and raise again", async () => {
  await resetEmulators();
  const { O, S, T } = await team(browser, site, [["S", "Kadir"], ["T", "Pema"]]);
  await part(S, "issues");
  await S.click("#is-form summary"); await S.click("#is-go");
  await waitToast(S, /^Say what's wrong and where$/);
  await S.fill("[data-is=title]", "Glass washer leaking"); await S.selectOption("[data-is=area]", "bar");
  await S.fill("[data-is=detail]", "Water under the machine"); await S.check("[data-is=urgent]"); await S.click("#is-go");
  await waitToast(T, /^Urgent: Glass washer leaking$/);
  const id = await T.evaluate(() => LIVE.issues[0].id);
  // Anyone on the team gives it to someone.
  await part(T, "issues");
  await T.selectOption(`[data-give="${id}"]`, { label: "Kadir" });
  await waitToast(S, /^Pema gave you: Glass washer leaking$/);
  await S.waitForFunction(() => /On it: Kadir/.test(document.querySelector("#tc-issues").innerText));
  await S.fill(`[data-fixt="${id}"]`, "Tightened the hose");
  await S.click(`[data-fix="${id}"]`);
  await O.waitForFunction(() => LIVE.issues[0]?.status === "fixed" && LIVE.issues[0].fix === "Tightened the hose");
  // Still broken raises a new one linked to the old.
  await S.click("#tc-issues details.setup:not(#is-form) summary");
  await S.click(`[data-again="${id}"]`);
  assert.equal(await S.inputValue("[data-is=title]"), "Glass washer leaking");
  await S.click("#is-go");
  await O.waitForFunction((old) => LIVE.issues.some((x) => x.again === old && x.status === "open"), id);
  assert.deepEqual([O.errs, S.errs, T.errs], [[], [], []]);
});

test("slurs can't go out in a message, a name or anything to the manager; ordinary words that contain them can", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Vi"]]);
  const r = (t) => S.evaluate((t) => rude(t), t);
  // Built from pieces so the test file doesn't hold the words either.
  const w = ["n", "i", "g", "g", "e", "r"].join(""), p = ["p", "a", "k", "i"].join("");
  for (const t of [w, `you ${w.toUpperCase()}`, w.replace("i", "1"), w.split("").join(" "), w.split("").join("."), `${p}s`, ["f", "a", "g", "g", "o", "t"].join("")]) assert.equal(await r(t), true, t);
  for (const t of ["Need a hand at the bar", "En retard de 10 minutes", "Pakistan v England tonight", "Going for a fag break", "Pavimento spazzato", "Negroni", "Snigger", "be an error"]) assert.equal(await r(t), false, t);
  await S.evaluate(() => show("notices"));
  await S.fill("#m-text", `Get the ${w} off the bar`);
  await S.click("#m-go");
  await waitToast(S, /^That has a slur in it, so it can't go out\./);
  assert.equal(await S.evaluate(() => LIVE.notices.length), 0);
  assert.deepEqual(S.errs, []);
});
