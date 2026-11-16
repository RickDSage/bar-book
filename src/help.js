/* ---------- Help: the small ? buttons ----------
   A ? sits next to the parts of Bar Book that aren't obvious. Tapping it opens a short panel: what it's for, how to
   use it, and (folded away) what happens behind the scenes. Tap ? again, Close, outside the panel or Escape to shut it.
   One setting in More (This phone) hides every ? once the team knows the app. Text only: nothing is saved or sent. */
let helpFrom = null;
const HELP = {
  station: { t: "Bar station", what: "One always-on screen for the iPad on the bar: tonight's 86s, the close on both sides, the handover and Rapid fire.",
    how: ["Tap a box to open that page. Back, then More, then Bar station brings it back.", "Turn on Shared in More, This phone, so it asks who's using it and never stays unlocked.",
      "Keep it on Bar Book: in the iPad's Settings, Accessibility, Guided Access, turn it on and set a passcode. Open Bar Book, press the top button (or the Home button) three times, tap Start. Three presses and the passcode end it.",
      "Stop the screen going off: Settings, Display & Brightness, Auto-Lock, Never. Keep the iPad on charge."],
    behind: ["It's the same live data as every phone: nothing extra is saved.", "It redraws as soon as anything changes, and every minute for the clock."] },
  shift: { t: "The Shift tab", what: "Tonight's work for your side, in the order it happens.",
    how: ["Pick Bar or Floor at the top. Each phone remembers its side.", "Go left to right: Morning, Labels, Stock, Closing, Send.", "The small number on each tab shows what's left there."],
    behind: ["Everything here is shared live: every phone on your side sees the same ticks, 86s and handover.", "The shift day runs 6am to 6am UK time, so a close after midnight still counts as tonight."] },
  morning: { t: "Morning", what: "Last night's handover for the opening team, today's order and the prep pars.",
    how: ["Read the handover and sort what you can.", "Tap Checked: send on WhatsApp so the duty manager knows what's still outstanding.", "Send the order and the prep list if you need to."],
    behind: ["The handover is the last one your side sent before today. It stays saved, so it's still here if nobody reads it straight away.", "Today's order is what last night said was running low, plus anything still 86'd.", "Prep pars are higher on Fridays and Saturdays."] },
  labels: { t: "Date labels", what: "Everything your side dates once it's opened, and when each one needs changing.",
    how: ["Opened one? Tap Opened one and write the date it gives you on the label.", "Binned the old one and opened a new one? Tap Changed it.", "Binned with no new one opened? Tap Binned. ⋯ shows its history."],
    behind: ["Each tap is saved with your name and the time, so a label that wasn't changed can be traced.", "Due today, tomorrow and overdue show at the top of Morning and Closing, and go in the handover.", "Only seniors add, change or remove items."] },
  stock: { t: "86 board and restock", what: "What's run out tonight, and getting stock up from the cellar.",
    how: ["Tap a Quick 86 chip, pick from the list, or type anything else.", "Back in stock takes it off for everyone.", "Restock: say what, how many and where. Someone taps I'll get it, Brought it up, then whoever's there taps Got it."],
    behind: ["One 86 board for the whole team. An 86'd drink shows as 86'd everywhere, and an 86'd ingredient shows the swap on every drink that uses it.", "Restocks waiting over 15 minutes show as late. Nothing here changes stock levels: stock is counted in Nory.", "Clear everything puts every 86 back in stock."] },
  closing: { t: "Closing checklist", what: "The close, ticked off live on every phone.",
    how: ["Tap an item when it's done, or Tick all under a heading.", "⋯ on an item: start it, mark it blocked and say why, or see who did what.", "When every item is done, tap Finish. Clear puts the whole list back to not started."],
    behind: ["Ticks save with your name and time. If two phones change one item at once, the second is refused rather than overwriting, and you see Someone may have just changed it.", "Seniors can mark an item not needed tonight, give it to someone, finish with items left (with a reason) and change the list itself.", "No signal? Ticks wait on the phone and send when it's back. A banner says how many are waiting."] },
  handover: { t: "Handover", what: "The end of the night: what's done, what's low, what's outstanding and what tomorrow needs.",
    how: ["Tap who closed, fill in the three boxes (the chips add common lines), and take the closing photos.", "Tap Hand over. It saves for the morning team, then opens WhatsApp with it ready to send."],
    behind: ["The boxes are shared live with everyone closing your side, so two people can fill them in.", "Photos are required. With none, you're asked why, and the reason goes in the handover.", "Sent handovers are kept. Photos are cleared after 30 days to stay on the free plan. The boxes start empty again at 6am."] },
  clearall: { t: "Clear everything", what: "A fresh start for the shift, on every phone.",
    how: ["Tap it, then confirm."],
    behind: ["Clears: both closing lists back to not started, every 86 back in stock, tonight's handover boxes and Closed by, unsent closing photos, and the drafts on this phone.", "Stays: sent handovers and their photos, date labels, restocks and issues.", "Anyone on the team can do it, and it can't be undone, so check with whoever's closing first."] },
  join: { t: "Joining the team", what: "One team link, no login or password.",
    how: ["Open the team link from the staff WhatsApp group on this phone, or paste the code here.", "Pick your first name. That's it."],
    behind: ["The phone signs in by itself with no account. The code is checked by the database, not by the app.", "Anyone with the link can join, so keep it in the staff group. A senior can take a lost phone off the team, and changing the code takes every phone off at once.", "Leaving wipes this phone's copy of the team's data."] },
  ask: { t: "To the seniors", what: "A day off, a swap, a complaint or anything else, straight to the seniors.",
    how: ["Pick what it is, write it and send.", "You see it again here with Sent, Seen or Done, and any reply."],
    behind: ["Only the seniors and the owner read these, never the rest of the team.", "Anonymous carries no name and no phone id, so you won't see a reply. In a small team what it says may still give it away."] },
  rate: { t: "Team only: rate the shift", what: "Tonight out of 10, for the team's own group chat.",
    how: ["Pick a score, add what went well and what was hard, and send it to the chat you choose."],
    behind: ["Derek and the seniors get a copy with no name, no side and nothing about this phone.", "Nothing is saved in the app except your draft on this phone."] },
  issues: { t: "Issues and faults", what: "Anything that needs fixing, kept on the board until it is.",
    how: ["Raise it, say where, and tick Urgent if it needs sorting this shift.", "Tap I'm on it, or give it to someone. Say what you did and tap Fixed.", "Fixed but broken again? Open Recently fixed and tap Still broken."],
    behind: ["Everyone on the team sees issues. Urgent ones pop up on every phone.", "Open issues stay however old they are, and go in the handover."] },
  tell: { t: "Tell Derek", what: "What's missing from Bar Book, what to add, or what's wrong in it.",
    how: ["Pick one, say what it is, and send."],
    behind: ["Only Derek reads these. You see yours again, marked Done when it's sorted."] },
  sent: { t: "Everything sent", what: "A copy of everything the team sends from Bar Book.",
    how: ["Tap one to read it again."],
    behind: ["Copied when someone sends from the Send page: WhatsApp, email, the share sheet, a picture or print.", "Rate the shift comes with no name. My pay, payslips, hours and the team link are never copied.", "Only the seniors and the owner see this."] },
  inbox: { t: "Inbox from the team", what: "Everything sent To the seniors.",
    how: ["Tap Seen so they know it's been read. Add a reply if you like, then tap Done."],
    behind: ["The sender sees Seen, Done and your reply. Anonymous ones can't see replies.", "The owner and every senior share one inbox."] },
  people: { t: "Who's on the team", what: "Every phone and account on the team.",
    how: ["Share the team link with a new starter in the staff group.", "Seniors: take off a lost phone or someone who has left."],
    behind: ["A phone taken off forgets the team at once and goes back to drinks only.", "What they wrote keeps their name."] },
  incident: { t: "Incident or accident", what: "Write it up while it's fresh, then send it.",
    how: ["Fill in what happened and tick what's been done.", "Send it on WhatsApp or to the seniors, then write it in the accident book."],
    behind: ["The accident book is the record. Bar Book doesn't keep it, only your draft on this phone until you send or discard it."] },
  drafts: { t: "Drafts", what: "What you type is saved on this phone as you type.",
    how: ["Save draft folds it away to finish later. Discard wipes it."],
    behind: ["A guest, a locked phone or closing the app loses nothing. Nothing leaves the phone until you send it.", "Clear everything and Reset this phone wipe drafts too."] },
  send: { t: "Sending", what: "Every Send button opens this page.",
    how: ["Untick anything you don't want in, add a note, and check How it will look.", "Tap WhatsApp or Email: your own app opens with the words in, and you pick the chat.", "With photos on an iPhone: Copy the words, then Send with photos, then paste the words as the caption."],
    behind: ["Bar Book never sends anything by itself.", "When you're on the team, Derek and the seniors get a copy in Everything sent. My pay, payslips and the team link are never copied.", "iPhones drop photos sent together with words, which is why the words go separately."] },
  drink: { t: "The drink page", what: "The spec, the method and a step-by-step guide.",
    how: ["Spec or Step by step at the top. Tap a line or a step to tick it off as you go.", "− and + scale the spec for up to 12 drinks. ml or oz switches units.", "Swipe sideways for the next drink in your list. ☆ keeps it in Favourites."],
    behind: ["Anything on the 86 board shows here with the closest swap. The swap is the drink's own Out of something? line first, else a bottle of the same kind.", "The screen stays on while a drink is open.", "Units and calories are estimates worked out on the phone."] },
  rapid: { t: "Rapid fire", what: "The house drinks as big buttons, for answering a guest fast.",
    how: ["Tap a drink for its full spec, or Show specs on the page to see them all without tapping.", "Change on Top 10 picks your own ten. Type to search the whole book."],
    behind: ["Your top 10 and the specs setting are kept on this phone only."] },
  make: { t: "What can I make?", what: "Pick what you've got and see what you can make, closest first.",
    how: ["Make: tap ingredients and the matches update.", "My bar: the bottles you have. Specs: every spec on one line.", "Black Tap: our line-up and house serves."],
    behind: ["My bar and My drinks stay on this phone.", "Anything on the 86 board stops counting, so it won't suggest a drink you can't make tonight."] },
  pay: { t: "My pay", what: "An estimate of your take-home, not a payslip.",
    how: ["Tap Add payslips and pick your payslips (photos, screenshots or PDFs, a year's at once). Every month fills in by itself: hours, rate, tronc an hour, tax, NI and take-home.", "Months without a payslip are predicted from your average hours and tronc an hour. Change either under a month to see what it would pay."],
    behind: ["It stays on this phone: nobody else sees it and it never goes online. Payslips are read on the phone.", "Tronc is paid on the hours worked the month before, so its rate an hour is each payslip's tronc over the month before's hours. With no payslips yet it's a suggested £6.", "Tax uses the 2026 to 2027 GOV.UK rates, month by month. Your payslip is always the final word."] },
  reset: { t: "Reset this phone", what: "Wipes what Bar Book keeps on this phone and starts it again as new.",
    how: ["Type CLEAR, then tap Reset this phone."],
    behind: ["Goes: favourites, My bar, My pay, drafts, settings, and this phone's place on the team. Open the team link again to rejoin.", "Nobody else's phone and nothing shared changes. It can't be undone.", "Not the same as Clear everything on Shift, which resets tonight's lists for the whole team."] },
};
/* How Bar Book works: five short cards, shown once on a phone's first open (after Bar or Floor) and any time from
   More. Skip ends it. The last card leads to the full feature list and its tour. */
