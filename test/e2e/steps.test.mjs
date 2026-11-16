import { test, before, after } from "node:test";
// Step by step, on a big and a small phone, for every drink: the Back / Next bar sits on the bottom edge of the screen
// (padding on the drink's scroller once lifted it, with the drink showing through underneath), and a step card only runs
// under the bar once its picture has shrunk as far as it goes (72px). Then the same for the Send page's buttons.
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, phone } from "./helpers.mjs";
let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
test("step by step fills the screen above the Back / Next bar", async () => {
  await resetEmulators();
  const p = await phone(browser, site);
  await p.evaluate(() => openSheet(D[0].id));
  await p.click('#sheet [data-view="steps"]');
  for (const [width, height] of [[390, 844], [320, 568]]) {
    await p.setViewportSize({ width, height });
    const bad = await p.evaluate(() => {
      const out = [];
      for (const d of D) {
        openSheet(d.id);
        const nav = document.querySelector("#sheet .cnav").getBoundingClientRect();
        if (Math.abs(innerHeight - nav.bottom) > 1) out.push(`${d.name}: the bar is ${Math.round(innerHeight - nav.bottom)}px off the bottom`);
        document.querySelectorAll("#car .step").forEach((st, i) => {
          if (st.getBoundingClientRect().bottom > nav.top + 1 && st.querySelector(".pic").getBoundingClientRect().height > 73) out.push(`${d.name} step ${i + 1}: runs under the bar with room left to shrink its picture`);
        });
      }
      return out;
    });
    assert.deepEqual(bad, [], `${width}x${height}`);
  }
  // The Send page's buttons are the same kind of sticky bar.
  await p.setViewportSize({ width: 390, height: 600 });
  await p.click('#sheet [data-send="drink"]');
  const send = await p.evaluate(() => { const sh = document.querySelector("#sheet");
    return { scrolls: sh.scrollHeight > sh.clientHeight, gap: Math.round(innerHeight - document.querySelector("#sheet .sendbar").getBoundingClientRect().bottom) }; });
  assert.deepEqual(send, { scrolls: true, gap: 0 });
});
