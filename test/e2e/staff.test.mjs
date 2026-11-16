// The staff-only team: joining with the team link (no login), no messaging inside the app, a copy of everything sent
// for the owner and seniors (rate the shift with no name), Tell Derek, up to three seniors with their own codes, messages to the seniors
// (named or anonymous), the incident form and the Team only shift rating, and taking every phone off by changing the
// team code.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, phone, adminWrite, afterReload, attempt, TEAM_CODE } from "./helpers.mjs";

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
  assert.match(flat(await q.$eval("#tm-top", (e) => e.innerText)), /Join the team .* Team code .* Owner login/i);
  // Through the form: a refused code says why and gives the form back.
  await q.fill("#j-name", "Vi");
  await q.fill("#j-code", "wrong-code-456");
  await q.click("#j-go");
  await q.waitForSelector("#tm-top [role=alert]");
  assert.match(await q.$eval("#tm-top [role=alert]", (e) => e.textContent), /team link didn't work/);
  assert.equal(await q.$$eval("#j-go", (x) => x.length), 1);
  // And it doesn't keep retrying by itself (it used to, every fraction of a second, for ever).
  await q.evaluate(() => { window.joins = 0; const j = LIVE.api.join; LIVE.api.join = (...a) => { joins++; return j(...a); }; });
  await q.waitForTimeout(1500);
  assert.equal(await q.evaluate(() => joins), 0);
  assert.deepEqual([p.errs, q.errs], [[], []]);
});

test("no messaging inside the app: no banner, no bell, no posting", async () => {
  await resetEmulators();
  const { O, A } = await team(browser, site, [["A", "Angel"]]);
  for (const p of [O, A]) {
    await p.evaluate(() => show("notices"));
    assert.equal(await p.$$eval("#bcast, #bell, #m-text, #tm-post, #tm-msgs", (x) => x.length), 0);
    assert.equal(await p.evaluate(() => ["post", "gotIt", "saveTemplate", "shout"].some((k) => k in LIVE.api)), false);
  }
  // An 86 is on the board, not shouted at every phone.
  const drink = await A.evaluate(() => D[0].name);
  await A.evaluate((n) => setOut(n, true), drink);
  await O.waitForFunction((n) => LIVE.out.has(n), drink);
  assert.deepEqual([O.errs, A.errs], [[], []]);
});

// Taps a Send page button without leaving the page.
const sendVia = (p, sel) => p.evaluate((sel) => {
  const stop = (e) => e.preventDefault();
  window.addEventListener("click", stop, { capture: true, once: true });
  document.querySelector(sel).click();
}, sel);

test("a copy of everything sent goes to the owner and seniors; rate the shift with no name; My pay never", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, [["M", "Illias", "illias", "manager"], ["S", "Kadir"], ["T", "Pema"]]);
  // A sick message on WhatsApp: logged once in Kadir's name, however many times the button is tapped.
  await S.evaluate(() => openSend("sick"));
  await sendVia(S, '#send a[data-via="wa"]');
  await sendVia(S, '#send a[data-via="mail"]');
  await M.waitForFunction(() => LIVE.sent.length === 1);
  const one = await M.evaluate(() => LIVE.sent[0]);
  assert.equal(one.k, "sick"); assert.equal(one.name, "Kadir"); assert.match(one.text, /Off sick/);
  await S.click("#sh-close");

  // Team only: the rating goes with no name, no side and no uid, and the app says so.
  await part(S, "rate");
  assert.match(await S.$eval("#tc-rate", (e) => e.innerText), /Derek and the seniors also get a copy with no name, no side and nothing about this phone/);
  await S.click('[data-rate="4"]');
  await S.fill('[data-rt="feel"]', "Short-staffed again");
  await S.evaluate(() => openSend("rate"));
  assert.match(await S.$eval("#send-pre", (e) => e.innerText), /from Kadir/); // What goes on WhatsApp still has the name.
  await sendVia(S, '#send a[data-via="wa"]');
  await O.waitForFunction(() => LIVE.sent.some((x) => x.k === "rate"));
  const rate = await O.evaluate(() => LIVE.sent.find((x) => x.k === "rate"));
  assert.equal(rate.anon, true); assert.equal(rate.uid, undefined); assert.equal(rate.name, undefined);
  assert.match(rate.text, /4\/10/); assert.match(rate.text, /Short-staffed again/);
  assert.doesNotMatch(rate.text, /Kadir|bar shift|floor shift/i);

  // My pay and the team link stay on the phone.
  await S.evaluate(() => { hoursLog = [{ day: shiftDay(), start: "17:00", end: "23:00", brk: 0 }]; openSend("hours"); });
  await sendVia(S, '#send a[data-via="wa"]');
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await O.evaluate(() => LIVE.sent.length), 2);
  // The rest of the team sees none of it, and the seniors' card shows it.
  assert.equal(await T.evaluate(() => LIVE.sent.length), 0);
  await part(M, "sent");
  assert.match(await M.$eval("#tc-sent", (e) => e.innerText), /anonymous/);
  assert.deepEqual([O.errs, M.errs, S.errs, T.errs], [[], [], [], []]);
});

