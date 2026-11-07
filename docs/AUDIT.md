# Bar Book technical audit

Audited 6 November 2026 against `main` at commit `1d3e616` (PR #42 merged). Source of truth: this repository only. Every claim below points at the code, the rules or a test. Where something is an estimate or a judgement rather than something the code shows, it says so.

## 1. Verdict first

**Is it perfect?** No, and "perfect" is the wrong finish line. Here are the two that matter, with the criteria:

| Milestone | Criteria | Today |
|---|---|---|
| **A. Ready for a real trading night at Black Tap Soho** | 1. Allergens can't be read as confirmed when they aren't. 2. A full pretend trading day has been run with test staff on real phones and the bugs fixed. 3. Daily Firestore reads measured and under the free limit with room to spare. 4. The live rules match the repo. 5. Every automated test passes. | **Not yet.** 5 is nearly met: 253 of 253 rules tests and 100 of 101 browser tests pass (section 9). 1 fails (section 6.1). 2, 3 and 4 haven't been measured. Phase 1 fixes all three. |
| **B. Ready to show or sell to another venue** | A, plus: one venue can never see another's data, the IP/contract check is done, staff privacy notice, independent security review, every screen translated. | **No.** The app is single-venue by design (README, "Known limitations") and the contract/IP check is still open. |

What *is* true: for a free app built in two weeks, the foundations are unusually strong. The Firestore rules are strict, field-by-field and heavily tested (253 rules cases passing). Every change to a checklist, restock, label or published shift writes a versioned audit event in the same batch. Offline writes queue and are refused, not merged, when stale. That is a better base than most paid tools in this space.

## 2. How the app is built

| Part | What it is | Evidence |
|---|---|---|
| Front end | One HTML page with every screen, the CSS and all the logic in one inline script. No framework. | `src/template.html` (586 KB, 6,430 lines, ~290 functions) |
| Drinks data | 318 drinks, guides and art, bundled into the page at build time from a folder **outside the repo** (`DATA_DIR`, default `/mnt/project-files/black-tap-menu/data/`). | `src/build.js:4`, README "Setting up a laptop" |
| Extra drinks and fixes | Corrections, substitutions and the allergen auto-adder. | `src/extras.js`, `src/builds.js` |
| Cocktail maker | Make tab. | `src/maker.js` |
| Translations | 22 languages; every on-screen English phrase is matched whole and swapped. | `src/i18n.json` (1 MB), `src/template.html:2290-2340` |
| Live layer | Firebase Auth and Firestore, bundled with esbuild into `live.js` only when `firebase-config.json` exists. | `src/live-src.js`, `src/site.js:11` |
| Hosting | **GitHub Pages**, from the repo root on `main`. Not Firebase Hosting. | README, `index.html`, `.nojekyll` |
| Offline | Service worker: network first, cache fallback; core files cached on install. Firestore uses its persistent IndexedDB cache. | `sw.js`, `src/live-src.js:23` |
| Rules | 1,121 lines, deny by default. `firestore.rules.txt` is a byte-identical copy served for pasting from a phone. | `firestore.rules`, `src/site.js:13` |
| CI | GitHub Actions runs the rules tests on every PR and push to main. The browser tests don't run in CI because they need the drinks folder. | `.github/workflows/rules.yml` |

### Firebase services actually used

| Service | Used? | Notes |
|---|---|---|
| Authentication (email/password) | Yes | Usernames map to made-up `@users.example.com` addresses; PIN is the password, 6 to 12 digits (`src/live-src.js:30-31`). A second in-memory Auth app creates accounts without signing the manager out (`:21`). |
| Cloud Firestore | Yes | 50+ collections, all at the root (section 3). |
| Firebase Hosting | No | GitHub Pages instead. Both free; no reason to move. |
| App Check | **No** | Not initialised anywhere in `live-src.js`. |
| Cloud Storage | No | Photos are base64 JPEGs inside Firestore documents (≤700 KB each, rules `photos`, `drinkMedia`, `concernPhotos`) because Storage needs Blaze. |
| Cloud Functions | No | Spark doesn't have them. Everything runs on the phone. |
| Cloud Messaging (push) | No | README "Known limitations": no notifications when the app is closed. |

## 3. Firestore collections

All top-level, one venue per Firebase project. "Live" means the app writes it today; "Read-only" means the rules allow no new writes.

| Area | Collections | Who reads | Who writes | Status |
|---|---|---|---|---|
| Accounts | `config`, `staff`, `usernames`, `audit`, `directory`, `teststaff`, `resets` | staff: own record; managers: all | owner/managers, batched with an audit entry | Live |
| Checklists | `shift/{day}/tasks`, `shift/{day}/runs`, `lists`, `listlog`, `events` | everyone | everyone, versioned, event in same batch | Live |
| Legacy ticks | `shift/{day}/ticks` | everyone | nobody | Read-only (pre-25 Oct) |
| Date labels | `labels` | everyone | everyone opens/changes/bins; managers edit the list | Live |
| Restock | `restock` | everyone | everyone, state machine asked → given → doing → delivered → received | Live |
| 86 board | `out`, `outlog` | board: everyone; log: managers | everyone, board and log in one batch | Live |
| Reports | `reports`, `photos`, `reviews` | everyone / managers | everyone sends; managers sign off and review | Live |
| Tonight | `briefings`, `briefReads`, `status`, `blocks`, `handovers`, `nights` | mixed (handovers, nights: managers only) | managers / everyone | Live |
| Problems | `issues`, `concerns`, `concernPhotos`, `incidents`, `guests`, `refusals` | mixed | everyone raises; managers close | Live |
| People | `shifts`, `asks`, `certs`, `training`, `ratings` | mixed | managers, plus staff hands-up/cover moves | Live |
| Messages | `notices`, `seen`, `chats`, `chats/{id}/msgs`, `chatPhotos`, `pings` | members of each chat only | members | Live |
| Venue | `settings` (`features`, `comp`, `hoq`, `contacts`), `calendar`, `fixtures`, `drinkMedia` | everyone | owner or managers | Live |
| Retired | `feed`, `requests`, `waste`, `kit`, `safety`, `pars`, `counts` | managers (some everyone) | nobody (requests: mark ordered only) | Read-only since 25 Oct |

Document shapes are enforced with `exactly([...])` on every create, so each match block in `firestore.rules` is the schema. Key patterns worth reusing:

- **Signed writes:** `stamped()` forces `uid`, `name` (from the staff record) and `at == request.time` (`firestore.rules:46`).
- **Versioned records with events:** tasks, runs, restock, labels and published shifts raise `v` and must write `events/{kind}-{id}-{v}` in the same batch (`:249-517`). Stale phones are refused.
- **Paired writes:** the 86 board and its log can't drift (`:536-556`); handover risks must raise an issue in the same write (`:656`).

## 4. Authentication and permissions

- **Roles:** `owner` (exactly one, claimed once through `config/owner` with a one-time code), `manager`, `staff` (`firestore.rules:22-30, 62-110`). Test staff are not logins at all (`:130`).
- **Enforced in rules, not just hidden:** I checked each collection in the table above. Manager-only data (handovers, nights, outlog, incidents, reviews, audit, staff list) is refused to staff by the rules, and the rules tests prove it (`test/rules.test.mjs`, 253 cases, all passing today).
- **Destructive actions:** Start fresh needs the owner's PIN within 15 minutes and a `resets` record first (`:28-30`). Removing someone deletes `staff` + `usernames` + writes `audit` in one batch.
- **Feature switches** (`settings/features`) only hide things in the app. Switched-off features stay readable and writable through the rules. That's fine for a single venue (it's about clutter, not secrecy) but it is **not** a security boundary, which matters for multi-venue (section 7).

