// The quiz in Practise: ten questions made from our own specs. Tonight's is the same ten on every phone, made from the
// night's date, and the first go is the one that counts: logged in, which questions were right goes to the managers,
// who see the night, the questions the team gets wrong and each person's week on the Training page. What goes to the
// team chat is the answers worth knowing, never a ranking.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { serve, resetEmulators, launch, team, part, attempt } from "./helpers.mjs";

let site, browser;
before(async () => { site = await serve(".emusite"); browser = await launch(); });
after(async () => { await browser.close(); site.close(); });
const people = [["M", "Mia Manager", "mia", "manager"], ["S", "Sam Staff", "sam", "staff"]];
const flat = (s) => s.replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const text = async (p, sel) => flat(await p.$eval(sel, (e) => e.innerText));
const waitText = (p, sel, re) => p.waitForFunction(([s, r]) => new RegExp(r).test((document.querySelector(s)?.innerText || "").replace(/\s+/g, " ")), [sel, re.source]);
const waitToast = (p, re) => p.waitForFunction((s) => new RegExp(s).test(document.querySelector("#toast").textContent), re.source);

// A phone logged out, with live.js stopped, on a Friday evening.
async function open() {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, timezoneId: "Europe/London" });
  await c.route("**/live.js", (r) => r.abort());
  const p = await c.newPage();
  p.errs = [];
  p.on("pageerror", (e) => p.errs.push(e.message));
  await p.clock.setFixedTime(new Date("2026-11-20T20:00:00Z"));
  await p.goto(site.url);
  await p.click("#w-ok");
  return p;
}
const practise = async (p) => { await p.click("nav.tabs [data-tab=drinks]"); await p.click("#subnav [data-tab=practice]"); };
const quizMode = async (p) => { await practise(p); await p.click('#pmode [data-pmode="quiz"]'); };
// Answers the question on screen, right or wrong, then goes on.
async function answer(p, right) {
  const i = await p.evaluate((r) => { const q = qz.qs[qz.i]; return q.opts.findIndex((o) => (o === q.answer) === r); }, right);
  await p.locator("#pquiz [data-qz-pick]").nth(i).click();
  await p.click('#pquiz [data-qz="next"]');
}
const questions = (p) => p.evaluate(() => qz.qs.map((q) => `${q.name} | ${q.ask}${q.of ? ` ${q.of}` : ""} | ${q.opts.join(" / ")}`));

