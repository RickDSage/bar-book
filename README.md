# Black Tap Bar Book

Phone web app for the Black Tap Soho bar and floor team: every drink spec with step-by-step picture guides, allergens, spec practice, opening and closing checklists, the 86 list and the shift report.

Team logins add a live shift board shared by everyone on shift: Tonight at a glance, live checklists (each item Not started, In progress, Done, Blocked or Not needed tonight, with who, when and why, and each list started and finished), restocking from the cellar (asked for, given to someone, brought up and confirmed), the 86 board, issues and handover, shift reports with photos and sign-off, broadcasts to everyone, the bar or the floor (with who has read them), time off and swaps, incidents, Report a concern (with photos, to the team or managers only, and anonymous if you like), training sign-off drink by drink, an Activity timeline of who did what (staff see their own side, bar or floor), and a Managers tab with Live (tonight as it happens: what's blocked, overdue or waiting), Activity with filters and each item's history, closing KPIs night by night and by person, WhatsApp and Email buttons, and spreadsheet downloads of each section's full history, the audit trail included. They are switched on. How they were set up, what keeps them secure and how to recover are in [docs/SECURITY.md](docs/SECURITY.md).

Temperatures, line cleans, cleaning checks and accidents are logged in Alert65, and waste, stock counts and ordering in Nory, so Bar Book doesn't do them. What it saved before 25 October 2026 is read-only and in the managers' downloads.

Open it at https://rickdsage.github.io/bar-book/ and add it to your home screen (Safari: Share, then Add to Home Screen). Always use the venue's allergen matrix as the final word.

## What's here

| Path | What it is |
|---|---|
| `index.html`, `sw.js`, `manifest.webmanifest`, icons, `og.png` | The built site GitHub Pages serves from `main`. Made by `npm run build`; don't edit by hand. |
| `firestore.rules` | Who can read and change team data. This file is what protects it, not the app. `firestore.rules.txt` is a copy the site serves, for pasting into the Firebase console from a phone. |
| `src/template.html` | Every screen, the styles and the app's logic. |
| `src/live-src.js` | Team logins and live data. Bundled into `live.js` only when `firebase-config.json` exists. |
| `src/build.js`, `src/site.js` | Bundle the drinks data into the page, then write the site files. |
| `src/extras.js`, `src/builds.js`, `src/art.js` | Extra drinks, guide corrections and artwork. |
| `src/menu.js` | The Soho food, shakes and drinks for the Allergens tab, from blacktap.com and Toast. No allergens are set here: managers confirm them in the app. |
| `test/rules.test.mjs` | 176 allowed and refused cases for every collection and role. |
| `test/e2e/` | 39 browser tests: the real app on phone-sized screens, as owner, manager and staff at once, including offline and two phones changing the same item. |
| `docs/SECURITY.md` | Permissions, owner setup, risks, costs, safety check limits, release checklist, rollback and keeping the code private. |
| `LICENSE` | All rights reserved. No licence is granted. |

Both test suites run against the local Firebase emulators, never the live project.

## Setting up a laptop

1. Node.js 22 and Java 21 (the Firebase emulators need Java).
2. `npm ci`
3. `npx playwright install chromium` for the browser tests.
4. The drinks data lives in the Black Tap Drinks project folder, not in this repo. The build reads it from `DATA_DIR` (default `/mnt/project-files/black-tap-menu/data/`); set `DATA_DIR=/path/to/data/` to build somewhere else. The rules tests don't need it.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the site into the repo root, which is what Pages serves. Team logins are included only if `firebase-config.json` exists. |
| `npm run test:rules` | Starts the Firestore emulator, runs the rules tests, stops it. |
| `npm run test:e2e` | Builds a copy of the site that talks to the emulators (`.emusite/`, not committed), then runs the browser tests. |
| `npm test` | Both. |
| `npm run emulators` | Just the emulators, for trying things by hand alongside `npm run build:emu`. |

## Decisions worth knowing

- **Business day:** 6am to 6am UK time, so a close that ends at 2am belongs to the night before. Checklists, the Tonight counts and report grouping all use it, and times always show in UK time whatever a phone is set to.
- **Saving:** with no signal, changes wait on the phone and a banner says how many. Nothing is called sent until the server has it, and refused changes say so.
- **One record per task, with a version:** each change raises the version and writes its event (the audit trail) in the same write. Two phones changing the same item can't overwrite each other: the one working from an old copy is refused and told, and a change that syncs late can't add a second event.
- **Taking things back:** only whoever did an item, or a manager, takes it back, and after a few minutes it needs a reason. Blocked and Not needed tonight need a reason; only managers mark an item not needed, and it doesn't count towards what's required.
- **Lists are procedures:** started, then finished. Finishing with items left needs a manager and a reason, and a finished list is locked until a manager reopens it with a reason.
- **Restocking keeps asked, brought up and received apart**, so asking is never taken as proof something arrived. No stock level changes in Bar Book; stock is counted in Nory.
- **Overdue:** in progress for over 30 minutes, or a restock waiting over 15 minutes for someone to take it on or to confirm it arrived. Each is shown with words, never colour alone.
- **History is locked:** sent reports, the 86 log, decisions, closed incidents, fixed issues and account changes can't be edited. The old waste, temperature and stock count records can't be added to, edited or deleted.

- **Menu allergens:** Black Tap's website, Toast and Deliveroo list no allergens per item, so the app assumes none. An item shows its allergens only once a manager has confirmed them from the kitchen's allergen sheet, with their name and the time on it, and every change is kept. Logged out, the list shows the menu only. The Cocktails part still comes from our specs.

## Known limitations

- No notifications on phones where the app is closed, and no automatic emails: both need Cloud Functions, which need the paid Blaze plan. Updates arrive while the app is open, with pop-ups and badges. The WhatsApp and Email buttons open WhatsApp or the phone's email app with the text written in, and the person picks who it goes to.
- Done and required on a finished list are counted by the phone that taps Finish. The rules can't count the tasks, so the tasks and their events are the record of what was done.
- The audit trail can't be edited or deleted from the app, by anyone, the owner included. It isn't tamper-proof: anyone with access to the Firebase console can change any record, so keep console access to the project owners.
- The KPIs count taps, not work. Use them to ask questions, and tell the team that their changes are logged with their name and the time, and why (the ICO's guidance on monitoring workers is linked on the KPIs page).
- One venue per Firebase project.
- Photos are stored in the database and cleared after 30 days, because Firebase Storage also needs Blaze.
- PINs are 6 to 12 digits for everyone. Firebase won't accept a password shorter than 6, so 4-digit PINs aren't possible.
- Building needs the drinks data folder.
- The closing managers offered on the Send page are a fixed list in `src/template.html`.

## Copyright

© 2026 Charles Agyei II. All rights reserved. The code is public only so GitHub Pages can serve the app, which isn't permission to copy or reuse it. See [LICENSE](LICENSE).