## 5. Feature inventory

Labels, strictly from the code and tests:

- **Fully functional:** built end to end, enforced by the rules where it stores data, and exercised by a passing automated browser test.
- **Implemented:** built and wired up, but no automated test proves the whole flow (or the maths).
- **Partial:** some of what the brief describes exists; the gap is named.
- **Simulated:** works on made-up or phone-only numbers; nothing is recorded for the venue.
- **Retired:** read-only by design.
- **Not built.**

`T:` names the test file in `test/e2e/` that covers it.

### Knowledge

| Feature | Label | Where | Notes |
|---|---|---|---|
| 318 drinks, specs, 25/50 ml, glass, ice, garnish, method | Fully functional | `src/build.js`, `src/extras.js`, `src/builds.js`; T: local | Build throws if a drink has no guide or a duplicate name. |
| Step-by-step picture guides | Fully functional | `build.js:36-46`, `guideHtml` | One guide per drink is enforced at build time. |
| Ingredient substitutions | Implemented | `builds.js` `subsFor` | Shown on the card; no dedicated test. |
| **Allergens** | **Partial, and a safety gap** | `template.html:1222-1236`, `builds.js:137-156` | Hand-written list plus regex auto-adds (Prosecco → sulphites, beers → gluten, oat milk → gluten). **No manager verification exists in the live app.** PR #11 ("confirmed by managers") has been open and unmerged since 25 Oct. A drink with no allergen text shows nothing at all, which a new starter can read as "allergen-free". See 6.1. |
| Cocktail maker, My bar, randomiser, build one ingredient at a time | Fully functional | `src/maker.js`; T: maker | |
| Practise flashcards | Implemented | `template.html:1251` | No test of the card flow itself. |
| Training sign-off per drink | Fully functional | rules `training`; T: logs | Manager signs off; no quizzes, no modules (brief 13: not built). |
| House photo and video per drink | Fully functional | rules `drinkMedia`; T: media | Video links limited to known sites. |
| Languages (22) and Gold theme | Fully functional (staff screens) / Partial (manager screens) | `src/i18n.json`; T: languages | README: dates, guide text and manager screens are still English. Drink names, specs and allergens are `translate="no"`. |

