// Team chat end to end: the team chat, pings, private chats, groups, photos, unread badges and unsending.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, attempt } from "./helpers.mjs";

let site, browser, jpeg;
before(async () => {
  site = await serve(".emusite"); browser = await launch();
  const g = await browser.newPage();
  const data = await g.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 240; const x = c.getContext("2d");
    x.fillStyle = "#58a"; x.fillRect(0, 0, 320, 240); return c.toDataURL("image/jpeg", 0.9);
  });
  jpeg = { name: "chat.jpg", mimeType: "image/jpeg", buffer: Buffer.from(data.split(",")[1], "base64") };
  await g.close();
});
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"], ["T", "Tia Staff", "tia", "staff"]];
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);
// Opens Team, then Chat, the way someone would.
async function openChat(p) {
  await p.evaluate(() => show("notices"));
  await p.click('[data-tpane="chat"]');
  await p.waitForFunction(() => LIVE.loaded.has("chats") && LIVE.loaded.has("directory"));
}
async function say(p, text, { ping = [], photo = false } = {}) {
  if (ping.length) { if (!(await p.$eval("#ch-compose details", (d) => d.open))) await p.click("#ch-compose summary"); }
  for (const name of ping) await p.click(`#ch-compose [data-ch-ping]:text-is("@${name}")`);
  if (photo) { await p.setInputFiles("#ch-in", jpeg); await p.waitForSelector("#ch-compose .photo img"); }
  if (text) await p.fill("#ch-text", text);
  await p.click("#ch-send");
}
const msgsText = (p) => p.$eval("#ch-msgs", (e) => e.textContent);

test("the team chat: everyone's in it, a ping pops up and is marked, and reading it clears the badge", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  await openChat(S);
  await S.waitForSelector('[data-ch-open="team"]');
  // Everyone who has logged in is in the directory, so they can be pinged.
  await S.waitForFunction(() => LIVE.directory.length === 4);
  await S.click('[data-ch-open="team"]');
  await say(S, "Ice machine is playing up", { ping: ["Tia Staff"] });
  await S.waitForFunction(() => LIVE.msgs.length === 1 && !LIVE.msgs[0].pending);

  // Tia is on the drinks list: a pop-up, and the bell and Chat tab show it's new.
  await waitToast(T, /^Sam Staff pinged you: Ice machine is playing up$/);
  await T.waitForFunction(() => document.querySelector("#bell-n").textContent === "1");
  await openChat(T);
  assert.match(await T.$eval('[data-tpane="chat"]', (b) => b.textContent), /1 new/);
  assert.match(await T.$eval('[data-ch-open="team"]', (b) => b.textContent), /Team chat.*@ you.*Sam Staff: Ice machine is playing up/s);
  await T.click('[data-ch-open="team"]');
  await T.waitForFunction(() => /Ice machine/.test(document.querySelector("#ch-msgs")?.textContent));
  assert.match(await msgsText(T), /Sam Staff.*@you.*Ice machine is playing up/s);
  assert.equal(await T.$$eval(".msg.at", (x) => x.length), 1);
  // Reading it clears the ping and the badge.
  await T.waitForFunction(() => LIVE.pings.length === 0 && !LIVE.chats.some((c) => c.lastUid !== LIVE.uid && c.read?.[LIVE.uid] === undefined));
  await T.waitForFunction(() => document.querySelector("#bell-n").hidden);

  // Managers and the owner are in the team chat too; nobody was pinged, so it's just new for them.
  for (const p of [M, O]) {
    await openChat(p);
    await p.waitForFunction(() => /Ice machine/.test(document.querySelector('[data-ch-open="team"]')?.textContent));
    assert.equal(await p.evaluate(() => LIVE.pings.length), 0);
  }
  await T.fill("#ch-text", "On it");
  await T.click("#ch-send");
  await S.waitForFunction(() => LIVE.msgs.length === 2);
  for (const p of [O, M, S, T]) assert.deepEqual(p.errs, []);
});