const INTRO = [
  { t: "Welcome to Bar Book", how: ["Every drink we make, the shift, the close and the handover, in one app built for Black Tap Soho.", "Specs and guides work with no signal. The team side syncs live between every phone on shift.", "Tap Next to see what it does. Skip any time: it's always in More."], tip: "Two minutes now saves you that every shift." },
  { t: "Find any drink in seconds", how: ["Rapid fire: the house drinks as big buttons, one tap from the start page. Show specs on the page and most questions need no tap at all.", "Menu: search by drink, spirit, glass or flavour. It forgives typos, so “espreso martni” still finds it.", "What does the guest fancy? Tap a flavour, or No alcohol."], tip: "Tap the Drinks tab again at the top of the Menu to jump straight into search.", more: ["rapid"] },
  { t: "Every spec, done right", how: ["Each drink has the spec, glass, ice, garnish and method, plus a picture guide for every step.", "Tap a line or step to tick it off as you build. − and + scale the spec for up to 12 drinks, with how to batch them. ml or oz switches units.", "Swipe sideways for the next drink. ☆ keeps your favourites one tap away."], tip: "Send this drink, Picture card or Print card turns any spec into a WhatsApp message or a card for the well.", more: ["drink"] },
  { t: "Out of something? It adjusts", how: ["Put it on the 86 board once and every phone knows.", "Every drink that uses it shows the closest swap, on the spec, the menu, Rapid fire and the cheat sheets.", "Make stops counting on it, so it never suggests a drink you can't make tonight."], tip: "Back in stock takes it off everywhere at once.", more: ["stock"] },
  { t: "The cocktail maker", how: ["Make: tap what you've got and see what you can make, closest first, with swaps.", "My bar keeps your own bottles. Specs puts every spec on one line for busy moments.", "Black Tap shows our line-up: draught, bottles, softs and the house serves."], tip: "A guest names two bottles? Tap them and offer the top match.", more: ["make"] },
  { t: "Run the shift together", how: ["Shift is shared live with everyone on your side: the 86 board, restocks from the cellar and date labels.", "Restock: ask for it, someone brings it up, whoever's there confirms it arrived. Late ones flag after 15 minutes.", "Date labels tell you what to write on the label and what's due today or tomorrow."], tip: "No signal? It keeps working and sends everything when you're back. A banner says what's waiting.", more: ["shift", "labels"] },
  { t: "Close properly", how: ["Tick the close as you go, or Tick all under a heading. Two people can split it: ticks show on both phones straight away.", "Can't do one? ⋯, Blocked, and say why. It goes in the handover, so nothing is quietly missed.", "All done? Tap Finish. Starting time, time taken and who ticked what are kept for the duty manager."], tip: "Only what's left hides finished items, so the next job is always at the top.", more: ["closing", "clearall"] },
  { t: "Hand over in one tap", how: ["On Send: who closed, what's low, what's outstanding, what tomorrow needs, and the closing photos.", "Hand over saves it for the morning team and opens WhatsApp with the whole close in tick boxes.", "In the morning, Shift, Morning shows last night's handover, today's order and the prep pars."], tip: "Two people can fill in the handover at once: it's shared live with everyone closing your side.", more: ["handover", "morning"] },
  { t: "The team, without the chat", how: ["Issues: raise a fault, someone takes it on, it stays until it's fixed.", "To the seniors: days off, swaps, complaints, anonymous if you want.", "Incident or accident, Team only: rate the shift, Quick WhatsApp messages for running late or off sick, Who to call, and Spin the wheel."], tip: "Tell Derek goes straight to Derek: what's missing or wrong in the app.", more: ["issues", "ask", "rate"] },
  { t: "Everything goes to WhatsApp", how: ["Every Send button opens one page: tick what goes in, add a note and photos, and see exactly how it will look.", "WhatsApp, email, a picture, print or copy. Bar Book never sends anything by itself."], tip: "On an iPhone with photos: Copy the words, then Send with photos, then paste the words as the caption.", more: ["send"] },
  { t: "For the seniors", how: ["Inbox, Everything sent, Closing reports with their photos, and the 86 log, all on Team.", "Change the closing lists, add date labels, football games, the venue's numbers, and a house photo and video on any drink.", "Not needed tonight, give a job to someone, or finish a list with a reason on record."], tip: "Every change is saved with who and when, so nothing has to be chased.", more: ["inbox", "sent"] },
  { t: "Learn it, and look after yourself", how: ["More, Practise: flashcards, tonight's quiz (the same 10 for everyone) and the new starter path.", "More, Cheat sheets: a page per kind of drink, to print or send.", "My pay: an estimate of your take-home after tax. It stays on your phone: nobody else ever sees it."], tip: "Cheat sheets carry tonight's swaps, so they're never out of date.", more: ["pay"] },
  { t: "Tips and tricks", how: ["Tap any ? for how that part works and what happens behind the scenes.", "Whatever you type is saved as you go, so a guest or a locked phone loses nothing.", "Add Bar Book to your home screen (More shows how): it opens like an app and works offline.", "Tapping the tab you're on scrolls back to the top."], tip: "This tour is in More whenever you want it again. Hide the ? buttons there too.", more: ["drafts"] },
];
// The tour card the last help panel was opened from, so Back returns to it.
let introAt = -1;
function introOpen(i = 0, from = helpFrom) {
  const c = INTRO[i], last = i === INTRO.length - 1;
  helpFrom = from; introAt = i;
  $("#help .help-in").innerHTML = `<div class="help-h"><h3 id="help-t">${esc(c.t)}</h3><button class="hq-x" data-help-x aria-label="Close">×</button></div>
    <div class="cprog"><b>${i + 1} of ${INTRO.length}</b><span class="dots" aria-hidden="true">${INTRO.map((_, j) => `<i class="${j === i ? "on" : j < i ? "ok" : ""}"></i>`).join("")}</span></div>
    <ul>${c.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="note"><b>Tip:</b> ${esc(c.tip)}</p>
    ${c.more ? `<div class="recent">${c.more.map((k) => `<button class="chip" data-help-topic="${k}">How ${esc(HELP[k].t.replace(/^The /, "the "))} works</button>`).join("")}</div>` : ""}
    <div class="help-f">${i ? `<button class="btn" data-intro="${i - 1}">Back</button>` : `<button class="btn" data-help-x>Skip</button>`}${last ? `<button class="btn" data-intro-all>Every feature</button>` : ""}<button class="btn pri" ${last ? "data-help-x" : `data-intro="${i + 1}"`}>${last ? "Done" : "Next"}</button></div>`;
  $("#help").hidden = false; $("#help .help-in").scrollTop = 0; $("#help .btn.pri").focus();
  store.set("introSeen", true);
}
// First open on this phone: after Bar or Floor is picked.
document.addEventListener("click", (e) => { if (e.target.closest("#welcome [data-start]") && !store.get("introSeen", false)) setTimeout(() => introOpen(0), 350); });
// Where the ? buttons go: next to a heading or a control. A function picks the topic from what's on screen.
const HELP_AT = [
  ["#shift-title", () => (!LIVE.me ? "join" : { morning: "morning", labels: "labels", stock: "stock", close: "closing", fclose: "closing", send: "handover" }[pane] || "shift")],
  ["#clear-all", "clearall", "after"],
  ["#v-notices .fbbox > h2", "join"],
  ...["ask", "rate", "issues", "tell", "sent", "inbox", "people", "incident"].map((k) => [`#v-notices [data-card="${k}"] > summary`, k]),
  [".draftbar > span", "drafts"],
  ["#send > h2", "send"],
  ["#sheet .pl-spech", "drink"],
  ["#v-rapid > h2", "rapid"],
  ["#v-station > h2", "station"],
  ["#v-make > h2", "make"],
  ["#pay-h", "pay"],
  ['#v-info [data-fold="clear"] summary', "reset"],
];
const helpOn = () => store.get("help", true) !== false;
const applyHelp = () => document.documentElement.classList.toggle("nohelp", !helpOn());
applyHelp();
function helpMark() {
  for (const [sel, k, where] of HELP_AT) for (const el of $$(sel)) {
    // Checked each time, not marked once: a redraw that rewrites the text (the Shift title) takes the ? with it.
    if ((where === "after" ? el.nextElementSibling : el.lastElementChild)?.classList.contains("hq") || el.offsetParent === null) continue;
    const b = document.createElement("button");
    // The ? is drawn by CSS, so the heading it sits in reads the same to anything reading its text.
    b.className = "hq"; b.type = "button"; b.setAttribute("aria-label", "How this works"); b.hqTopic = k;
    if (where === "after") el.after(b); else el.append(b);
  }
}
let helpT = 0;
new MutationObserver(() => { if (!helpT) helpT = requestAnimationFrame(() => { helpT = 0; helpMark(); }); }).observe(document.body, { childList: true, subtree: true });
document.body.insertAdjacentHTML("beforeend", `<div id="help" class="help" hidden><div class="help-in" role="dialog" aria-modal="true" aria-labelledby="help-t"></div></div>`);
function helpOpen(k, from, tour = -1) {
  const h = HELP[k]; if (!h) return;
  helpFrom = from; introAt = tour;
  $("#help .help-in").innerHTML = `<div class="help-h"><h3 id="help-t">${esc(h.t)}</h3><button class="hq-x" data-help-x aria-label="Close">×</button></div>
    <p class="lead">${esc(h.what)}</p><ol>${h.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    <details class="help-b"${store.get("helpBehind", false) ? " open" : ""}><summary>Behind the scenes</summary><ul>${h.behind.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>
    <div class="help-f">${tour >= 0 ? `<button class="btn" data-intro="${tour}">‹ Back to the tour</button>` : `<button class="linkbtn" data-help-hide>Hide all ? buttons</button>`}<button class="btn pri" data-help-x>Close</button></div>`;
  $("#help").hidden = false; $("#help [data-help-x]").focus();
}
function helpClose() { if ($("#help").hidden) return; $("#help").hidden = true; helpFrom?.focus?.(); helpFrom = null; }
// Capture, so a ? inside a folding heading doesn't open or shut it.
document.addEventListener("click", (e) => {
  const b = e.target.closest?.(".hq"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (!$("#help").hidden && helpFrom === b) return helpClose();
  haptic(); helpOpen(typeof b.hqTopic === "function" ? b.hqTopic() : b.hqTopic, b);
}, true);
$("#help").addEventListener("click", (e) => {
  if (e.target.id === "help" || e.target.closest("[data-help-x]")) return helpClose();
  const n = e.target.closest("[data-intro]"); if (n) { haptic(); return introOpen(+n.dataset.intro, helpFrom); }
  const tp = e.target.closest("[data-help-topic]"); if (tp) return helpOpen(tp.dataset.helpTopic, helpFrom, introAt);
  if (e.target.closest("[data-intro-all]")) { helpClose(); return openFeatures(); }
  if (e.target.closest("[data-help-hide]")) { store.set("help", false); applyHelp(); helpClose(); toast("? buttons hidden. Turn them back on in More, This phone"); }
});
$("#help").addEventListener("toggle", (e) => { if (e.target.matches(".help-b")) store.set("helpBehind", e.target.open); }, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") helpClose(); });
document.addEventListener("click", (e) => {
  const w = e.target.closest("[data-intro-open]"); if (w) { haptic(); return introOpen(0, w); }
  const t = e.target.closest("[data-help-pick]"); if (!t) return;
  store.set("help", t.dataset.helpPick === "on"); applyHelp(); haptic();
  $$("[data-help-pick]").forEach((x) => x.setAttribute("aria-pressed", x === t));
});
document.head.insertAdjacentHTML("beforeend", `<style>
.hq{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;min-height:0;margin:0 0 0 8px;padding:0;border:1px solid var(--brass);border-radius:50%;background:none;color:var(--brass);font:700 13px/1 inherit;vertical-align:middle;flex:none;cursor:pointer;position:relative}
.hq::before{content:"?"}.hq::after{content:"";position:absolute;inset:-11px}
.nohelp .hq{display:none}
.help{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
.help-in{background:var(--bg);color:var(--fg);width:100%;max-width:560px;max-height:85vh;overflow-y:auto;border-radius:18px 18px 0 0;border-top:2px solid var(--brass);padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 16px)}
.help-h{display:flex;align-items:center;justify-content:space-between;gap:10px}.help-h h3{margin:0;font-size:20px}
.hq-x{background:none;border:0;color:var(--muted);font-size:28px;line-height:1;padding:4px 8px;min-height:0}
.help-in .lead{margin:6px 0 4px}.help-in ol,.help-in ul{padding-left:20px;margin:6px 0}.help-in li{margin:4px 0}
.help-b summary{color:var(--brass);font-weight:700;min-height:40px;display:flex;align-items:center}
.help-f{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap}.help-f .btn.pri{margin-left:auto}
@media (prefers-reduced-motion:no-preference){.help-in{animation:up .2s ease-out}}
</style>`);
