import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team } from "./helpers.mjs";
let site, browser, data;
before(async () => { site = await serve(".emusite"); browser = await launch();
  const g = await browser.newPage(); data = await g.evaluate(() => { const c = document.createElement("canvas"); c.width = 320; c.height = 240; const x = c.getContext("2d"); x.fillStyle = "#6a5"; x.fillRect(0, 0, 320, 240); return c.toDataURL("image/jpeg", 0.8); }); await g.close(); });
after(async () => { await browser.close(); site.close(); });
const SH = process.env.SHOTS;
test("drinks Select and Share, every photo in one place, iPad jobs and what shows", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff"], ["T", "Tia Staff"]]);
  // Drinks select
  await S.evaluate(() => show("drinks")); await S.click("#list [data-pick]");
  const rows = S.locator("#list .row.picking"); await rows.nth(0).click(); await rows.nth(1).click();
  assert.match(await S.$eval("#pickbar", (e) => e.textContent), /2 drinks/);
  await S.evaluate(() => { PL.view = "menu"; renderList(); });
  await S.click("#list [data-pick-all] >> nth=0");
  if (SH) await S.screenshot({ path: `${SH}/pick.png` });
  await S.click("#pickbar [data-send=specs]"); await S.waitForSelector("#send-pre");
  const pre = await S.$eval("#send-pre", (e) => e.textContent);
  assert.match(pre, /Specs as of /); assert.match(pre, /#list=~/);
  console.log(pre.slice(0, 600));
  await S.click("#sh-close"); await S.click("#pickbar [data-pick-done]");
  // Drink share
  await S.evaluate(() => openSheet(D.find((d) => d.subs)?.id)); await S.click("#sheet [data-send=drink]");
  await S.waitForFunction(() => snd.photos.length >= 1);
  const dp = await S.$eval("#send-pre", (e) => e.textContent); assert.match(dp, /Out of something\?/); assert.match(dp, /Spec as of/);
  if (SH) await S.screenshot({ path: `${SH}/drinkshare.png`, fullPage: false });
  await S.evaluate(() => closeSheet());
  // Photos from two phones, one sent
  await S.evaluate((d) => LIVE.api.addPhoto(d, "bar"), data); await T.evaluate((d) => LIVE.api.addPhoto(d, "floor"), data);
  await S.evaluate((d) => LIVE.api.addPhoto(d, "bar"), data);
  await S.waitForFunction(() => tonightPhotos().length === 3);
  await S.evaluate(() => LIVE.api.sendReport("bar", "Bar shift", "Bar · test", draftPhotos().slice(0, 1)));
  await M.waitForFunction(() => LIVE.reports.length === 1 && !LIVE.reports[0].pending);
  await M.evaluate(() => openAt("photos")); await M.waitForSelector("#gal .gal-ph");
  assert.equal(await M.$$eval("#gal .gal-ph", (x) => x.length), 3);
  await M.click("#gal [data-gal-all]"); 
  if (SH) await M.screenshot({ path: `${SH}/gallery.png` });
  await M.click("#gal [data-gal-send]"); await M.waitForFunction(() => snd?.photos.length === 3);
  const gp = await M.$eval("#send-pre", (e) => e.textContent); console.log(gp);
  await M.click("#sh-close"); await M.waitForSelector("#gal .gal-ph");
  if (SH) await M.screenshot({ path: `${SH}/gallery2.png` });
  // iPad station: the jobs under Tonight, and what shows switched in Set up
  await M.setViewportSize({ width: 1080, height: 810 }); await M.evaluate(() => { closeSheet(); stationSet(true); show("station"); });
  await M.waitForSelector("#sx-live .sx-jobs");
  if (SH) await M.screenshot({ path: `${SH}/station.png` });
  await M.click("#sx-views [data-sx-view=setup]"); await M.click("[data-sx-tileset=go-count]"); await M.click("[data-sx-tileset=quiz]");
  assert.equal(await M.$eval('#sx-live [data-sx-tile="go-count"]', (e) => e.hidden), true);
  await M.evaluate(() => sessionStorage.setItem("sx.auto", "1")); await M.reload(); await M.waitForSelector("#sx-live .sx-jobs");
  assert.equal(await M.$eval('#sx-live [data-sx-tile="go-count"]', (e) => e.hidden), true);
  assert.equal(await M.$eval("#sx-views [data-sx-view=quiz]", (e) => e.hidden), true);
  await M.click("#sx-live [data-goto=photos]"); await M.waitForSelector("#gal");
  if (SH) await M.screenshot({ path: `${SH}/station-gal.png` });
  assert.deepEqual([M.errs, S.errs, T.errs], [[], [], []]);
});