test("Tell Derek: anyone says what's missing, to add or wrong; only the owner reads them", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, [["M", "Illias", "illias", "manager"], ["S", "Vi"]]);
  await part(S, "tell");
  await S.click("#tell-go");
  await waitToast(S, /^Say what it is first$/);
  await S.click('[data-tell-kind="wrong"]');
  await S.fill('[data-tell="text"]', "The Mojito spec says 50 ml rum");
  await S.click("#tell-go");
  await waitToast(S, /^Sent to Olly$/);
  await M.evaluate(() => LIVE.api.tell("add", "A list for the terrace"));
  await O.waitForFunction(() => LIVE.tells.length === 2);
  await O.waitForFunction(() => document.querySelector("#team-n").textContent === "2");
  // Each sees only their own.
  assert.equal(await S.evaluate(() => LIVE.tells.length), 1);
  assert.equal(await M.evaluate(() => LIVE.tells.length), 1);
  const id = await O.evaluate(() => LIVE.tells.find((x) => x.kind === "wrong").id);
  await part(O, "tells");
  await O.click(`[data-tell-done="${id}"]`);
  await S.waitForFunction(() => LIVE.tells[0]?.status === "done");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("the owner adds up to three seniors with their own codes; a senior unlocks a team phone, and locks it again", async () => {
  await resetEmulators();
  const { O, A, B, S } = await team(browser, site, [["A", "Illias", "illias", "manager"], ["B", "Hassan", "hassan", "manager"], ["S", "Artur"]]);
  for (const p of [A, B]) assert.equal(await p.evaluate(() => LIVE.admin && !LIVE.owner), true);
  // The owner's Manager section, with the seniors' card.
  await O.evaluate(() => show("notices"));
  assert.match(await O.$eval("#tm-cards", (e) => e.textContent), /Manager.*Nothing waiting.*Bar closing: none yet.*Seniors and their codes.*Owner settings.*Team/s);
  await part(O, "seniors");
  // Codes are unique: Illias's is taken.
  await O.fill("#sn-name", "Artur"); await O.fill("#sn-pin", "4821");
  await O.click("#sn-go");
  await waitToast(O, /^Another senior has that code/);
  await O.fill("#sn-pin", "7305");
  await O.click("#sn-go");
  await waitToast(O, /^Artur can unlock with their code now/);
  await O.waitForFunction(() => LIVE.seniors.length === 3 && !document.querySelector("#sn-go"));

  // Artur's own phone: a wrong code is counted by the server and says how many are left; the right one unlocks.
  await S.waitForFunction(() => LIVE.seniors.length === 3);
  await part(S, "unlock");
  await S.click('[data-un-id="artur"]');
  await S.fill("#un-pin", "1111");
  await S.click("#un-go");
  await waitToast(S, /^Wrong code. 4 more before it slows down$/);
  await O.waitForFunction(() => LIVE.seniors.find((x) => x.id === "artur").tries === 1);
  await S.click('[data-un-id="artur"]');
  await S.fill("#un-pin", "7305");
  await S.click("#un-go");
  await S.waitForFunction(() => LIVE.admin && LIVE.role === "manager" && LIVE.me === "Artur");
  await O.waitForFunction(() => LIVE.seniors.find((x) => x.id === "artur").tries === 0);
  await S.waitForFunction(() => /Manager/.test(document.querySelector("#tm-cards").textContent) && document.querySelector("#tm-lock"));
  // Lock: back to the team's view under the phone's own name.
  await S.click("#tm-lock");
  await S.waitForFunction(() => !LIVE.admin && LIVE.role === "staff");
  assert.equal(await S.evaluate(() => LIVE.sent.length), 0);

  // Taking Hassan off as a senior takes his phone back to the team's view.
  await part(O, "seniors");
  await O.click('[data-sn-drop="hassan"]');
  await B.waitForFunction(() => !LIVE.admin && LIVE.role === "staff");
  assert.deepEqual([O.errs, A.errs, B.errs, S.errs], [[], [], [], []]);
});

