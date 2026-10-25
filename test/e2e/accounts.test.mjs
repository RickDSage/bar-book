// Accounts end to end: owner setup, adding people, logging in, roles, PIN resets, removal and logging out.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, phone, team, afterReload, toastOf, attempt, adminGet, authAccounts, cachedDocs, SETUP_CODE, OWNER_PIN, MANAGER_PIN, STAFF_PIN } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("first-time setup works once, with the right code and a PIN of at least 6 digits", async () => {
  await resetEmulators();
  const O = await phone(browser, site), X = await phone(browser, site);
  await O.evaluate(() => show("notices"));
  const fillSetup = async (pin, code) => {
    await O.evaluate(() => renderNotices());
    await O.click("details.setup summary");
    await O.fill("#s-name", "Olly Owner"); await O.fill("#s-user", "olly"); await O.fill("#s-pin", pin); await O.fill("#s-code", code);
    await O.click("#s-go");
  };
  await fillSetup("11111", SETUP_CODE);
  assert.match(await toastOf(O), /PIN: 6 to 12 digits/);
  await fillSetup(OWNER_PIN, "short-code");
  assert.equal(await toastOf(O), "The setup code is at least 16 characters");
  await fillSetup(OWNER_PIN, "this-is-the-wrong-code");
  await O.waitForFunction(() => document.querySelector("#toast").textContent.includes("didn't work"));
  await O.waitForFunction(() => LIVE.uid === null);
  assert.equal(await authAccounts(), 0, "a refused setup deletes the login it made");

  await fillSetup(OWNER_PIN, SETUP_CODE);
  await O.waitForFunction(() => LIVE.owner && LIVE.staff.length === 1, null, { timeout: 15000 });
  assert.deepEqual(await O.evaluate(() => [LIVE.me, LIVE.username, LIVE.role]), ["Olly Owner", "olly", "owner"]);
  assert.equal((await adminGet("config/pins")).status, 404, "the setup code is deleted by the same write");
  assert.equal((await adminGet("config/owner")).status, 200);

  const again = await X.evaluate(([c]) => LIVE.api.setup("Eve Intruder", "eve", "99998888", c).then(() => "allowed", (e) => e.message), [SETUP_CODE]);
  assert.equal(again, "That setup code didn't work, or setup has already been done");
  await X.waitForFunction(() => LIVE.uid === null);
  assert.equal(await authAccounts(), 1);
  assert.deepEqual([O.errs, X.errs], [[], []]);
});

// Another tab in the same browser. It shares the login with the first one, as real tabs do.
async function secondTab(p) {
  const t = await p.context().newPage();
  t.errs = [];
  t.on("pageerror", (e) => t.errs.push(e.message));
  await t.goto(site.url);
  if (await t.isVisible("#w-ok")) await t.click("#w-ok");
  await t.waitForFunction(() => LIVE.ready);
  return t;
}

test("first-time setup while the app is open in another tab", { timeout: 60000 }, async () => {
  await resetEmulators();
  const O = await phone(browser, site), O2 = await secondTab(O);
  let reloads = 0;
  O2.on("load", () => reloads++);
  // On a real connection saving takes a moment, so the other tab sees the new login before the owner's records exist.
  await O.route(/Firestore\/Write\/channel/, async (r) => { await new Promise((ok) => setTimeout(ok, 1000)); r.continue().catch(() => {}); });
  const done = O.evaluate(([pin, code]) => LIVE.api.setup("Olly Owner", "olly", pin, code).then(() => "saved", (e) => e.message), [OWNER_PIN, SETUP_CODE]);
  const outcome = await Promise.race([done, new Promise((ok) => setTimeout(() => ok("never finished"), 20000))]);
  assert.equal(outcome, "saved");
  await O2.waitForFunction(() => LIVE.owner, null, { timeout: 15000 });
  assert.deepEqual(await O.evaluate(() => [LIVE.me, LIVE.role]), ["Olly Owner", "owner"]);
  assert.equal(reloads, 0, "the other tab doesn't log both tabs out");
  assert.equal((await adminGet("usernames/olly")).status, 200);
  assert.deepEqual([O.errs, O2.errs], [[], []]);
});

