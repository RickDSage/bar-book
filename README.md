# Black Tap Bar Book

Phone web app for the Black Tap Soho bar and floor team: every drink spec with step-by-step picture guides, the Black Tap line-up, Rapid fire, the cocktail maker, allergens, spec practice and tonight's quiz, cheat sheets to print, and My pay: each person logs the shifts they work and gets an estimate of their pay, tronc, tax, National Insurance, student loan and pension, kept on their own phone only.

The team side is for bar and floor staff, with no logins: a phone picks a first name and types the team code, said in person. There's no messaging inside the app: the team talks face to face and sends on WhatsApp. It has the opening and closing checklists for the bar and floor ticked off live, the 86 board, restocking from the cellar, date labels, closing and handover with photos, issues and faults, Spin the wheel, Who to call, an incident write-up that points to the accident book, To the seniors (days off, swaps, complaints, faults, fixes, ideas, named or anonymous), Tell Derek (what's missing, what to add, what's wrong, read only by the owner) and Team only: rate the shift. Everything shareable goes out as a tidy WhatsApp message with tick boxes, photos shared on their own on iPhones, and a copy of everything sent goes to the owner and the seniors (rate the shift with no name). Up to four managers and maintenance (the owner) pick their name and unlock a team phone with their own 4 digit code, checked and counted by the server. The seniors' Manager section shows what's waiting and both sides' closing at the top, then the Inbox, the closing reports with photos, Everything sent, the 86 log and who's on the team, and they keep the lists, labels, games, drink photos and numbers. How it's set up, what keeps it secure and how to recover are in [docs/SECURITY.md](docs/SECURITY.md).

Temperatures, line cleans, cleaning checks and accidents are logged in Alert65 (and the venue's accident book), and waste, stock counts, ordering and rotas in Nory, so Bar Book doesn't do them. The kitchen isn't part of Bar Book.

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
| `test/rules.test.mjs` | 121 allowed and refused cases for every collection and role. |
| `test/e2e/` | Browser tests: the real app on phone-sized screens, as owner, senior and staff phones at once, including offline and two phones changing the same item. |
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
| `node scripts/cheatsheets.js <folder>` | After a build: the laminate cheat sheets (23 pages, double-sided) as an A4 PDF and a JPEG per sheet. Which drinks go on them is `SHEETS` in `src/cheatsheet.js`. |

## Decisions worth knowing

- **Finding your way:** five tabs at the bottom: Drinks, Shift, Team, My pay and Info. Drinks has a row of its own for the menu, Make one (the cocktail maker), Allergens and Practise. Shift has the bar's and floor's checklists, labels, restocking and the 86 board, and closing and handover. The Team page has who you are, posting a message, the messages, then a card for each tool; each phone remembers which cards are open. On a senior's or the owner's phone a Manager section comes first: one line of what's waiting and when each side's closing was sent, then Tell Derek (owner), Inbox, Closing reports, Everything sent, 86 log, Who's on the team and, for the owner, Seniors and their codes and Owner settings.
- **Languages and looks:** each phone picks English or one of 22 languages on the welcome screen or in Info, and Auto, Light, Dark or Gold (black and gold). The app's own words come from `src/i18n.json`, built from the batches in the project folder: the languages, then each English phrase with its 22 translations in the same order. What's on screen is matched whole against the English; a phrase with numbers is listed with {1}, {2}… in their place, and one with a name or a date with {a}…{d} ("Given to {a}", "Week of {d}"). Dates use the phone's own calendar words where the browser knows the language, a line made of parts joined by " · " or ending "(…)" is put together from the parts, and alert, confirm and prompt boxes go through the same words. An EN button in the header switches straight to English and back. Drink names, specs, method, glass, ice, garnish, allergens and sent reports are marked `translate="no"`. What people write (asks and replies, Tell Derek notes, issues, handover notes, photo notes) is wrapped with `ut()`: the app never runs it through the dictionary, and it gets a small Translate button that opens Google Translate in the phone's language (free, needs signal, sends that text to Google). Messages sent on WhatsApp go out in English.
- **Business day:** 6am to 6am UK time, so a close that ends at 2am belongs to the night before. Checklists, the Tonight counts and report grouping all use it, and times always show in UK time whatever a phone is set to.
- **Saving:** with no signal, changes wait on the phone and a banner says how many. Nothing is called sent until the server has it, and refused changes say so.
- **One record per task, with a version:** each change raises the version and writes its event (the audit trail) in the same write. Two phones changing the same item can't overwrite each other: the one working from an old copy is refused and told, and a change that syncs late can't add a second event.
- **Taking things back:** anyone on the team takes an item back to not started (a mis-tap, or clearing a list to start again), and a done item taken back after a few minutes needs a reason. Blocked needs a reason; only a senior or the owner marks an item not needed tonight, with a reason, and it doesn't count towards what's required.
- **Lists can be changed in the app:** a senior rewords, adds, moves or takes off items and picks the days one shows, and the new version goes on every phone in place of the standard one. Each item keeps its id, so tonight's ticks stay with it when the list changes. Every version is kept with who saved it and when, and any of them, or the standard list, can be put back. Two seniors saving at once can't overwrite each other without being told.
- **Date labels:** each side keeps a list of what it dates once it's opened, with how many days each keeps. Opening one dates it today and gives the use-by date to write on it (the pack's own date can bring it forward, never later). Changed it means the old one was binned and a new one opened and labelled, and Binned means used up or thrown away with no new one opened. Each tap keeps who and when, and the change before, so a label changed after its use-by shows on the record. Only the seniors and the owner add, change or take off items; the days are filled in only where Bar Book's lists already had them (desserts 2, strawberry and raspberry 14, maraschino cherries 28), and the rest are for the venue to set.
- **Lists are procedures:** started, then finished. Finishing with items left needs a senior or the owner and a reason. A finished list is locked until it's reopened with a reason; Clear reopens it.
- **Restocking keeps asked, brought up and received apart**, so asking is never taken as proof something arrived. No stock level changes in Bar Book; stock is counted in Nory.
- **Overdue:** in progress for over 30 minutes, or a restock waiting over 15 minutes for someone to take it on or to confirm it arrived. Each is shown with words, never colour alone.
- **History is locked:** sent closing reports, the 86 log, fixed issues and every checklist, list, restock and label change can't be edited.
- **Team code, not logins:** each staff phone signs in anonymously and joins by typing the team code; the server counts wrong guesses for the whole team (10 free, then one every 5 minutes, locked at 30 until the owner unlocks joining). A new code from Maintenance settings takes every phone off at once. Maintenance and up to four seniors (stored as role `manager`) unlock a joined phone with their own 4 digit code: the code is a salted hash only the owner can read, and the rules count every guess (5 free, then one every 15 minutes, locked after 10 until the owner unlocks it). See [docs/SECURITY.md](docs/SECURITY.md).
- **No messaging inside the app** (Derek, 16 November 2026): no live messages, CODE RED banner, templates, bell or shout-outs. The team talks to each other and uses WhatsApp.
- **A copy of everything sent:** each send from the Send page (WhatsApp, email, the share sheet or print) saves a copy of the text in `sent`, read only by the owner and the seniors, once per message. My pay and the team link are never copied. Team only: rate the shift is copied with no name, no side and no uid, and the rules refuse it any other way; the card tells staff so.
- **To the seniors and Tell Derek:** asks go to the seniors and the owner, named or anonymous (no name, uid or device id saved; the app warns that in a small team they may still guess). Tell Derek is for what's missing from the app, what to add or what's wrong, and only the owner reads it. Seniors change the lists, labels, games, drink photos and numbers themselves; changes to the app itself go to Derek this way.
- **Keeping it clean:** names, issues, Tell Derek and everything to the seniors are checked on the phone against a list of slurs, including spaced-out and number-for-letter spellings, before they go. Quoting what someone said for a complaint or incident is done with stars or "the N-word". The list is base64 in `src/template.html` (`BLOCKED`) so the source doesn't read as a list of slurs.
- **Incidents:** the write-up stays on the phone and goes on WhatsApp only (never saved to the team or copied to Everything sent, like Off sick); it tells staff to write it in the venue's accident book and tell the duty manager straight away; the accident book stays the record, and serious injuries may need reporting under RIDDOR, which the seniors decide.