### People

| Feature | Label | Where | Notes |
|---|---|---|---|
| Logins, roles, PIN reset, bulk add/promote/remove | Fully functional | `live-src.js`, rules `staff/usernames/audit`; T: accounts, teamtools | |
| Test staff for a practice day | Fully functional | rules `teststaff`, `renderTests` `template.html:3246`; T: teamtools | Up to 60, put on the rota in one tap, cleared in one tap. |
| Rota: drafts, publish, grid, copy week, open shifts, offers, hands up, cover | Fully functional | `renderRota` `:3547`, rules `shifts`; T: rota | |
| 11-hour rest warning | Implemented, **wording overclaims** | `template.html:3438-3440`; T: compliance | Warns, never blocks. But it says "the law gives adults 11 h between shifts", which reads as a compliance verdict. The brief asks for advisory wording. One-line fix. |
| Licence holder / first aider cover warning | Fully functional | `roCover` `:3442`; T: compliance | Already labelled good practice, not law. |
| Time off, swaps, running late | Fully functional | rules `asks`; T: managers, calendar | Swaps are a request a manager decides; not a two-person swap. |
| Calendar, bank holidays, big days, manager events, fixtures | Fully functional | `renderCal`, `BANK_HOLS` (to end of 2028), rules `calendar/fixtures`; T: calendar, football | Fixtures are manager-entered, no paid feed. |
| My pay | Implemented, **Simulated** in the sense the brief means | `template.html:2343-2520` | Phone-only (`store` → localStorage, `:763`). Tax (Month 1 basis), NI, student loan, pension use 2026/27 constants hard-coded in the file; they need changing each April. Labelled "An estimate" (`:2517`). One hourly rate and one tronc rate; no service charge or tips split, no weekly view (brief 12: partial). **No automated test checks the sums.** A cleared Safari cache loses every shift typed in. |
| Certificates and right-to-work dates | Fully functional | rules `certs`; T: compliance | Dates only, never document copies. Good data minimisation. |
| Manager feedback (anonymous) | Fully functional | rules `ratings`; T: managers | |
| Recognition / shout-outs | Not built | | On branch `team` in the other thread, not merged. |
| Contracted vs scheduled hours, overtime, consecutive days, availability, department rotas | Not built | | Availability is on branch `team`. |

