import { webkit } from "playwright";
import { serve, resetEmulators, TEAM_CODE } from "./helpers.mjs";
const site = await serve(".emusite"); await resetEmulators();
const b = await webkit.launch();
const mk = async (o = {}) => { const c = await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, colorScheme: "dark", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1", ...o });
  await c.addInitScript(() => { localStorage.setItem("btbar.introSeen", "true"); localStorage.setItem("btbar.walk", JSON.stringify({ bar: 99, floor: 99, "bar:Kadir": 99, "bar:Emily": 99 })); });
  const p = await c.newPage(); p.on("pageerror", (e) => console.log("ERR", e.message)); p.on("dialog", (d) => d.accept()); return p; };
// 1. wrong team code from the start screen lands on the join form with the error
const p = await mk(); await p.goto(site.url);
await p.click('#welcome [data-w-name="Emily"]'); await p.fill("#w-code", "11112222"); await p.click("#w-ok");
await p.waitForTimeout(3000); console.log("wrong code ->", await p.evaluate(() => [cur, document.querySelector("#tm-top .warn")?.textContent]));
await p.screenshot({ path: "/tmp/claude-0/probe/wrongcode.png" });
await p.fill("#j-code", TEAM_CODE); await p.click("#j-go"); await p.waitForFunction(() => LIVE.me === "Emily");
// 2. specs changed since last in: an old phone that had Bulleit and the pitchers
await p.evaluate(() => {
  const fp = specFp(), mb = fp["Marshmallow Boulevard"]; fp["Marshmallow Boulevard"] = { ...mb, s: mb.s.map((x) => x.replace("Buffalo Trace", "Bulleit")) };
  for (const n of ["Pimm's Pitcher", "Mojito Pitcher", "Sangria Pitcher", "Aperol Pitcher"]) fp[n] = { s: ["x"], g: "", i: "", n: "", m: "" };
  store.set("specFp", fp); store.set("lastIn", { day: "2026-11-16", at: Date.now() - 864e5 });
});
await p.reload(); await p.click("#w-ok"); await p.waitForTimeout(3000);
await p.screenshot({ path: "/tmp/claude-0/probe/since.png" });
console.log("since card:", await p.evaluate(() => document.querySelector("#since")?.innerText));
await p.evaluate(() => { document.querySelector("#since") && sinceDone(); });
// put the old fingerprint back so the brief shows it too
await p.evaluate(() => { const fp = specFp(), mb = fp["Marshmallow Boulevard"]; fp["Marshmallow Boulevard"] = { ...mb, s: mb.s.map((x) => x.replace("Buffalo Trace", "Bulleit")) }; store.set("specFp", fp); });
await p.evaluate(() => { setMode("bar"); show("tally"); }); await p.click(".ptabs [data-pane=morning]"); await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/claude-0/probe/morning.png" });
await p.click("[data-story]"); await p.waitForTimeout(300); await p.screenshot({ path: "/tmp/claude-0/probe/story1.png" });
await p.click("[data-story-step='1']"); await p.waitForTimeout(300); await p.screenshot({ path: "/tmp/claude-0/probe/story2.png" });
const o = p.locator("[data-story-open]").first(); if (await o.count()) { await o.click(); await p.waitForTimeout(500); console.log("opened:", await p.evaluate(() => document.querySelector("#sh-name")?.textContent)); }
// 3. iPad: station shared, switch person
const i = await mk({ viewport: { width: 1080, height: 810 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15" });
await i.context().addInitScript(() => Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 }));
await i.goto(site.url); await i.click('#welcome [data-w-name="Kadir"]'); await i.fill("#w-code", TEAM_CODE); await i.click("#w-ipad");
await i.waitForFunction(() => LIVE.me === "Kadir"); await i.waitForTimeout(800);
console.log("ipad shared:", await i.evaluate(() => [sharedDev, document.querySelector('nav.tabs [data-tab="pay"]').hidden, document.querySelector("#v-station [data-who-open]")?.textContent]));
await i.click("#v-station [data-who-open]"); await i.waitForTimeout(300); await i.screenshot({ path: "/tmp/claude-0/probe/who.png" });
await i.click('#sheet [data-who="Emily"]'); await i.waitForFunction(() => LIVE.me === "Emily", null, { timeout: 15000 }).catch(() => {});
await i.waitForTimeout(800);
console.log("switched:", await i.evaluate(() => [LIVE.me, document.querySelector("#v-station [data-who-open]")?.textContent]));
await i.screenshot({ path: "/tmp/claude-0/probe/switched.png" });
await b.close(); site.close();
