// The offline service worker: the app opens from the phone with no signal, and any other file opened straight in the
// browser (the rules for the Firebase console, a language file) shows that file, not the app.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, launch } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });

test("the rules .txt opens as text once the app is installed, and the app still opens offline", async () => {
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(site.url);
  // The app registers it only on github.io, so the test registers it the same way.
  await p.evaluate(() => navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready));
  await p.reload(); await p.waitForFunction(() => navigator.serviceWorker.controller);
  await p.goto(site.url + "firestore.rules.txt");
  assert.match(await p.textContent("body"), /^rules_version = '2';/);
  await c.setOffline(true);
  await p.goto(site.url + "?x=1");
  assert.equal(await p.title(), "Black Tap Bar Book");
  await c.close();
});
