// The Features page: every feature with what it's for and who can do what, the owner's switches for the whole venue,
// and the tour.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, phone, toastOf, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const card = async (p, k) => flat(await p.$eval(`[data-feat="${k}"]`, (e) => e.innerText));
const openFeatures = async (p) => { await p.evaluate(() => show("info")); await p.click("#v-info [data-feat-open]"); await p.waitForSelector("#feat"); };
const closed = (p) => p.waitForFunction(() => document.querySelector("#sheet").hidden);
const navTabs = (p) => p.$$eval("nav.tabs [data-tab]", (x) => x.filter((b) => !b.hidden).map((b) => b.dataset.tab));
const teamTabs = (p) => p.$$eval("[data-tpane]", (x) => x.map((b) => `${b.dataset.tpane}:${b.firstChild.textContent}`));
// Which page is showing: a bottom tab, the Shift tab's pane, or the Team tab (and the Managers part).
const where = (p) => p.evaluate(() => {
  const v = TABS.find((t) => !$("#v-" + t).hidden);
  return v === "tally" ? `tally:${pane}` : v === "notices" ? `team:${tpane}${tpane === "managers" ? `:${msub}` : ""}` : v;
});
const switched = (p, off) => p.waitForFunction((o) => [...LIVE.off].sort().join() === o, [...off].sort().join());