test("tonight's quiz is the same ten questions on every phone, shows the right answer after each, and the score at the end", async () => {
  const A = await open(), B = await open();
  for (const p of [A, B]) {
    await practise(p);
    assert.equal(await text(p, "#plead"), "Say the spec out loud, then check it.");
    await p.click('#pmode [data-pmode="quiz"]');
    assert.equal(await text(p, "#plead"), "Ten questions from our own specs.");
    assert.deepEqual(await p.evaluate(() => [$("#pcard").hidden, $("#ppool").hidden, $("#pquiz").hidden]), [true, true, false]);
    assert.equal(await text(p, "#pquiz"), "Tonight's quiz The same 10 questions for everyone tonight. Start tonight's quiz "
      + "Practice quiz Ten questions from one part of the menu. Signatures Classics Shots & bombs Everything Start a practice quiz");
    await p.click('#pquiz [data-qz="night"]');
  }
  const qs = await questions(A);
  assert.equal(qs.length, 10);
  assert.deepEqual(await questions(B), qs, "the same ten, in the same order, with the answers in the same order");
  assert.equal(new Set(await A.evaluate(() => qz.qs.map((q) => q.id))).size, 10, "ten different drinks");
  assert.match(await text(A, "#pquiz"), /^Question 1 of 10 /);

  // Right: the answer is marked, every answer is locked, and Next comes up.
  const first = await A.evaluate(() => qz.qs[0]);
  await A.locator("#pquiz [data-qz-pick]").nth(first.opts.indexOf(first.answer)).click();
  assert.equal(await text(A, "#pquiz .qz-said"), "Right.");
  assert.deepEqual(await A.$$eval("#pquiz [data-qz-pick]", (x) => x.map((b) => [b.disabled, b.classList.contains("right")])), first.opts.map((o) => [true, o === first.answer]));
  assert.equal(await text(A, '#pquiz [data-qz="next"]'), "Next question");
  await A.click('#pquiz [data-qz="next"]');
  assert.match(await text(A, "#pquiz"), /^Question 2 of 10 /);
  for (let i = 1; i < 10; i++) await answer(A, true);
  assert.equal(await text(A, "#pquiz"), "10 out of 10 Perfect. Another practice quiz Done");

  // Stopped part way, the first go carries on where it was, after a reload too, with the answers given still given.
  await answer(B, false);
  assert.match(await text(B, "#pquiz"), /^Question 2 of 10 .* Stop the quiz$/);
  await B.click('#pquiz [data-qz="home"]');
  assert.match(await text(B, "#pquiz"), /^Tonight's quiz The same 10 questions for everyone tonight\. You stopped at question 2 of 10\. Carry on tonight's quiz Practice quiz/);
  await B.reload(); await B.click("#w-ok"); await practise(B);
  assert.match(await text(B, "#pquiz"), /You stopped at question 2 of 10\. Carry on tonight's quiz/);
  await B.click('#pquiz [data-qz="night"]');
  assert.match(await text(B, "#pquiz"), /^Question 2 of 10 /);
  assert.deepEqual(await B.evaluate(() => [qz.first, qz.picks.length, qz.picks[0] !== qz.qs[0].answer]), [true, 1, true]);
  assert.deepEqual(await questions(B), qs, "the same ten as before");

  // Wrong: the pick and the right answer are both marked.
  for (let i = 1; i < 9; i++) await answer(B, false);
  const last = await B.evaluate(() => qz.qs[9]), wi = last.opts.findIndex((o) => o !== last.answer);
  await B.locator("#pquiz [data-qz-pick]").nth(wi).click();
  assert.equal(await text(B, "#pquiz .qz-said"), "Not quite.");
  assert.deepEqual(await B.$$eval("#pquiz [data-qz-pick]", (x) => x.map((b) => (b.classList.contains("right") ? "right" : b.classList.contains("wrong") ? "wrong" : ""))),
    last.opts.map((o, j) => (o === last.answer ? "right" : j === wi ? "wrong" : "")));
  assert.equal(await text(B, '#pquiz [data-qz="next"]'), "See your score");
  await B.click('#pquiz [data-qz="next"]');
  assert.match(await text(B, "#pquiz"), /^0 out of 10 Practise these, then try again\. To practise /);
  assert.equal(await B.$$eval("#pquiz .staffrow", (x) => x.length), 10);
  // Each one missed says what was asked and the answer, and opens its drink.
  const q0 = await B.evaluate(() => qz.qs[0]);
  assert.equal(await text(B, "#pquiz .staffrow >> nth=0"), flat(`${q0.name} ${q0.ask} ${q0.of ? `${q0.of}: ` : ""}${q0.answer} Open the drink`));
  await B.click("#pquiz .staffrow >> nth=0 >> [data-open]");
  await B.waitForSelector("#sheet", { state: "visible" });
  assert.equal(await text(B, "#sh-name"), q0.name);
  await B.click("#sh-close"); await B.waitForSelector("#sheet", { state: "hidden" });

  // Back home, each phone has its own go; another go doesn't replace the first.
  await B.click('#pquiz [data-qz="home"]');
  assert.match(await text(B, "#pquiz"), /^Tonight's quiz The same 10 questions for everyone tonight\. You got 0 out of 10 tonight\. Take it again Practice quiz/);
  await A.click('#pquiz [data-qz="home"]');
  await A.click('#pquiz [data-qz="night"]');
  for (let i = 0; i < 10; i++) await answer(A, false);
  await A.click('#pquiz [data-qz="home"]');
  assert.match(await text(A, "#pquiz"), /You got 10 out of 10 tonight\. Take it again/);
  await A.reload(); await A.click("#w-ok"); await practise(A);
  assert.match(await text(A, "#pquiz"), /You got 10 out of 10 tonight\./, "the quiz is still picked, with tonight's go");

  // A practice quiz comes from the part of the menu picked. The Signatures are fewer than ten, so some come up twice,
  // with a different question each time.
  await B.click('#pquiz [data-pool="Shots & bombs"]');
  assert.equal(await B.getAttribute('#pquiz [data-pool="Shots & bombs"]', "aria-pressed"), "true");
  await B.click('#pquiz [data-qz="practice"]');
  assert.equal(await B.evaluate(() => qz.qs.length === 10 && qz.qs.every((q) => POOLS["Shots & bombs"](D.find((d) => d.id === q.id)))), true);
  await B.click('#pquiz [data-qz="home"]');
  await B.click('#pquiz [data-pool="Signatures"]');
  await B.click('#pquiz [data-qz="practice"]');
  assert.deepEqual(await B.evaluate(() => [qz.qs.length, new Set(qz.qs.map((q) => `${q.id} ${q.kind}`)).size, qz.qs.every((q) => POOLS.Signatures(D.find((d) => d.id === q.id)))]), [10, 10, true]);
  for (const p of [A, B]) assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 390, "nothing wider than the screen");
  assert.deepEqual([A.errs, B.errs], [[], []]);
});

test("no question has two right answers: the wrong ones never mean the same as the right one, and are never in the drink", async () => {
  const p = await open();
  const bad = await p.evaluate(() => {
    const out = [], spec = (d) => d.spec.join(" ").toLowerCase();
    const check = (name, fits, qs) => {
      const drinks = D.filter(fits);
      if (qs.length !== QZ_N) out.push(`${name}: ${qs.length} questions`);
      if (new Set(qs.map((q) => `${q.id} ${q.kind}`)).size !== qs.length) out.push(`${name}: the same question twice`);
      if (drinks.length >= QZ_N && new Set(qs.map((q) => q.id)).size !== qs.length) out.push(`${name}: a drink twice`);
      for (const q of qs) {
        const d = D.find((x) => x.id === q.id), key = { glass: glassKey, ice: iceKey }[q.kind];
        if (!fits(d)) out.push(`${name}: ${d.name} isn't in it`);
        if (q.opts.length !== 4 || new Set(q.opts).size !== 4 || !q.opts.includes(q.answer)) out.push(`${d.name} ${q.kind}: ${q.opts.join(" / ")}`);
        if (key && q.wrong.some((w) => key(w) === key(q.answer))) out.push(`${d.name} ${q.kind}: ${q.answer} and ${q.wrong.join(" / ")}`);
        if (q.kind === "garnish" && q.wrong.some((w) => nearly(garnishKey(w), garnishKey(q.answer)))) out.push(`${d.name} garnish: ${q.answer} and ${q.wrong.join(" / ")}`);
        if (q.kind === "goesIn" && q.wrong.some((w) => spec(d).includes(w.toLowerCase()))) out.push(`${d.name}: ${q.wrong.join(" / ")} is in its spec`);
        if (q.kind === "amount" && !mlLines(d).some((l) => `${l.n} ml` === q.answer && l.what === q.of)) out.push(`${d.name}: ${q.answer} ${q.of}`);
        if (q.kind === "glass" && q.answer !== d.glass) out.push(`${d.name}: ${q.answer}`);
      }
    };
    for (let s = 0; s < 150; s++) for (const [name, fits] of Object.entries(POOLS)) check(name, fits, quizMake(D.filter(fits), seeded(s * 31 + name.length)));
    // Tonight's, night after night.
    for (let n = 0; n < 120; n++) { const day = addDays("2026-11-01", n); check(`quiz ${day}`, () => true, quizMake(D, seeded(seedOf(`quiz ${day}`)))); }
    return out;
  });
  assert.deepEqual(bad.slice(0, 10), []);
  assert.deepEqual(p.errs, []);
});

test("logged in, the first go goes to the managers once; they see the night, what was missed and the week, and send the answers", async () => {
  await resetEmulators();
  const { M, S } = await team(browser, site, people);
  await quizMode(S);
  assert.match(await text(S, "#pquiz"), /^Tonight's quiz The same 10 questions for everyone tonight\. Your first go counts\. Start tonight's quiz/);
  await S.click('#pquiz [data-qz="night"]');
  for (let i = 0; i < 10; i++) await answer(S, i < 7);
  await waitToast(S, /^Your score is in: 7 out of 10$/);
  await S.waitForFunction(() => LIVE.quiz.length === 1 && LIVE.quiz[0].right === "1111111000");
  await S.click('#pquiz [data-qz="home"]');
  assert.match(await text(S, "#pquiz"), /You got 7 out of 10 tonight\. Take it again Only your first go counts\./);
  // A second go doesn't change it, and nor can anything else.
  await S.click('#pquiz [data-qz="night"]');
  for (let i = 0; i < 10; i++) await answer(S, true);
  assert.equal(await text(S, "#pquiz .card h2"), "10 out of 10");
  assert.equal(await S.evaluate(() => LIVE.quiz.map((x) => x.right).join()), "1111111000");
  const day = await S.evaluate(() => shiftDay());
  assert.equal(await attempt(S, (d) => LIVE.api.saveQuiz(d, "1111111111"), day), "permission-denied");

  // Managers see tonight's scores by name, the questions missed with their answers, and each person's week.
  const qs = await M.evaluate(() => qzNightQs(shiftDay()));
  const missed = (n, of) => qs.slice(7).map((q) => `${q.name} ${q.ask} ${q.of ? `${q.of}: ` : ""}${q.answer} missed by ${n} of ${of}`).join(" ");
  await part(M, "training");
  await waitText(M, "#mtrain", /Sam Staff 7 out of 10/);
  assert.match(await text(M, "#mtrain"), new RegExp(`^${esc(`TRAINING TONIGHT'S QUIZ Sam Staff 7 out of 10 1 took it, average 7 out of 10 MOST MISSED, LAST 7 NIGHTS ${missed(1, 1)} Worth going over at the briefing. `
    + "LAST 7 NIGHTS Sam Staff 1 quiz, average 7 Send the quiz round-up SIGN-OFFS ")}`));
  await quizMode(M);
  await M.click('#pquiz [data-qz="night"]');
  for (let i = 0; i < 10; i++) await answer(M, true);
  await waitToast(M, /^Your score is in: 10 out of 10$/);
  await part(M, "training");
  await waitText(M, "#mtrain", /Mia Manager 10 out of 10/);
  assert.match(await text(M, "#mtrain"), new RegExp(`^${esc(`TRAINING TONIGHT'S QUIZ Mia Manager 10 out of 10 Sam Staff 7 out of 10 2 took it, average 8.5 out of 10 MOST MISSED, LAST 7 NIGHTS ${missed(1, 2)} `
    + "Worth going over at the briefing. LAST 7 NIGHTS Mia Manager 1 quiz, average 10 Sam Staff 1 quiz, average 7 Send the quiz round-up SIGN-OFFS ")}`));

  // The round-up for the team chat: how many took it and the answers worth knowing, with no names or scores. Full
  // marks can be ticked; the average comes once three have taken it, so nobody's score can be worked out.
  await M.click('#mtrain [data-send="quiz"]');
  const pre = () => M.$eval("#send-pre", (e) => e.textContent);
  const know = qs.slice(7).map((q) => `• ${q.name}. ${q.of ? `How much ${q.of}?` : q.ask} ${q.answer}`).join("\n");
  assert.match(await pre(), new RegExp(`^Black Tap Soho quiz · \\w+ \\d+ \\w+\n2 of the team took it\n\nAnswers to know \\(3\\)\n${esc(know)}$`));
  assert.doesNotMatch(await pre(), /Sam|Mia|out of 10/);
  await M.check('[data-send-part="full"]');
  assert.match(await pre(), /\n\nFull marks \(1\)\n• Mia Manager$/);
  assert.deepEqual(await M.evaluate(() => { const keep = LIVE.quiz; LIVE.quiz = [...keep, { ...keep[0], uid: "x", name: "Xavi", right: "1111111111" }]; const m = SHARE.quiz(); LIVE.quiz = keep; return m.head; }),
    ["3 of the team took it, average 9 out of 10"]);
  await M.click("#sh-close"); await M.waitForSelector("#sheet", { state: "hidden" });
  await part(M, "send");
  assert.match(await text(M, "#sendhub"), /Quiz round-up How the team did and the answers to know, without names/);
  await part(S, "send");
  assert.doesNotMatch(await text(S, "#sendhub"), /Quiz round-up/);
  assert.deepEqual([M.errs, S.errs], [[], []]);
});