test("adding someone, logging in, promoting, resetting a PIN and removing them", async () => {
  await resetEmulators();
  const { O } = await team(browser, site);
  const S = await phone(browser, site);
  await O.evaluate(() => show("notices"));
  await O.click("[data-tpane=managers]");
  await O.fill("#a-name", "Sam Staff"); await O.fill("#a-user", "sam");
  const pin1 = await O.inputValue("#a-pin");
  assert.match(pin1, /^\d{6}$/, "a staff PIN is made up for you, 6 digits");
  await O.selectOption("#a-role", "manager");
  assert.equal(await O.inputValue("#a-pin"), pin1, "managers get 6 digits too, so choosing manager keeps the PIN");
  await O.selectOption("#a-role", "staff");
  await O.click("#a-go");
  await O.waitForFunction((pin) => document.querySelector("#staff-list .confirm")?.textContent.includes(`username sam, PIN ${pin}`), pin1);

  await S.evaluate(() => show("notices"));
  await S.fill("#l-user", "sam"); await S.fill("#l-pin", "000000"); await S.click("#l-go");
  await S.waitForFunction(() => document.querySelector("#toast").textContent === "Wrong username or PIN");
  // A locked login or no signal isn't a wrong PIN, even when the PIN is right.
  const SIGN_IN = "**/accounts:signInWithPassword*";
  await S.route(SIGN_IN, (r) => r.fulfill({ status: 400, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ error: { code: 400, message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }) }));
  await S.fill("#l-pin", pin1); await S.click("#l-go");
  await S.waitForFunction(() => document.querySelector("#toast").textContent === "Too many wrong PINs. Wait a few minutes, then try again");
  await S.unroute(SIGN_IN); await S.route(SIGN_IN, (r) => r.abort());
  await S.click("#l-go");
  await S.waitForFunction(() => document.querySelector("#toast").textContent === "Could not log in. Check your signal");
  await S.unroute(SIGN_IN);
  await S.fill("#l-user", "Sam"); await S.fill("#l-pin", pin1); await S.click("#l-go");
  await S.waitForFunction(() => LIVE.me === "Sam Staff");
  assert.equal(await S.evaluate(() => LIVE.admin), false);
  assert.equal(await S.$("#a-go"), null, "staff don't get the add-person form");

  await S.fill("#c-text", "Limes low"); await S.click("#c-post");
  await O.waitForFunction(() => LIVE.feed.length === 1);
  assert.equal(await O.evaluate(() => LIVE.feed[0].name + ": " + LIVE.feed[0].text), "Sam Staff: Limes low");

  await O.click("[data-role]");
  await S.waitForFunction(() => LIVE.admin);
  await O.waitForFunction(() => document.querySelector("#staff-list .confirm")?.textContent === "Sam Staff is now a manager.");
  await O.waitForFunction(() => LIVE.staff.find((x) => x.username === "sam").role === "manager");
  await O.click("[data-role]");
  await S.waitForFunction(() => !LIVE.admin);

  // A reset moves them to a new account: logged out at once, old PIN dead, new one works.
  const reload = S.waitForEvent("load", { timeout: 15000 });
  await O.click("[data-reset]");
  await reload; await afterReload(S);
  await O.waitForFunction(() => /New PIN for Sam Staff/.test(document.querySelector("#staff-list .confirm")?.textContent));
  const pin2 = (await O.$eval("#staff-list .confirm", (e) => e.textContent)).match(/: (\d{6})\./)[1];
  assert.equal(await attempt(S, (u, p) => LIVE.api.login(u, p), "sam", pin1), "Wrong username or PIN");
  await S.evaluate(([p]) => LIVE.api.login("sam", p), [pin2]);
  await S.waitForFunction(() => LIVE.me === "Sam Staff");

  S.answer = "246813";
  await S.evaluate(() => show("notices"));
  await S.click("#l-chg");
  await S.waitForFunction(() => document.querySelector("#toast").textContent === "PIN changed");

  // Removal logs them out and wipes what their phone had saved.
  assert.ok((await cachedDocs(S)) > 0, "a logged-in phone keeps team data for no-signal use");
  const gone = S.waitForEvent("load", { timeout: 15000 });
  await O.click("[data-remove]");
  await gone; await afterReload(S);
  assert.equal(await cachedDocs(S), 0, "nothing of the team's is left on the removed person's phone");
  assert.equal(await attempt(S, (u, p) => LIVE.api.login(u, p), "sam", "246813"), "Wrong username or PIN");

  await O.waitForFunction(() => LIVE.staff.length === 1 && LIVE.audit.length >= 6);
  const log = await O.$eval("#audit-list", (e) => e.innerText);
  for (const s of ["owner account set up", "added", "now Manager", "now Staff", "new PIN", "removed"]) assert.ok(log.includes(s), `account changes list shows "${s}"`);
  assert.equal((log.match(/new PIN/g) || []).length, 1, "a reset shows once, not once per account");

  await O.reload(); await O.click("#w-ok");
  await O.waitForFunction(() => LIVE.me === "Olly Owner" && LIVE.feed.length === 1);
  assert.deepEqual([O.errs, S.errs], [[], []]);
});