test("every feature, what it's for and what each person can do with it, with shortcuts", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);

  // Staff: from Bar info, what they can do and what managers can, with no switches.
  await openFeatures(S);
  assert.match(flat(await S.$eval("#feat", (e) => e.innerText)), /^WHAT'S IN BAR BOOK The drinks, the shift and the team in one app\. .* You're staff: what you can do is under You\. .* Take the tour \(14 steps\) DRINKS /);
  assert.equal(await S.$$eval("[data-feat]", (x) => x.length), 29);
  assert.match(await card(S, "fresh"), /^Start fresh Managers only A clean start for everyone once the venue has finished trying the app out: .* Managers: The owner downloads what to keep, sees what it would clear, then types their PIN to clear it for everyone\.$/);
  assert.match(await card(S, "lists"), /^Checklists Opening and closing .* You: Tick items off, start one, or mark one blocked and say why\. Managers: The same, and give an item to someone and change what's on each list\. Open$/);
  assert.match(await card(S, "live"), /^Live Managers only Tonight as it happens: .* Managers: Share tonight's summary on WhatsApp or by email\.$/);
  assert.equal(await S.$$eval("[data-feat-sw]", (x) => x.length), 0, "only the owner gets switches");
  // A shortcut closes the page and opens the feature.
  await S.click('[data-feat-go="rota"]');
  await closed(S);
  assert.equal(await where(S), "team:rota");
  // From the Team page too: "What I can do".
  await S.click("#team [data-feat-open]");
  await S.waitForSelector("#feat");
  await S.click('[data-feat-go="send"]'); await closed(S);
  assert.equal(await where(S), "tally:send");

  // A manager: their own line is You, and the Managers parts open.
  await openFeatures(M);
  assert.match(await card(M, "live"), /^Live Tonight as it happens: .* You: Share tonight's summary on WhatsApp or by email\. Open$/);
  assert.match(await card(M, "lists"), /Staff: Tick items off, .* You: The same, and give an item to someone/);
  await M.click('[data-feat-go="kpis"]'); await closed(M);
  assert.equal(await where(M), "team:managers:kpis");
  await openFeatures(M);
  await M.click('[data-feat-go="incidents"]'); await closed(M);
  assert.equal(await where(M), "team:reports");
  assert.equal(await M.$$eval("[data-feat-sw]", (x) => x.length), 0);

  // The owner gets a switch on each feature that can be switched off, all on to start with.
  await openFeatures(O);
  assert.match(flat(await O.$eval("#feat", (e) => e.innerText)), /You're the owner, so you can do everything here\. Untick a feature to switch it off for everyone at this venue/);
  assert.deepEqual(await O.$$eval("[data-feat-sw]", (x) => x.map((b) => `${b.dataset.featSw}:${b.checked}`)),
    ["allergens", "practice", "pay", "football", "chat", "rota", "calendar", "asks", "incidents", "kpis", "training", "feedback"].map((k) => `${k}:true`));
  await O.click('[data-feat-go="pay"]'); await closed(O);
  assert.equal(await where(O), "pay", "My pay is its own tab");

  // Logged out: the drinks side opens, the rest needs a login.
  const P = await phone(browser, site);
  await openFeatures(P);
  assert.match(flat(await P.$eval("#feat", (e) => e.innerText)), /Without a login you get the drinks, the cocktail maker, Allergens, Practise, Bar info and My pay\. .* Take the tour \(5 steps\)/);
  assert.match(await card(P, "lists"), /^Checklists Needs a team login .* Staff: Tick items off, .* Managers: The same, and /);
  assert.equal(await P.$$eval('[data-feat-go="lists"]', (x) => x.length), 0);
  await P.click('[data-feat-go="allergens"]'); await closed(P);
  assert.equal(await where(P), "allergens");

  // On a small phone the page fits.
  await S.setViewportSize({ width: 320, height: 640 }); await openFeatures(S);
  assert.ok(await S.evaluate(() => $("#sheet").scrollWidth <= innerWidth));
  assert.deepEqual([O.errs, M.errs, S.errs, P.errs], [[], [], [], []]);
});

test("the owner switches features off for everyone, and switching them on brings everything back", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  // Before: a time-off request, an incident, and staff on the Allergens tab.
  await S.evaluate(() => Promise.all([LIVE.api.ask({ kind: "off", date1: ukDay(Date.now() + 7 * 864e5), date2: ukDay(Date.now() + 7 * 864e5), eta: "", with: "", note: "Wedding" }), LIVE.api.incident("Guest complaint", "Cold fries")]));
  await M.waitForFunction(() => LIVE.asks.length === 1 && LIVE.incidents.length === 1);
  await S.click("[data-tab=allergens]");

  // The owner unticks two in the page, then the rest of what Black Tap leaves to Nory and Alert65.
  await openFeatures(O);
  await O.click('[data-feat-sw="allergens"]');
  await O.waitForFunction(() => /^Allergens is off for everyone here$/.test($("#toast").textContent));
  await O.click('[data-feat-sw="rota"]');
  await switched(S, ["allergens", "rota"]);
  assert.match(await card(O, "rota"), /^Rota Off here /);
  assert.match(flat(await O.$eval("#feat", (e) => e.innerText)), /Last switched on or off by Olly Owner, /);
  const off = ["allergens", "rota", "calendar", "asks", "chat", "incidents", "kpis", "training", "feedback", "pay", "football"];
  await O.evaluate((o) => LIVE.api.setOff(o), off);
  for (const p of [M, S]) await switched(p, off);

  // Staff: no Allergens tab (and off it if they were on it), no Chat or Rota, only Running late in Me, no My pay.
  assert.equal(await where(S), "drinks");
  assert.deepEqual(await navTabs(S), ["drinks", "make", "practice", "tally", "info"]);
  assert.equal(await S.evaluate(() => getComputedStyle($("nav.tabs")).gridTemplateColumns.split(" ").length), 5);
  await S.evaluate(() => show("allergens"));
  assert.equal(await where(S), "drinks", "a switched-off tab can't be opened");
  await S.evaluate(() => show("notices"));
  assert.deepEqual(await teamTabs(S), ["board:Board", "activity:Activity", "reports:Reports", "me:Me"]);
  await S.click("[data-tpane=me]");
  assert.deepEqual(await S.$$eval("[data-mek]", (x) => x.map((b) => b.dataset.mek)), ["late"]);
  assert.doesNotMatch(await S.$eval("#me", (e) => e.innerText), /YOUR REQUESTS|Time off/, "time off is hidden, not deleted");
  assert.equal((await S.$$eval("#dash button", (x) => x.map((b) => b.textContent))).filter((t) => /next shift/.test(t)).length, 0);
  await S.evaluate(() => show("pay"));
  assert.equal(await where(S), "drinks", "no Pay tab");
  assert.equal(await S.locator("#pay-h").count(), 0);
  await S.evaluate(() => show("practice"));
  assert.equal(await S.locator("#p-signed").count(), 0, "no training sign-offs in Practise");

  // A manager: the Rota tab is just Requests, no incidents, KPIs, training or feedback, and no football form.
  await M.evaluate(() => show("notices"));
  assert.deepEqual(await teamTabs(M), ["board:Board", "rota:Requests", "reports:Reports", "managers:Managers", "me:Me"]);
  await M.click("[data-tpane=rota]");
  assert.equal(await M.$eval("#rota", (e) => e.innerHTML), "");
  assert.doesNotMatch(await M.$eval("#requests", (e) => e.innerText), /Wedding/);
  await M.click("[data-tpane=reports]");
  assert.deepEqual(await M.$$eval("[data-rp-show]", (x) => x.map((b) => b.dataset.rpShow)), ["all", "bar", "floor", "kitchen", "flagged"]);
  assert.doesNotMatch(await M.$eval("#reports", (e) => e.innerText), /OPEN INCIDENTS|Cold fries/);
  await M.click("[data-tpane=managers]");
  assert.deepEqual(await M.$$eval("#msub [data-msub]", (x) => x.map((b) => b.dataset.msub)), ["live", "act", "out", "team"]);
  const tiles = await M.$$eval("#dash button span", (x) => x.map((e) => e.textContent));
  assert.ok(!tiles.some((t) => /shifts? to fill|open incidents/.test(t)), tiles.join());
  await M.evaluate(() => show("tally"));
  assert.equal(await M.locator("#fx-add").count(), 0, "no football");

  // Only the owner, and only features that can be switched off.
  assert.equal(await attempt(M, () => LIVE.api.setOff([])), "permission-denied");
  assert.equal(await attempt(S, () => LIVE.api.setOff([])), "permission-denied");
  assert.equal(await attempt(O, () => LIVE.api.setOff(["drinks"])), "permission-denied");

  // A phone that saw the list keeps it while it connects.
  await S.reload(); await S.click("#w-ok");
  assert.deepEqual(await navTabs(S), ["drinks", "make", "practice", "tally", "info"]);

  // All back on: everything saved is still there.
  await O.evaluate(() => LIVE.api.setOff([]));
  for (const p of [M, S]) await switched(p, []);
  assert.deepEqual(await navTabs(S), ["drinks", "make", "allergens", "practice", "tally", "pay", "info"]);
  await M.evaluate(() => show("notices")); await M.click("[data-tpane=rota]");
  await M.waitForFunction(() => /Wedding/.test($("#requests").innerText));
  await M.click("[data-tpane=reports]");
  assert.match(await M.$eval("#reports", (e) => e.innerText), /OPEN INCIDENTS\s.*Cold fries/s);
  await S.evaluate(() => show("notices")); await S.click("[data-tpane=me]");
  assert.match(await S.$eval("#me", (e) => e.innerText), /YOUR REQUESTS\sTime off · /);
  assert.equal(await toastOf(S), "");
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});

test("the tour opens each feature that's on, one step at a time", async () => {
  await resetEmulators();
  const { O, M, S } = await team(browser, site, people);
  const step = async (p) => flat(await p.$eval("#tour", (e) => (e.hidden ? "" : e.innerText)));
  const walk = async (p) => {
    const seen = [];
    for (;;) {
      const t = await step(p), m = t.match(/^STEP (\d+) OF (\d+) /);
      seen.push(`${(await p.$eval("#tour b", (e) => e.textContent))} ${await where(p)}`);
      if (m[1] === m[2]) { await p.click("#tour [data-tour='-1']"); break; }
      await p.click("#tour .btn.pri");
    }
    return seen;
  };

  await openFeatures(S);
  await S.click("#tour-go"); await closed(S);
  assert.match(await step(S), /^STEP 1 OF 14 Drinks Every drink with its spec/);
  const shift = await S.evaluate(() => defaultPane());
  assert.deepEqual(await walk(S), ["Drinks drinks", "Cocktail maker make", "Allergens allergens", "Practise practice", "My pay pay", `Checklists tally:${shift}`, "Date labels tally:labels",
    "Restock and 86 tally:stock", "Shift report tally:send", "Issues and handover team:board", "Chat team:chat", "Rota team:rota", "Calendar team:rota", "Reports team:reports"]);
  assert.equal(await step(S), "", "Done ends the tour");

  // Back goes back a step; End the tour stops it.
  await openFeatures(S); await S.click("#tour-go"); await closed(S);
  await S.click("#tour .btn.pri"); await S.click("#tour .btn.pri");
  assert.match(await step(S), /^STEP 3 OF 14 Allergens/);
  await S.click("#tour [data-tour='1']");
  assert.match(await step(S), /^STEP 2 OF 14 Cocktail maker/);
  assert.equal(await where(S), "make");
  // The card sits above the tabs and fits a small phone.
  await S.setViewportSize({ width: 320, height: 640 }); await S.click("#tour [data-tour='2']");
  assert.ok(await S.evaluate(() => { const t = $("#tour").getBoundingClientRect(), n = $("nav.tabs").getBoundingClientRect(); return t.bottom <= n.top && t.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; }));
  await S.click("#tour [data-tour='-1']:not(.pri)");
  assert.equal(await step(S), "");

  // A manager's tour adds Live, the KPIs and training; whatever's switched off is left out.
  await O.evaluate(() => LIVE.api.setOff(["rota", "chat", "allergens"]));
  await switched(M, ["rota", "chat", "allergens"]);
  await openFeatures(M); await M.click("#tour-go"); await closed(M);
  assert.deepEqual(await walk(M), ["Drinks drinks", "Cocktail maker make", "Practise practice", "My pay pay", `Checklists tally:${shift}`, "Date labels tally:labels", "Restock and 86 tally:stock",
    "Shift report tally:send", "Issues and handover team:board", "Calendar team:rota", "Reports team:reports", "Live team:managers:live", "Closing KPIs team:managers:kpis", "Training team:managers:training"]);
  assert.deepEqual([O.errs, M.errs, S.errs], [[], [], []]);
});
