// The money sandbox: managers try out the sums behind a week with made-up numbers, kept on their own phone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const out = (p) => p.$eval("#mo-out", (e) => e.innerText.replace(/\s+/g, " "));
// Each result as "what: figure", without the small print under it.
const rows = (p) => p.$$eval("#mo-out .mo-row", (xs) => xs.map((x) => `${x.querySelector("span").firstChild.textContent}: ${x.querySelector("b").textContent}`));

test("a manager tries out sales, GP, labour and rent with made-up numbers; staff don't have it", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await part(S, "");
  assert.equal(await S.$('#hub [data-tpane="money"]'), null);
  assert.ok(await S.$eval("#money-btn", (e) => e.hidden), "no £ beside the bell for staff");

  // The £ beside the bell opens it.
  await M.click("#money-btn");
  await M.waitForFunction(() => !$("#money").hidden && /Money sandbox/.test($("#placebar").textContent));
  assert.match(await out(M), /Put in some sales/);
  await M.click("#mo-eg");
  // £24,000 wet and £12,000 dry with VAT at 20% is £30,000 net; £8,000 of stock leaves £22,000 GP.
  // 480 hours at £13.50 plus 15% is £7,452, plus £2,400 salaries. Break-even is (£9,852 + £5,700) / 73.3%.
  assert.deepEqual(await rows(M), ["Gross sales (with VAT): £36,000.00", "Net sales (without VAT): £30,000.00",
    // 1,800 guests: £20 a head with VAT, £16.67 without.
    "Spend per head: £20.00", "GP per guest: £12.22", "Labour per guest: £5.47", "Guests to break even: 1,273", "Guests to make £8,000.00: 1,927", "Wet GP: £15,000.00 · 75.0%", "Dry GP: £7,000.00 · 70.0%",
    "Overall GP: £22,000.00 · 73.3%", "Labour: £9,852.00 · 32.8%", "Rent: £3,500.00 · 11.7%", "Prime cost (stock and labour): 59.5%",
    "After stock, labour, rent and other costs: £6,448.00 · 21.5%", "Break-even net sales: £21,207.27", "Net sales to make £8,000.00: £32,116.36",
    "Net sales: £1,560,000.00", "What's left: £335,296.00"]);
  // The chart at the top: where net sales go, kept in view while the sliders move.
  assert.equal(await M.$eval("#mo-sum .mo-head", (e) => e.textContent.replace(/\s+/g, " ").trim()), "What's left£6,448.00 · 21.5%");
  assert.equal(await M.$eval("#mo-sum .mo-key", (e) => e.textContent.replace(/\s+/g, " ").trim()), "Stock 26.7%Labour 32.8%Rent 11.7%Other costs 7.3%What's left 21.5%");
  await M.click(".mo-seg.s-labour");
  assert.equal(await M.$eval("#mo-tip", (e) => e.textContent), "Labour: £9,852.00, 32.8% of net sales");
  // A slider changes the figure and everything with it.
  await M.$eval('[data-mo-r="rent"]', (e) => { e.value = "4000"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal(await M.$eval('[data-mo="rent"]', (e) => e.value), "4000");
  assert.match(await M.$eval("#mo-sum .mo-head", (e) => e.textContent), /£5,948\.00/);
  await M.fill('[data-mo="rent"]', "3500");
  assert.equal(await M.$eval('[data-mo-r="rent"]', (e) => e.value), "3500");
  await M.click(".mo-col >> nth=0");
  assert.equal(await M.$eval("#mo-ftip", (e) => e.textContent), "Week 1: £6,668.00 left, £30,300.00 net sales, running total £6,668.00");
  // The forecast grows sales 1% a week; labour and fixed costs stay put.
  assert.deepEqual(await M.$$eval("#mo-out table tr", (r) => r.slice(1, 3).map((x) => [...x.cells].map((c) => c.textContent).join(" "))), ["1 £30,300.00 £6,668.00 £6,668.00", "2 £30,603.00 £6,890.20 £13,558.20"]);
  // A pint from a 50 litre keg at £120: £1.36 a pint; at £6.50 that's 74.8%, and 70% needs £5.45.
  assert.match(await M.$eval("#mo-drink", (e) => e.innerText.replace(/\s+/g, " ")), /One serve costs About 88 serves .* £1\.36 GP at that price .* £4\.05 · 74\.8% Price for a 70% GP Including VAT £5\.45/);

  // Two extra 8-hour shifts at £13.50 plus 15%: £248.40, paid for by about £406.47 more sales with VAT.
  await M.fill('[data-mo="xShifts"]', "2");
  assert.ok((await rows(M)).includes("The 2 extra shifts: £248.40"));
  assert.match(await out(M), /they need about £406\.47 more sales with VAT/);
  // Save it, take the shifts off, and compare.
  await M.click("#mo-saves summary");
  await M.fill("#mo-name", "Two more shifts");
  await M.click("#mo-keep");
  await M.fill('[data-mo="xShifts"]', "0");
  await M.click('[data-mo-cmp="0"]');
  assert.match(await out(M), /Now against “Two more shifts”.*Labour 32\.8% 33\.7%/is);
  // A 5% price rise with the same drinks sold: £31,500 net and GP up, as the stock costs the same.
  await M.fill('[data-mo="rise"]', "5");
  assert.ok((await rows(M)).includes("Overall GP: £23,500.00 · 74.6%"));
  await M.fill('[data-mo="rise"]', "0");
  assert.match(await out(M), /Wet 66\.7%, dry 33\.3%.*£16\.67 without VAT: wet £11\.11, dry £5\.56.*About £25,448\.73 with VAT/);

  // What if sales drop by a fifth: sales and stock fall, labour and rent don't.
  await M.$eval('[data-mo="what"]', (e) => { e.value = "-20"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.match(await M.$eval("#mo-wt", (e) => e.textContent), /^-20% sales and guests$/);
  const r = await rows(M);
  assert.ok(r.includes("Net sales (without VAT): £24,000.00") && r.includes("Labour: £9,852.00 · 41.0%") && r.includes("After stock, labour, rent and other costs: £2,048.00 · 8.5%"), r.join("; "));

  await M.fill('[data-mo="rent"]', "lots");
  assert.match(await out(M), /Check Rent: each should be a number, 0 or more\./);
  await M.fill('[data-mo="rent"]', "20000");
  assert.ok((await rows(M)).includes("After stock, labour, rent and other costs: −£14,452.00 · −60.2%"));

  await M.fill('[data-mo="rent"]', "3500");
  // The day plan: 11 made-up shifts, 8 on at the busiest hour; used for the labour, 56.5 hourly hours a day for 7 days.
  assert.match(await M.$eval("#mo-dtip", (e) => e.textContent), /^Busiest: 8 people at 18:00\./);
  await M.click(".mo-hr >> nth=8");
  assert.equal(await M.$eval("#mo-dtip", (e) => e.textContent), "19:00 to 20:00: 7 people working (bar 2, floor 2, kitchen 2, managers 1)");
  await M.$eval('[data-mo="what"]', (e) => { e.value = "0"; e.dispatchEvent(new Event("input", { bubbles: true })); });
  await M.check("#mo-day-use");
  assert.match(await M.$eval(".mo-from", (e) => e.textContent), /Hourly hours: 396, from the day plan/);
  assert.ok((await rows(M)).includes("Labour: £8,540.14 · 28.5%"));
  // Switch the late bar shift off: 8 hours a day fewer.
  await M.uncheck('[data-mo-on="e2"]');
  assert.ok((await rows(M)).includes("Labour: £7,670.74 · 25.6%"));
  await M.click('[data-mo-rm="e2"]');
  await M.click("#mo-add");
  assert.equal(await M.$$eval(".mo-shift", (x) => x.length), 11);
  await M.uncheck("#mo-day-use");
  await M.fill('[data-mo="rent"]', "20000");

  // Kept on this phone only, and cleared on Clear.
  assert.equal(await M.evaluate(() => store.get("money").rent), "20000");
  await M.click("#mo-clear");
  assert.equal(await M.$eval('[data-mo="wet"]', (e) => e.value), "");
  assert.deepEqual([...M.errs, ...S.errs], []);
});