test("guessing a senior's code: slowed after 5, locked after 10 until the owner unlocks it", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["M", "Illias", "illias", "manager"], ["S", "Vi"]]);
  await S.waitForFunction(() => LIVE.seniors.length === 1);
  for (let i = 1; i <= 5; i++) assert.match(await attempt(S, (g) => LIVE.api.unlock("illias", g), "000" + i), /^Wrong code/);
  // The phone can't skip the wait by writing round the app: the rules refuse the count.
  assert.equal(await attempt(S, () => {
    const s = LIVE.seniors[0]; s.tries = 0; s.lastTry = null;
    return LIVE.api.unlock("illias", "4821");
  }), "Couldn't check the code. Check your signal and try again");
  assert.equal(await S.evaluate(() => LIVE.role), "staff");
  await S.waitForFunction(() => LIVE.seniors[0].tries === 5);
  assert.match(await attempt(S, () => LIVE.api.unlock("illias", "4821")), /^Too many wrong codes. Try again in 1[45] min$/);
  // Locked at 10: only the owner can unlock it.
  await adminWrite("seniors/illias", { name: { stringValue: "Illias" }, tries: { integerValue: "10" }, lastTry: { timestampValue: new Date(Date.now() - 864e5).toISOString() } });
  await S.waitForFunction(() => LIVE.seniors[0].tries === 10);
  assert.match(await attempt(S, () => LIVE.api.unlock("illias", "4821")), /^Locked after 10 wrong codes/);
  await O.evaluate(() => show("notices"));
  await O.waitForFunction(() => /locked/.test(document.querySelector('[data-card="seniors"] summary').textContent));
  await part(O, "seniors");
  await O.click('[data-sn-reset="illias"]');
  await S.waitForFunction(() => LIVE.seniors[0].tries === 0);
  assert.equal(await attempt(S, () => LIVE.api.unlock("illias", "4821")), "allowed");
  await S.waitForFunction(() => LIVE.admin);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("to the seniors: named or anonymous, only the seniors see them, and the reply comes back", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, [["M", "Illias", "illias", "manager"], ["S", "Vi"], ["T", "PK"]]);
  await part(S, "ask");
  await S.waitForSelector("#ask-go");
  assert.equal(await S.$eval("#ask-go", (b) => b.textContent), "Send to the seniors");
  await S.fill('[data-ask="when"]', "Sat 22 Nov");
  await S.fill('[data-ask="text"]', "Family wedding");
  await S.click("#ask-go");
  await waitToast(S, /^Sent to the seniors$/);
  await S.click('[data-ask-kind="complaint"]');
  await S.fill('[data-ask="text"]', "Rota changed with no notice");
  await S.check('[data-ask="anon"]');
  await S.click("#ask-go");
  await waitToast(S, /^Sent to the seniors$/);

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

