# Black Tap Bar Book

Phone web app for the Black Tap Soho bar and floor team: every drink spec with step-by-step picture guides, allergens, spec practice, opening and closing checklists, the 86 list and the shift report.

Team logins add a live shift board shared by everyone on shift: Tonight at a glance, shared checklists, the 86 board, stock requests, issues and handover, shift reports with photos and sign-off, broadcasts to everyone, the bar or the floor (with who has read them), time off and swaps, incidents, Report a concern (with photos, to the team or managers only, and anonymous if you like), a waste log, temperature and beer line cleaning checks, a cleaning schedule for the jobs that aren't done every night, stock counts against par levels with an order list, training sign-off drink by drink and on venue training (allergens, ID checks, fire, chemicals, kegs, first aid), an Activity timeline of who did what (staff see their own side, bar or floor), and a Managers tab with spreadsheet downloads of each section's full history. They are switched on. How they were set up, what keeps them secure and how to recover are in [docs/SECURITY.md](docs/SECURITY.md).

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
| `test/rules.test.mjs` | 162 allowed and refused cases for every collection and role. |
| `test/e2e/` | 32 browser tests: the real app on phone-sized screens, as owner, manager and staff at once. |
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
- **One record per tick:** two people ticking at once can't wipe each other's work, and only whoever ticked an item (or a manager) can untick it.
- **History is locked:** sent reports, the 86 log, decisions, closed incidents, fixed issues, account changes and stock counts can't be edited, and only the owner can delete a count. Waste, safety and cleaning records can't be edited either: whoever logged one can take it back for 15 minutes, and after that only the owner can delete it.
- **Safety check limits** follow UK guidance (fridges 5°C or below and never over the legal 8°C, freezers -18°C or colder, cellar 11 to 13°C, beer lines cleaned at least every 7 days). Sources are in [docs/SECURITY.md](docs/SECURITY.md).

## Known limitations

- No notifications on phones where the app is closed: that needs Cloud Functions, which need the paid Blaze plan. Updates arrive while the app is open, with pop-ups and badges.
- Photos are stored in the database and cleared after 30 days, because Firebase Storage also needs Blaze.
- PINs are 6 to 12 digits for everyone. Firebase won't accept a password shorter than 6, so 4-digit PINs aren't possible.
- Building needs the drinks data folder.
- The closing managers offered on the Send page and the venue training topics are fixed lists in `src/template.html`.
- Cleaning jobs repeat every 1, 2 or 4 weeks. Nightly jobs belong on the closing checklist, which is also fixed in `src/template.html`.
- Stock counts and par levels cover the items in the stock list in `src/template.html` (the same list as stock requests and the 86 board). Anything else needs adding there.

## Copyright

© 2026 Charles Agyei II. All rights reserved. The code is public only so GitHub Pages can serve the app, which isn't permission to copy or reuse it. See [LICENSE](LICENSE).