### Operations

| Feature | Label | Where | Notes |
|---|---|---|---|
| Live checklists (7 lists, statuses, reasons, audit trail) | Fully functional | rules `shift/*`, `events`; T: tasks, lists | Including offline queueing and stale-copy refusal. |
| Managers edit lists, every version kept | Fully functional | rules `lists/listlog`; T: lists | |
| Date labels | Fully functional | rules `labels`; T: labels | |
| Restock from the cellar | Fully functional | rules `restock` `:387-438`; T: tasks | Movement only. No stock levels. |
| **86 board** | Fully functional for what it is | rules `out/outlog`; `template.html:927`; T: shift | Shared live, who and when, history, duplicates impossible (keyed by slug). Missing vs brief 6: manager verification, "low" as well as "out", department tag. |
| Shift report with photos, manager sign-off | Fully functional | rules `reports/photos`; T: photos, reports | |
| Issues and handover (faults, jobs, urgent, assign, fix, raise again) | Fully functional | rules `issues` `:938`; T: tonight | This is already 80% of the brief's "operational issue" record. Missing: photo, priority beyond urgent yes/no, department field is `area`. |
| Concerns (photos, anonymous, to team or managers) | Fully functional | rules `concerns`; T: concerns | |
| Guest recovery with comp limits | Fully functional | rules `guests`; T: guests | |
| Incidents | Fully functional | rules `incidents`; T: managers | |
| Challenge 25 refusals | Fully functional | rules `refusals`; T: compliance | |
| Pre-service briefing with read receipts | Fully functional | rules `briefings/briefReads`; T: briefing | |
| Manager close and handover (12 questions + venue's own) | Fully functional | rules `handovers` `:647-690`; T: handover | Already assembles tonight's exceptions from live data (`snap`, `exceptions`), which is most of brief 10. |
| Tonight's status (calm / busy / slammed per department) | Fully functional | rules `status`; T: status | This *is* the brief's green / amber / red. |
| Bottlenecks (one-tap hold-ups, 4-week analysis by kind, department, hour, weekday) | Fully functional | rules `blocks`, `renderStatus` `:5297`; T: status | This *is* most of the brief's Bottleneck Detector. Missing: resolution time. |
| Live (manager view of blocked, overdue, waiting) | Fully functional | `renderLive` `:4306`; T: tasks, lists | |
| Activity timeline and spreadsheet downloads | Fully functional | `renderAct`, `history()` `live-src.js:673`; T: activity | |
| Send page: tick boxes, photos, WhatsApp, email, print, quick messages | Fully functional | `renderSend` `:830`; T: send | Opens WhatsApp/email with text; the person picks who. |
| Who to call | Fully functional | rules `settings/contacts`; T: compliance | |
| Team chat, private chats, groups | Fully functional | rules `chats`; T: chat | Brief 19 says no generic team chat. It already exists and is switchable. Keep, don't extend. |
| Broadcasts with read receipts | Fully functional | rules `notices/seen`; T: activity | |
| Features page, venue switches, tour | Fully functional | `FEATURES` `:2645`, rules `settings/features`; T: features | 17 switches. UI hiding only (section 4). |
| Start fresh | Fully functional | `live-src.js:293-330`; T: fresh | **Also clears `nights` (real till figures) and `status`/`blocks`,** which the README's description of Start fresh doesn't mention. The confirm screen does count them (`template.html:5657`). Decide deliberately. |
| Waste, temperatures, stock counts, pars | **Retired** (read-only since 25 Oct) | rules `:515-532, 587-592` | Moved to Nory and Alert65 on purpose. See 6.3: the brief asks for these back. |

### Intelligence

| Feature | Label | Where | Notes |
|---|---|---|---|
| Sales and covers (typed in from the till) | Fully functional | rules `nights`; T: nights | Real data, managers only. |
| Sales forecast, next 7 nights | Fully functional, simple | `ntFc` `template.html:5325` | Weighted average of the same weekday over the last 6 weeks (newest weighs most), needs 2. Shows its own mean absolute % error (`ntAccuracy`). Honest and explainable. No 30-minute intervals, no walk-ins vs bookings. |
| Sales per labour hour | Fully functional | `ntHours` `:5332` | From rota hours, start to finish, before breaks. |
| Closing KPIs by night and person | Fully functional | `renderKpis` `:5395` | Labelled "counts taps, not work". |
| Money sandbox (wet/dry GP, labour, rent, footfall, break-even, levers, price a drink, saved versions) | **Simulated** | `renderMoney` `:5209`; T: money | Made-up numbers on the phone only. Never touches Firestore. Correctly separate from `nights`. |
| Stock variance, COGS, menu profitability, waste cost | Not built | | |
| Predictive shift intelligence, simulator, shift replay, floor plan | Not built | | Replay can be built almost entirely from existing `events`, `blocks`, `status`, `outlog`, `issues` timestamps. |

## 6. Weaknesses and technical debt

Ranked by harm.

### 6.1 Allergens can be read as confirmed (safety, essential)
Evidence above. The card shows allergen text only when there is some (`template.html:1062, 1071`). The Allergens tab lists drinks that match a regex. Nothing records who checked a drink, when, or what cross-contact risks exist. **Fix:** every drink shows a status line: "Allergens checked by {manager} on {date}" or "Not checked: use the allergen matrix". Unchecked never shows as clear. Store verifications in Firestore (`allergenChecks/{drink}`), managers only write, signed. Close PR #11 in favour of this, since it's 11 days and ~30 PRs behind.

### 6.2 Firestore free-quota risk (unmeasured, likely)
Spark gives 50,000 document reads a day. Each listener's first load reads every document it returns, and a phone that has been closed for over 30 minutes re-reads its listeners when it comes back (Firestore's billing rule for resumed listeners).

