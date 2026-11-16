// Reset this phone at the bottom of More: everything the app keeps on this phone goes, the phone leaves the team, and
// it starts again as new.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, afterReload } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam"]];
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

test("anyone clears everything on their own phone: what the app keeps goes, it starts as new, and nobody else's phone changes", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await S.evaluate(() => { store.set("favs", ["Mojito"]); store.set("theme", "dark"); show("info"); });
  // CLEAR has to be typed.
  await S.click("[data-fold=clear] summary"); await S.fill("#cp-words", "cle"); await S.click("#cp-go");
  await waitToast(S, /^Type CLEAR to show you mean it$/);
  assert.equal(await S.evaluate(() => LIVE.uid !== null), true);
  await S.fill("#cp-words", "clear"); await S.click("#cp-go");
  await afterReload(S);
  assert.deepEqual(await S.evaluate(() => [localStorage.getItem("btbar.favs"), localStorage.getItem("btbar.theme")]), [null, null]);
  await M.waitForFunction(() => LIVE.uid !== null && LIVE.staff.length === 2); // The phone left the team; the manager's phone is untouched.
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