test("a private chat: only the two of them see it, every message pings, and a message can be unsent", async () => {
  await resetEmulators();
  const { O, M, S, T } = await team(browser, site, people);
  await openChat(S);
  await S.waitForFunction(() => LIVE.directory.length === 4);
  await S.click('[data-ch-view="people"]');
  await S.click('[data-ch-dm]:text-is("Tia Staff")');
  await S.waitForSelector("#ch-text");
  assert.match(await S.$eval(".chhead", (e) => e.textContent), /Tia Staff/);
  await say(S, "Can you cover Friday?");
  await waitToast(T, /^Sam Staff: Can you cover Friday\?$/);
  await openChat(T);
  const id = await S.evaluate(() => LIVE.api.dmId(LIVE.directory.find((p) => p.name === "Tia Staff").uid));
  await T.click(`[data-ch-open="${id}"]`);
  await T.waitForFunction(() => /Can you cover Friday/.test(document.querySelector("#ch-msgs")?.textContent));
  await say(T, "Yes, no problem");
  await S.waitForFunction(() => LIVE.msgs.length === 2 && LIVE.msgs.every((m) => !m.pending));

  // Managers and the owner can't see it, even by asking for it directly.
  for (const p of [M, O]) {
    await openChat(p);
    assert.equal(await p.evaluate((id) => LIVE.chats.some((c) => c.id === id), id), false);
    assert.equal(await attempt(p, (id) => LIVE.api.markRead({ id }), id), "permission-denied");
  }

  // Sam unsends the first message; it goes for both of them.
  await S.click('.msg.me [data-ch-unsend]');
  await T.waitForFunction(() => LIVE.msgs.length === 1);
  assert.doesNotMatch(await msgsText(T), /Friday/);
  assert.equal(await T.$$eval("[data-ch-unsend]", (x) => x.length), 1);
  for (const p of [O, M, S, T]) assert.deepEqual(p.errs, []);
});

test("a group with a photo: only its members read it, whoever started it changes it, and anyone leaves", async () => {
  await resetEmulators();
  const { M, S, T } = await team(browser, site, people);
  await openChat(M);
  await M.waitForFunction(() => LIVE.directory.length === 4);
  await M.click('[data-ch-view="group"]');
  await M.fill("#ch-title", "Friday close");
  await M.click('[data-ch-mem]:text-is("Sam Staff")');
  await M.click("#ch-make");
  await M.waitForSelector(".chhead");
  await M.waitForFunction(() => /Friday close/.test(document.querySelector(".chhead").textContent));
  await say(M, "Bins by the back door, please", { photo: true });
  await M.waitForFunction(() => LIVE.msgs.length === 1 && !LIVE.msgs[0].pending);

  await waitToast(S, /^Mia Manager in Friday close: Bins by the back door, please$/);
  await openChat(S);
  const gid = await S.evaluate(() => LIVE.chats.find((c) => c.kind === "group").id);
  await S.click(`[data-ch-open="${gid}"]`);
  await S.waitForSelector("#ch-msgs .msg img");
  assert.match(await S.$eval("#ch-msgs .msg img", (i) => i.src), /^data:image\/jpeg;base64,/);
  assert.doesNotMatch(await S.$eval("#chat", (e) => e.textContent), /Change group/);

  // Tia isn't in it and can't read it.
  await openChat(T);
  assert.equal(await T.evaluate((g) => LIVE.chats.some((c) => c.id === g), gid), false);

  // Mia adds Tia; Tia now sees it and its history.
  await M.click("[data-ch-edit]");
  await M.click('[data-ch-mem]:text-is("Tia Staff")');
  await M.click("#ch-make");
  await T.waitForSelector(`[data-ch-open="${gid}"]`);
  await T.click(`[data-ch-open="${gid}"]`);
  await T.waitForFunction(() => /Bins by the back door/.test(document.querySelector("#ch-msgs")?.textContent));

  // Sam leaves.
  await S.click("[data-ch-leave]");
  await S.waitForFunction((g) => !LIVE.chats.some((c) => c.id === g), gid);
  await M.waitForFunction(() => /Mia Manager|You/.test(document.querySelector("#chat .note")?.textContent) && !/Sam Staff/.test(document.querySelector("#chat .note").textContent));
  for (const p of [M, S, T]) assert.deepEqual(p.errs, []);
});
