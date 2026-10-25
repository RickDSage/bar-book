// The new Team page features end to end: Tonight at a glance, and issues and handover.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, toastOf, attempt, adminWrite } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
const tiles = (p) => p.$$eval("#dash button", (x) => x.map((b) => `${b.querySelector("b").textContent} ${b.querySelector("span").textContent}${b.classList.contains("hot") ? " (hot)" : ""}`));

test("Tonight counts what needs doing and each tile goes to it", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await O.evaluate(() => show("notices"));
  assert.deepEqual(await tiles(O), ["0/36 Bar checklists ticked", "0 safety checks due on the bar", "0 cleaning jobs due on the bar", "0 86'd right now", "0 open issues", "0 open concerns", "0 stock requests not ordered", "Not yet bar report tonight", "Not yet floor report tonight",
    "0 reports to sign off", "0 staff requests to answer", "0 open incidents", "0 readings out of range tonight"]);

  await S.evaluate(async () => {
    const A = LIVE.api;
    await Promise.all([A.tick("close", 0, true), A.set86("Limes", true), A.request("Blue roll", ""), A.ask({ kind: "late", eta: "18:00", note: "" }),
      A.incident("Near miss", "Wet floor by the bar"), A.raise({ title: "Glass washer leaking", detail: "", area: "bar", urgent: true, again: null }), A.sendReport("bar", "Bar report", "Bar · test")]);
  });
  await O.waitForFunction(() => [...document.querySelectorAll("#dash b")].filter((b) => b.textContent === "1").length === 6);
  assert.deepEqual(await tiles(O), ["1/36 Bar checklists ticked", "0 safety checks due on the bar", "0 cleaning jobs due on the bar", "1 86'd right now (hot)", "1 open issues, 1 urgent (hot)", "0 open concerns", "1 stock requests not ordered", "Sent bar report tonight", "Not yet floor report tonight",
    "1 reports to sign off (hot)", "1 staff requests to answer", "1 open incidents (hot)", "0 readings out of range tonight"]);
  await S.evaluate(() => show("notices"));
  assert.equal((await tiles(S)).length, 9, "staff see the shift tiles, not the managers' ones");

  await O.click('[data-go="stock"]');
  assert.deepEqual(await O.evaluate(() => [$("#v-tally").hidden, document.querySelector(".ptabs [aria-selected=true]").dataset.pane]), [false, "stock"]);
  for (const [go, tab] of [["requests", "requests"], ["incidents", "managers"], ["reports", "reports"], ["issues", "board"]]) {
    await O.evaluate(() => show("notices"));
    await O.click(`[data-go="${go}"]`);
    assert.equal(await O.$eval("[data-tpane][aria-selected=true]", (e) => e.dataset.tpane), tab, `${go} tile opens the ${tab} tab`);
  }
  assert.ok(await O.$eval("#issues", (e) => { const y = e.getBoundingClientRect().top; return y >= 0 && y < innerHeight / 2; }), "the issues tile scrolls the issues into view");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("issues: raise, take on, give to someone, fix, and raise again", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  await S.evaluate(() => show("notices"));
  await S.click("#is-form summary"); await S.click("#is-go");
  assert.equal(await toastOf(S), "Say what it is and where");
  await S.fill("[data-is=title]", "Glass washer leaking"); await S.selectOption("[data-is=area]", "bar");
  await S.fill("[data-is=detail]", "Water under the machine"); await S.check("[data-is=urgent]"); await S.click("#is-go");
  await waitToast(O, /^Urgent: Glass washer leaking$/);
  const washer = await O.evaluate(() => LIVE.issues[0].id);

  await S.evaluate(() => show("drinks"));
  await M.evaluate(() => show("notices"));
  await M.selectOption(`[data-give="${washer}"]`, { label: "Sam Staff" });
  await waitToast(S, /^Mia Manager gave you: Glass washer leaking$/);
  assert.match(await M.$eval("#issues", (e) => e.innerText), /On it: Sam Staff/);
  const mia = await M.evaluate(() => ({ uid: LIVE.uid, name: LIVE.me }));
  assert.equal(await attempt(S, (id, p) => LIVE.api.take(id, p), washer, mia), "permission-denied", "staff can only take things on themselves");
  assert.equal(await attempt(S, (id) => LIVE.api.withdrawIssue(id), washer), "permission-denied", "once someone's on it, it can't be withdrawn");

  await S.evaluate(() => LIVE.api.raise({ title: "Terrace heater out", detail: "", area: "terrace", urgent: false, again: null }));
  await O.evaluate(() => show("notices"));
  await O.waitForFunction(() => LIVE.issues.length === 2 && !LIVE.issues.some((x) => x.pending));
  const heater = await O.evaluate(() => LIVE.issues.find((x) => x.title === "Terrace heater out").id);
  await O.click(`[data-take="${heater}"]`);
  await waitToast(S, /^Olly Owner is on it: Terrace heater out$/);
  await O.click(`[data-fix="${heater}"]`);
  assert.equal(await toastOf(O), "Say what was done to fix it first");
  await O.fill(`[data-fixt="${heater}"]`, "Reset the gas valve"); await O.click(`[data-fix="${heater}"]`);
  await waitToast(S, /^Olly Owner fixed: Terrace heater out$/);
  assert.equal(await attempt(S, (id) => LIVE.api.take(id, { uid: LIVE.uid, name: LIVE.me }), heater), "permission-denied", "a fixed issue can't be reopened");

  // Still broken: a new issue linked to the fixed one.
  await S.evaluate(() => show("notices"));
  await S.click(`#issues details:not(#is-form) summary`);
  await S.click(`[data-again="${heater}"]`);
  assert.equal(await S.$eval("#is-form summary", (e) => e.textContent), "Raise it again");
  assert.equal(await S.inputValue("[data-is=title]"), "Terrace heater out");
  await S.click("#is-go");
  await O.waitForFunction((h) => LIVE.issues.some((x) => x.again === h && !x.pending), heater);
  await O.waitForFunction(() => /Raised again/.test(document.querySelector("#issues").innerText));

  // Open issues stay on the board however old they are, urgent first and then oldest first.
  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  await adminWrite("issues/oldissue0000000000000", { title: { stringValue: "Toilet door lock sticks" }, detail: { stringValue: "" }, area: { stringValue: "toilets" }, urgent: { booleanValue: false }, again: { nullValue: null }, status: { stringValue: "open" }, uid: { stringValue: "someone" }, name: { stringValue: "Tia Staff" }, at: { timestampValue: old } });
  await O.waitForFunction(() => LIVE.issues.some((x) => x.title === "Toilet door lock sticks"));
  await O.waitForFunction(() => document.querySelectorAll("#issues article.issue").length === 3);
  assert.deepEqual(await O.$$eval("#issues article.issue .meta b", (x) => x.map((e) => e.textContent)), ["Glass washer leaking", "Toilet door lock sticks", "Terrace heater out"]);

  await S.evaluate(() => LIVE.api.raise({ title: "Mop head missing", detail: "", area: "cellar", urgent: false, again: null }));
  await S.waitForFunction(() => LIVE.issues.some((x) => x.title === "Mop head missing" && !x.pending));
  const mop = await S.evaluate(() => LIVE.issues.find((x) => x.title === "Mop head missing").id);
  await S.click(`[data-withdraw="${mop}"]`);
  await O.waitForFunction(() => !LIVE.issues.some((x) => x.title === "Mop head missing") && LIVE.issues.length === 4);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