test("changing the team code takes every staff phone off; the owner and seniors stay", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Derek"]]);
  await adminWrite("config/team", { code: { stringValue: "a-brand-new-code-456" } });
  const r = await S.evaluate(() => LIVE.api.tell("add", "Hello").then(() => "allowed", (e) => e.code));
  assert.equal(r, "permission-denied");
  assert.equal(await O.evaluate(() => LIVE.api.tell("add", "Owner here").then(() => "allowed", (e) => e.code)), "allowed");
  // The new link lets them back in.
  await S.evaluate(() => LIVE.api.join("a-brand-new-code-456", "Derek"));
  assert.equal(await S.evaluate(() => LIVE.api.tell("add", "Back").then(() => "allowed", (e) => e.code)), "allowed");
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

test("slurs can't go out in Tell Derek, a name or anything to the seniors; ordinary words that contain them can", async () => {
  await resetEmulators();
  const { S } = await team(browser, site, [["S", "Vi"]]);
  const r = (t) => S.evaluate((t) => rude(t), t);
  // Built from pieces so the test file doesn't hold the words either.
  const w = ["n", "i", "g", "g", "e", "r"].join(""), p = ["p", "a", "k", "i"].join("");
  for (const t of [w, `you ${w.toUpperCase()}`, w.replace("i", "1"), w.split("").join(" "), w.split("").join("."), `${p}s`, ["f", "a", "g", "g", "o", "t"].join("")]) assert.equal(await r(t), true, t);
  for (const t of ["Need a hand at the bar", "En retard de 10 minutes", "Pakistan v England tonight", "Going for a fag break", "Pavimento spazzato", "Negroni", "Snigger", "be an error"]) assert.equal(await r(t), false, t);
  await part(S, "tell");
  await S.fill('[data-tell="text"]', `Get the ${w} off the bar`);
  await S.click("#tell-go");
  await waitToast(S, /^That has a slur in it, so it can't go out\./);
  assert.equal(await S.evaluate(() => LIVE.tells.length), 0);
  assert.deepEqual(S.errs, []);
});

test("everything can be sent: numbers, allergens, pay, games, restock, reports, and any message as a picture", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Kadir"]]);
  await O.evaluate(() => LIVE.api.saveContacts([{ t: "Duty manager", n: "", p: "07700 900123" }]));
  await S.waitForFunction(() => LIVE.contacts.length === 1);
  const contacts = await S.evaluate(() => shareText("contacts", false));
  assert.match(contacts, /Duty manager: 07700 900123/); assert.match(contacts, /999/);
  assert.match(await S.evaluate(() => shareText("allergen", false, "Milk")), /drinks with milk/);
  assert.match(await S.evaluate(() => shareText("pay", false)), /Take-home/);
  for (const k of ["games", "restock", "labels"]) assert.equal(await S.evaluate((k) => SHARE[k](), k), null, `${k}: nothing to send yet`);
  // As a picture: a JPEG card through the share sheet, and the copy goes to the owner like any other send.
  await S.evaluate(() => { navigator.canShare = () => true; navigator.share = (d) => { window.pic = d.files.map((f) => [f.type, f.size > 5000]); return Promise.resolve(); }; });
  await S.evaluate(() => openSend("contacts"));
  await S.click("#send [data-send-pic]");
  await S.waitForFunction(() => window.pic);
  assert.deepEqual(await S.evaluate(() => window.pic), [["image/jpeg", true]]);
  await O.waitForFunction(() => LIVE.sent.some((x) => x.k === "contacts" && x.name === "Kadir"));
  // My pay never is.
  await S.click("#sh-close");
  await S.waitForSelector("#sheet", { state: "hidden" });
  await S.evaluate(() => { window.pic = null; openSend("pay"); });
  await S.waitForSelector("#send [data-send-pic]");
  await S.click("#send [data-send-pic]");
  await S.waitForFunction(() => window.pic);
  assert.equal(await O.evaluate(() => LIVE.sent.some((x) => x.k === "pay")), false);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