## Known limitations

- No notifications on phones where the app is closed, and no automatic emails: both need Cloud Functions, which need the paid Blaze plan. Updates arrive while the app is open, with pop-ups and badges. The WhatsApp and Email buttons open WhatsApp or the phone's email app with the text written in, and the person picks who it goes to.
- Done and required on a finished list are counted by the phone that taps Finish. The rules can't count the tasks, so the tasks and their events are the record of what was done.
- The audit trail can't be edited or deleted from the app, by anyone, the owner included. It isn't tamper-proof: anyone with access to the Firebase console can change any record, so keep console access to the project owners.
- One venue per Firebase project.
- Photos are stored in the database and cleared after 30 days, because Firebase Storage also needs Blaze.
- Anyone who knows the team code can join, so say it in person and change it when it gets out. Names are typed, not checked.
- The slur check runs on the phone, not in the rules.
- Building needs the drinks data folder.

## Copyright

© 2026 Charles Agyei II. All rights reserved. The code is public only so GitHub Pages can serve the app, which isn't permission to copy or reuse it. See [LICENSE](LICENSE).
- **Standout features (`src/standout.js`):** smart 86 swaps that change the amounts to keep sweet and sour in balance (acid figures from Liquid Intelligence, juice sugars from USDA FoodData Central, syrups worked out from their recipes); Batch it into a 70 cl, 1 litre, 2 litre or 5 litre container with 20% water for stirred drinks (Death & Co, Diageo Bar Academy), fresh citrus flagged as tonight only; Shift replay and the Order draft for managers; voice commands with a confirm step (the iPhone keyboard's microphone where the browser has no speech recognition); the closing timer against the team's best (`closes`); last orders and the day and night times (`settings/venue`); the seasonal menu switch (`settings/season`); the offline badge; and, per phone, accessible mode, one-hand mode and sounds.
