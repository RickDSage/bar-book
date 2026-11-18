// Say it 🎤: loose speech is read for its key words and matched to the one item list, typos and sound-alikes included,
// the best of the phone's guesses wins, and nothing changes until Yes. Runs without the team side (live.js blocked);
// the 86 itself is covered with a real team in standout.test.mjs.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

async function open(width = 390) {
  const c = await browser.newContext({ viewport: { width, height: width > 700 ? 820 : 844 }, isMobile: width < 700, hasTouch: true, timezoneId: "Europe/London" });
  await c.addInitScript(() => (localStorage.setItem("btbar.introSeen", "true"), localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99 }))));
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  return p;
}
const parse = (p, xs) => p.evaluate((xs) => { LIVE.me = { name: "Test" }; return xs.map((x) => { const h = sdParse(x); return { kind: h.kind, names: h.names, d: h.d?.name, go: h.go, say: h.say, typed: !!h.typed, alts: (h.alts || []).map((a) => a.t) }; }); }, xs);

test("key words in loose speech: 86, back in, specs, count, pages", async () => {
  const p = await open();
  const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o] = await parse(p, ["can you 86 the Corona please", "we've run out of limes", "eighty six tanker ray", "the corona is out", "86 limes and mint",
    "limes are back", "yeah can I get the marshmallow boulevard spec real quick", "marsh mellow boulevard", "um what's in an espresso martini", "count tonic 12", "what's 86'd",
    "86 the burger sauce", "86 san miguel zero", "open closing", "86"]);
  assert.deepEqual([a.kind, a.names], ["86", ["Corona"]]);
  assert.deepEqual(b.names, ["Limes"]);
  assert.deepEqual(c.names, ["Tanqueray"], "sounds like Tanqueray");
  assert.deepEqual([d.kind, d.names], ["86", ["Corona"]]);
  assert.deepEqual(e.names, ["Limes", "Mint"]); assert.match(e.say, /86 Limes and Mint for everyone\?/);
  assert.deepEqual([f.kind, f.names], ["back", ["Limes"]]);
  assert.deepEqual([g.kind, g.d], ["drink", "Marshmallow Boulevard"]);
  assert.equal(h.d, "Marshmallow Boulevard", "split words, misheard");
  assert.equal(i.d, "Espresso Martini");
  assert.equal(j.kind, "count"); assert.match(j.say, /^Count Tonic: 12/);
  assert.deepEqual([k.kind, k.go], ["go", "stock"]);
  assert.deepEqual([l.names, l.typed], [["Burger sauce"], true], "not on the list: goes on as said, not as Strawberry sauce");
  assert.ok(l.alts.length, "with the closest ones to tap");
  assert.deepEqual(m.names, ["San Miguel 0,0"]);
  assert.deepEqual([n.kind, n.go], ["go", "lists"]);
  assert.deepEqual([o.kind, o.go], ["go", "pick86"]);
  // Still as before.
  const [x, y, z] = await parse(p, ["86 limes", "how do I make a negroni", "log it the glass washer is leaking"]);
  assert.match(x.say, /86 Limes for everyone\?/); assert.equal(y.d, "Negroni"); assert.equal(z.kind, "log");
  // The phone's five guesses: the one that makes sense wins.
  assert.equal(await p.evaluate(() => vcBest(["86 the coroner", "eighty sicks the corona", "86 the Corona"]).h.names[0]), "Corona");
  assert.deepEqual(p.errs, []);
});