My **estimate**, not a measurement: on a cold open a manager's phone starts about 40 listeners (`live-src.js:82-211, 351-372`) and returns roughly 1,500 to 2,500 documents at the caps in the code (blocks 400, events per day up to 2,000, shifts 5 weeks, reviews 200, refusals up to 1,000, certs up to 1,000, training unbounded, outlog 100, guests 100, asks 100…). A staff phone is a few hundred. 25 staff opening 4 times a shift plus 4 managers opening 6 times could pass 50,000 on a busy day.

**Measured 6 Nov** (`test/e2e/tradingday.test.mjs`, a month of history for 25 people): a manager's phone read 1,983 documents on opening and a staff phone 763, about 57,000 a day. After loading history only when its page opens: 837 and 523, about 37,000 a day. The test fails if they creep back up.

### 6.3 The brief contradicts an earlier decision (stock and waste)
Waste, stock counts and pars were built (PR #7) and retired to read-only on 25 Oct because **Nory** does them. The brief now makes wet stock and waste the next milestone, and also says "do not replace Nory". Both can't hold for Black Tap. My call: build bar stock and waste as **switchable modules**, reusing the old `counts`/`pars`/`waste` shapes. Black Tap keeps them off if Nory is the stock record there; independents without Nory switch them on. One record of stock per venue, never two.

### 6.4 Build depends on a folder outside the repo
`src/build.js:4` reads drinks data from `/mnt/project-files/...`. Nobody with only the repo can build or run the browser tests, and CI can't either. **Fix:** move `drinks.json`, `guides.json`, `icons.js` and `guide-art.js` into `data/` in the repo (it's private IP under the existing licence anyway), then run the browser tests in CI.

### 6.5 Rules are published by hand
The live rules are whatever was last pasted into the console. Nothing checks they match `firestore.rules`. Several earlier PRs were merged with their rules publish "unconfirmed" (project memory). **Fix (free):** a GitHub Action that runs `firebase deploy --only firestore:rules` on merge, using a service-account key stored as a repo secret. Derek creates the key once. Until then, every rules PR needs the publish confirmed before merge.