test("what managers and staff can do to accounts", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]]);
  const add = (p, ...a) => attempt(p, (n, u, pin, r) => LIVE.api.addPerson(n, u, pin, r), ...a);
  assert.equal(await add(M, "Tia Staff", "tia", STAFF_PIN, "staff"), "allowed");
  const logins = await authAccounts();
  assert.equal(await add(M, "Max Manager", "max", MANAGER_PIN, "manager"), "permission-denied");
  assert.equal(await add(S, "Zed Staff", "zed", STAFF_PIN, "staff"), "permission-denied");
  assert.equal(await authAccounts(), logins, "a refused add deletes the login it made");
  await M.waitForFunction(() => LIVE.staff.length === 4);
  const who = (u) => M.evaluate((u) => LIVE.staff.find((x) => x.username === u), u);
  const owner = await who("olly"), sam = await who("sam"), tia = await who("tia");
  assert.equal(await attempt(M, (p) => LIVE.api.remove(p), owner), "permission-denied");
  assert.equal(await attempt(M, (p) => LIVE.api.resetPin(p, "99998888"), owner), "permission-denied");
  assert.equal(await attempt(M, (p) => LIVE.api.setRole(p, "manager"), sam), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.setRole({ uid: LIVE.uid, name: LIVE.me, username: LIVE.username, role: "staff" }, "manager")), "permission-denied");
  assert.equal(await attempt(M, (p) => LIVE.api.resetPin(p, "135790"), sam), "allowed");
  assert.equal(await attempt(M, (p) => LIVE.api.remove(p), tia), "allowed");
  const mia = await O.evaluate(() => LIVE.staff.find((x) => x.username === "mia"));
  assert.equal(await attempt(O, (p) => LIVE.api.setRole(p, "owner"), mia), "permission-denied", "there is only ever one owner");
  assert.equal(await attempt(O, (p) => LIVE.api.setRole(p, "staff"), mia), "allowed");
  await M.waitForFunction(() => LIVE.role === "staff" && !LIVE.admin && LIVE.staff.length === 0);
  assert.equal(await add(O, "Max Manager", "max", MANAGER_PIN, "manager"), "allowed");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("logging out clears this phone's copy of the team's data", async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await O.evaluate(() => LIVE.api.pin("Tasting at 4"));
  await S.waitForFunction(() => LIVE.notices.length === 1);
  assert.ok((await cachedDocs(S)) > 0);
  await S.evaluate(() => show("notices"));
  const reload = S.waitForEvent("load", { timeout: 15000 });
  await S.click("#l-out");
  await reload; await afterReload(S);
  assert.equal(await cachedDocs(S), 0);
  assert.deepEqual(await S.evaluate(() => [LIVE.me, LIVE.notices.length]), [null, 0]);
  assert.deepEqual(S.errs, []);
});