test("the Say it box: what it heard, Did you mean, and a tap on the right one", async () => {
  const p = await open();
  await p.evaluate(() => { LIVE.me = null; sdVoiceOpen(); });
  await p.fill("#sd-vtext", "86 the burger sauce"); await p.press("#sd-vtext", "Enter");
  const box = await p.textContent("#sd-voice");
  assert.match(box, /Heard “86 the burger sauce”/); assert.match(box, /86 Burger sauce for everyone\?/); assert.match(box, /isn't on the list[\s\S]*Did you mean/);
  await p.click("[data-sd-valt='0']");
  assert.match(await p.textContent("#sd-voice .sd-heard b"), /^86 .+ sauce for everyone\?$/);
  assert.doesNotMatch(await p.textContent("#sd-voice .sd-heard b"), /Burger/);
  await p.fill("#sd-vtext", "hello there"); await p.press("#sd-vtext", "Enter");
  assert.match(await p.textContent("#sd-voice"), /Didn't catch a command/);
  assert.equal(await p.locator("#sd-voice [data-sd-vgo]").count(), 0, "nothing to do, no Go button");
  // Off the team, an 86 asks to join and changes nothing.
  await p.fill("#sd-vtext", "86 limes"); await p.press("#sd-vtext", "Enter"); await p.click("[data-sd-vgo]");
  assert.equal(await p.evaluate(() => LIVE.out.has("Limes")), false);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390);
  assert.deepEqual(p.errs, []);
});

test("on the iPad bar station a spec said opens in the station, not on top of it", async () => {
  const p = await open(1180);
  await p.evaluate(() => show("station"));
  await p.evaluate(() => { sdVoiceOpen(); });
  await p.fill("#sd-vtext", "negroni spec please"); await p.press("#sd-vtext", "Enter");
  assert.equal(await p.evaluate(() => D[SX.id].name), "Negroni");
  assert.equal(await p.evaluate(() => $("#sheet").hidden), true);
  assert.deepEqual(p.errs, []);
});

test("listening: the phone's guesses come in and the one that makes sense is shown", async () => {
  const c = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  await c.addInitScript(() => {
    localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99 }));
    // A stand-in for the phone's speech recognition: three guesses, the right one last.
    window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { window.REC = this; setTimeout(() => { const r = [{ transcript: "eight he sicks the coroner" }, { transcript: "86 the coroner please" }, { transcript: "86 the Corona please" }]; this.onresult({ results: [r] }); this.onend?.(); }, 30); } abort() {} stop() {} };
  });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  await p.evaluate(() => sdVoiceOpen());
  await p.waitForSelector("#sd-voice .sd-heard");
  assert.equal(await p.evaluate(() => window.REC.maxAlternatives), 5);
  assert.match(await p.textContent("#sd-voice .sd-heard"), /Heard “86 the Corona please”[\s\S]*86 Corona for everyone\?/);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 375, "fits an old iPhone");
  assert.deepEqual(errs, []);
  await c.close();
});

test("the 🎤 sits in the top bar, never over the page; it shows the words as it hears them and says when it couldn't make them out", async () => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.addInitScript(() => {
    localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99 }));
    // A stand-in for the phone's speech recognition, driven from the test.
    window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { window.REC = this; } abort() {} stop() { this.onend?.(); } };
  });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(site.url); await p.click("#w-ok");
  // In the top bar, and on the drink page's: no floating button over the list.
  assert.equal(await p.locator("#sd-mic").count(), 0);
  assert.equal(await p.isVisible(".brandbar [data-sd-mic]"), true);
  await p.evaluate(() => openSheet(D.find((d) => d.name === "Mojito").id));
  assert.equal(await p.isVisible("#sheet .sheet-top [data-sd-mic]"), true);
  await p.click("#sheet .sheet-top [data-sd-mic]");
  assert.match(await p.textContent("#sd-voice .sd-live"), /Listening: speak now/);
  assert.ok(await p.evaluate(() => document.body.classList.contains("sd-listening")));
  // Words appear as they're heard.
  await p.evaluate(() => window.REC.onresult({ results: [Object.assign([{ transcript: "mohito" }], { isFinal: false })] }));
  assert.match(await p.textContent("#sd-voice .sd-live"), /Hearing[\s\S]*“mohito”/);
  // It stopped with nothing it could use: it says so, with Try again and the box to type in.
  await p.evaluate(() => window.REC.onend());
  assert.match(await p.textContent("#sd-voice .sd-heard.no"), /Couldn't make out “mohito”/);
  assert.equal(await p.isVisible("#sd-voice [data-sd-vagain]"), true);
  assert.equal(await p.isVisible("#sd-vtext"), true);
  assert.ok(!(await p.evaluate(() => document.body.classList.contains("sd-listening"))));
  // A drink said opens straight away, closest match if it's not exact, with the next closest to tap.
  await p.click("#sd-voice [data-sd-vagain]");
  await p.evaluate(() => { const r = Object.assign([{ transcript: "a moheeto" }], { isFinal: true }); window.REC.onresult({ results: [r] }); });
  await p.waitForSelector("#sheet:not([hidden]) #sh-name");
  assert.equal(await p.textContent("#sh-name"), "Mojito");
  assert.equal(await p.isVisible("#sd-voice"), false);
  assert.match(await p.textContent("#sd-notit"), /“a moheeto”: Mojito/);
  // Voice off in More hides every 🎤.
  await p.evaluate(() => { SD.set.voice = false; sdApplyModes(); });
  assert.equal(await p.isVisible(".brandbar [data-sd-mic]"), false);
  assert.deepEqual(errs, []);
  await c.close();
});