### 6.6 One 586 KB file
All screens and logic are in `src/template.html`. It works, and the tests are good, but every change touches the same file, and two threads editing it at once conflict. Split by area only when a feature is being reworked anyway, never as a big-bang refactor.

### 6.7 Page weight
`index.html` is 3.5 MB (≈700 KB gzipped), `live.js` 747 KB (≈208 KB gzipped). The service worker is network-first, so every open revalidates the page. Acceptable on 4G, slow on a weak basement signal. Most of the weight is the drinks data and `i18n.json` (1 MB of translations for 22 languages loaded whatever the phone's language is). **Fix:** load only the chosen language's strings.

### 6.8 Smaller security points
- **No App Check.** The Firebase config is public (by design). Anyone with a real login can script against Firestore within the rules. App Check would stop non-app clients. It needs a reCAPTCHA key; verify it stays inside the free tier and doesn't need a billing account before adopting it.
- **No Content-Security-Policy.** Output is consistently escaped (`esc`, `template.html:758`, ~300 call sites; records with odd ids are dropped, `live-src.js:47`; T: logs "records written outside the app can't run code"). A CSP meta tag would be a cheap second layer.
- **PINs are 6 digits and usernames are public lookups** (`usernames` `allow get: if true`). Firebase Auth throttles repeated failures, which is the real defence. Encourage 8-digit PINs for managers and the owner.
- **Photos in Firestore** are cleared after 30 days only when a manager opens the app (`clearOldPhotos`, `live-src.js:276`). Fine in practice; just know why.
- **Feature switches aren't permissions** (section 4).

### 6.9 Overlap that confuses staff
Five ways to report something: Issues, Concerns, Incidents, Guest issues, Refusals. Four ways to see "what's happening": For you, Tonight at a glance, Live, Activity, plus the dashboard tiles. Each is well built; together they ask staff to know which box to use. Live Shift Operations should **merge the entry points** (one Report button that asks "what kind?") and become *the* manager screen, not a sixth view.

### 6.9a Bugs found while testing (being fixed on branch `team`)
- A pull-down form (Who to call's "Add a number", and others) can snap shut if the page redraws between the tap and the browser's toggle event, for example when a live update lands. The browser test for Who to call fails on `main` today because of it. Fixed on branch `team` with a `keepOpen()` helper.
- Publishing several rota shifts at once was occasionally refused with "maximum of 1000 expressions" in the browser tests. Traced on branch `team` to an emulator artefact: it only happens when a write lands while the phone's listeners are still starting, and the rules tests pass the same batch every time. No app change needed; tests that write straight after login should wait for the listeners first.
- Tonight's status form could lose a half-typed hold-up note when a live update redrew it. Fixed on branch `team`.

### 6.10 Retired code and data
`feed`, `requests`, `ticks`, `waste`, `kit`, `safety`, `pars`, `counts` are read-only, with UI code kept to show and download them (`template.html:2240-2264`). Once Derek has downloaded them, they and their code can go (a data delete, so his call).

### 6.11 Yearly upkeep that will silently go stale
Pay constants (tax bands, NI, loans, minimum wage: `template.html:2353-2384`), `BANK_HOLS` (to end of 2028), `ON_DAYS` (to end of 2028). Add a visible "rates for 2026/27" line on My pay and a dated reminder in this doc.

## 7. Proposed Firebase-compatible architecture

Keep what works. Change three things.

1. **Multi-venue: one Firebase project per venue, one codebase.** Recommended over putting every venue in one project with `venues/{id}/...` paths. Why:
   - Isolation is total and doesn't depend on getting 1,100 lines of rules right per path.
   - **Each venue gets its own Spark quota** (50k reads a day each). In one shared project, three busy venues would exhaust one free quota.
   - The rules and app change very little. The app picks its Firebase config from the URL (`/bar-book/?v=blacktap-soho`) or a per-venue build.
   - Cost: setting up a new venue takes about 30 minutes in the Firebase console (create project, paste rules, set the setup code). The brief's "no separate app versions" still holds: one build, several configs.
   - Branding, departments, enabled modules and venue drinks go in `settings/*` in each project.
2. **Shared operational record:** extend `issues` into the brief's operational issue (add `dept`, `priority`, optional photo, `resolvedAt`), feed `out`, `status`, `blocks`, `restock` and `issues` into one Live Shift screen, and let Shift Replay read the same records. No new logging.
3. **Read budget:** load history on demand; keep only tonight's data and open items as live listeners.

Stay on: Auth, Firestore, GitHub Pages, IndexedDB cache, CSV downloads, the phone's own share sheet. No Blaze, no Functions, no paid APIs.

## 8. Prioritised backlog

Complexity: S (under a day), M (1 to 3 days), L (a week), XL (more). Dependencies named.

### Essential
| # | Item | Size | Depends on |
|---|---|---|---|
| E1 | Allergens: "checked by / not checked" on every drink and the Allergens tab; managers verify, signed and dated; close PR #11 | M | rules publish |
| E2 | Pretend trading day: scripted run with test staff through every flow, as owner, manager and staff, measuring reads; fix what breaks | M | none |
| E3 | Measure and cut Firestore reads (history on demand) | M | E2 measurement |
| E4 | Permissions re-check: every collection × role × feature switch, plus a test that the repo rules are what's published | S | none |
| E5 | 11-hour rest wording to advisory | S | none |
| E6 | Start fresh: keep or clear `nights` deliberately, and say so | S | none |

### High value (Phase 2 onwards, in the brief's order)
| # | Item | Size | Depends on |
|---|---|---|---|
| H1 | Bar stock: opening, deliveries, transfers, closing counts by location, switchable | L | E3 |
| H2 | Stock variance (expected vs actual, £, repeat offenders) | M | H1 |
| H3 | 86 board: low as well as out, department, manager verify | S | none |
| H4 | Live Shift Operations: one screen from status + blocks + issues + 86 + restock; one Report button | L | H3 |
| H5 | Handover pulls in open issues, equipment faults, 86 and stock exceptions | S | H4 |
| H6 | Bottlenecks: resolution time and recurring-problem report | S | H4 |
| H7 | Move drinks data into the repo; browser tests in CI | S | none |
| H8 | Rules deploy on merge (GitHub Action) | S | Derek creates a service-account key |
| H9 | Waste log with £ cost, switchable | M | H1 (shares products) |
| H10 | Equipment register and fault history (extends issues) | M | H4 |
| H11 | My pay: several rates, service charge and tips, weekly totals, export/backup | M | none |
| H12 | Training modules and quizzes from the drinks library | L | none |
| H13 | Multi-venue (section 7) | L | IP/contract check |

### Optional
Staff recognition (on branch `team`), availability (on branch `team`), 30-minute cover forecasting, stock-to-GP link, menu profitability, shift replay, restaurant simulator, App Check, CSP, translations for manager screens, load one language only, interactive floor plan.

### Not recommended
- A POS, table management, payroll, temperature or HACCP logs (Toast, Nory, Alert65 own these).
- More drinks for the count.
- Generic chat features beyond what exists.
- Anything automatic that claims to "detect" problems without enough data. Show counts and let managers judge.
- A big-bang refactor of `template.html`.
- Moving to Firebase Hosting (no gain over Pages).

## 9. Testing strategy

**Run today, 6 Nov 2026, on this commit:**
- `npm run test:rules`: **253 of 253 passed** (Firestore emulator).
- `npm run test:e2e`: **100 of 101 passed** (Playwright on phone-sized screens against the emulators). The one failure is the Who to call form closing on a redraw (6.9a), already fixed on branch `team`.

**Going forward:**
1. Every PR: rules tests (CI, already) plus browser tests (CI once H7 lands).
2. Every rules change: an allowed and a refused case per role in `test/rules.test.mjs` (the existing habit).
3. A **trading-day script** (E2): one test that runs a whole night with test staff, start to finish, and asserts the read count per phone stays under a budget. It becomes the regression test for quota.
4. Before each release that changes rules: publish rules first, then merge, then open the live app on an iPhone as staff and as a manager.
5. Pay maths: a table of known payslips (anonymised) checked by a unit test, updated each April.
