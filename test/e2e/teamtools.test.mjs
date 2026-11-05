// Team members, managed several at a time: usernames made from names, adding a list, ticking people to change their
// role, give new PINs or remove them, finding someone; and test staff for a practice day on the rota.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, phone, team, authAccounts, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

const msg = (p) => p.$eval("#staff-list .confirm", (e) => e.innerText);

test("adding a list, then ticking people to promote, reset and remove them together", { timeout: 90000 }, async () => {
  await resetEmulators();
  const { O } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  await part(O, "team");
  // A username is made from the name, skipping one that's taken, until it's typed over.
  await O.fill("#a-name", "Sam Smith");
  assert.equal(await O.inputValue("#a-user"), "sam.s");
  await O.fill("#a-user", "sammy"); await O.fill("#a-name", "Sam Smithson");
  assert.equal(await O.inputValue("#a-user"), "sammy", "a username typed in stays");

  await O.click("#many-box summary");
  await O.fill("#a-many", "Alex Bright\nJo Brown, manager\n\nKai Long");
  await O.click("#a-many-go");
  await O.waitForFunction(() => LIVE.staff.length === 5, null, { timeout: 30000 });
  await O.waitForFunction(() => /Added 3/.test(document.querySelector("#staff-list .confirm")?.textContent));
  const added = await msg(O);
  for (const line of ["Alex Bright: username alex, PIN ", "Jo Brown (manager): username jo, PIN ", "Kai Long: username kai, PIN "]) assert.ok(added.includes(line), line);
  assert.equal(added.match(/PIN \d{6}/g).length, 3);
  assert.equal(await O.evaluate(() => LIVE.staff.find((p) => p.username === "jo").role), "manager");

  // Find, filter, tick.
  await O.fill("#tm-q", "kai");
  assert.equal(await O.locator("#staff-list .tmrow").count(), 1);
  await O.fill("#tm-q", "");
  await O.click('[data-tm-show="staff"]');
  assert.equal(await O.locator("#staff-list .tmrow").count(), 3);
  assert.equal(await O.locator("[data-tm-sel]").count(), 3);
  await O.click("#tm-all");
  assert.equal(await O.$eval(".tmbar b", (e) => e.textContent), "3 selected");
  await O.click("#tm-mgr");
  await O.waitForFunction(() => LIVE.staff.filter((p) => p.role === "manager").length === 4, null, { timeout: 15000 });
  await O.waitForFunction(() => /are now managers/.test(document.querySelector("#staff-list .confirm")?.textContent));

  await O.click('[data-tm-show="manager"]');
  for (const u of ["alex", "kai"]) await O.check(`[data-tm-sel="${await O.evaluate((u) => LIVE.staff.find((p) => p.username === u).uid, u)}"]`);
  await O.click("#tm-pins");
  await O.waitForFunction(() => /New PINs/.test(document.querySelector("#staff-list .confirm")?.textContent), null, { timeout: 20000 });
  assert.equal((await msg(O)).match(/PIN \d{6}/g).length, 2);

  const before = await authAccounts();
  await O.click('[data-tm-show="all"]');
  await O.click("#tm-all");
  assert.equal(await O.$eval(".tmbar b", (e) => e.textContent), "4 selected", "everyone but the owner");
  await O.click("#tm-remove");
  await O.waitForFunction(() => LIVE.staff.length === 1, null, { timeout: 20000 });
  await O.waitForFunction(() => /^Removed /.test(document.querySelector("#staff-list .confirm")?.textContent));
  assert.ok(before >= 1);
  assert.deepEqual(O.errs, []);
});

test("a manager can tick staff only, and sees who can do what", async () => {
  await resetEmulators();
  const { M } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["X", "Max Manager", "max", "manager"], ["S", "Sam Staff", "sam", "staff"]]);
  await M.waitForFunction(() => LIVE.staff.length === 4);
  await part(M, "team");
  assert.equal(await M.locator("[data-tm-sel]").count(), 1, "only Sam: not the owner, another manager or herself");
  await M.check("[data-tm-sel]");
  assert.equal(await M.locator("#tm-mgr").count(), 0, "only the owner changes roles");
  assert.equal(await M.locator("#tm-pins").count(), 1);
  await M.click("#perm-box summary");
  assert.match(await M.$eval("#perm-box", (e) => e.innerText), /Add and remove managers, change roles/);
  assert.deepEqual(M.errs, []);
});

test("test staff: a practice team on the rota, tagged for everyone, cleared in one tap", { timeout: 90000 }, async () => {
  await resetEmulators();
  const { O, S } = await team(browser, site, [["S", "Sam Staff", "sam", "staff"]]);
  const logins = await authAccounts();
  await part(O, "team");
  await O.click("#test-box summary");
  for (const [k, n] of [["bar", "2"], ["floor", "1"], ["kitchen", "1"], ["manager", "1"]]) await O.fill(`#tt-n-${k}`, n);
  await O.click("#tt-fill");
  await O.waitForFunction(() => LIVE.tests.length === 5);
  assert.deepEqual(await O.evaluate(() => LIVE.tests.map((p) => p.name)), ["Test Bartender 1", "Test Bartender 2", "Test Chef 1", "Test Manager 1", "Test Server 1"]);
  assert.equal(await authAccounts(), logins, "test staff are never logins");
  assert.equal(await O.evaluate(() => LIVE.staff.length), 2);
  await O.fill("#tt-name", "Test Runner"); await O.selectOption("#tt-side", "floor"); await O.click("#tt-add");
  await O.waitForFunction(() => LIVE.tests.length === 6);
  await O.click('[data-tm-show="test"]');
  assert.equal(await O.locator("#staff-list .tmrow").count(), 6);

  // On the rota for today, published so the team sees them, each tagged Test.
  await O.check("#tt-pub");
  await O.click("#tt-day");
  await O.waitForFunction(() => LIVE.shifts.filter((x) => x.who.startsWith("test-") && x.pub).length === 6, null, { timeout: 15000 });
  const kitchen = await O.evaluate(() => LIVE.shifts.find((x) => x.whoName === "Test Chef 1"));
  assert.deepEqual([kitchen.start, kitchen.end, kitchen.side], ["11:00", "22:00", "kitchen"]);
  await S.waitForFunction(() => LIVE.shifts.filter((x) => x.who.startsWith("test-")).length === 6, null, { timeout: 15000 });
  await part(S, "rota");
  await S.waitForFunction(() => [...document.querySelectorAll("#rota .pill")].filter((e) => e.textContent === "Test").length === 6);
  assert.equal(await S.evaluate(() => LIVE.tests.length), 0, "staff can't read the test staff themselves");
  // The manager's grid has a row for each of them.
  await part(O, "rota");
  assert.equal(await O.evaluate(() => roPeople().length), 8);

  await part(O, "team");
  await O.click("#tt-clear");
  await O.waitForFunction(() => LIVE.tests.length === 0 && !LIVE.shifts.some((x) => x.who.startsWith("test-")), null, { timeout: 20000 });
  await S.waitForFunction(() => !LIVE.shifts.some((x) => x.who.startsWith("test-")), null, { timeout: 15000 });
  assert.deepEqual([O.errs, S.errs], [[], []]);
});
