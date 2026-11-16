# Security, setup and operations

How the team side of Bar Book is protected, how to switch the staff-only version on, what it costs, and how to undo a release.
Written for rules version 3 (`firestore.rules`, 15 November 2026). Official limits were checked on 24 and 25 October 2026; links are at the end.

## The short version

- **Staff have no login or password.** Each phone signs in to Firebase anonymously (Firebase gives it an id; nothing is typed) and joins the team with the team code and a first name. The code arrives inside the team link the owner or a senior shares in the staff WhatsApp group. A phone that joins gets `staff/{uid} = {name, role: 'staff', code, at}`, and the rules only accept it when `code` equals `config/team.code`.
- **The team code is the key.** Only the Firebase console can read or change `config/team`; no phone can. Every rule that lets a staff phone in compares its saved code with the current one, so changing the code in the console takes every staff phone off the team at once. They join again with the new link.
- **Only the owner and the seniors have a password:** the owner (made at first-time setup on 25 October 2026) and up to three seniors (Illias, Hassan and Artur), whom the owner adds in the app with a username and password the owner picks. A senior is stored as role `manager`. Underneath each is a Firebase email and password login with a made-up address (`illias-1a2b3c4d@users.example.com`). Nobody's real email or phone number is stored. The limit of three is kept by the app, not the rules: only the owner can add one.
- **What a login can do depends only on its record in `staff/{uid}`:** owner, senior (`manager`) or staff. No record, or a staff record with an old code, means no access to anything. Names saved on posts are labels for the screen; the rules check the uid.
- **No messaging inside the app** (16 November 2026). The team talks face to face and sends on WhatsApp. There are no live messages, banners, templates or shout-outs.
- **A copy of everything sent.** Each time someone sends from the Send page (WhatsApp, email, the share sheet or print), a copy of the text goes to `sent`, which only the owner and the seniors can read. My pay and the team link are never copied.
- **Team only: rate the shift is copied with no name.** Its copy in `sent` holds the text, the time and nothing else: no uid, no name, no side, no device id. The rules refuse it any other way. The copy leaves out the name and side even when the WhatsApp message itself has them. The app tells staff this on the card. In a small team what it says, and when, may still give it away.
- **Anonymous messages to the seniors** hold no name, no uid and no device id. In a small team the seniors may still guess from what it says, and the app says so before it's sent.
- **Tell Derek** (what's missing, what to add, what's wrong) is read only by the owner. Each person sees their own again; the seniors don't see anyone else's.
- **History can't be rewritten:** sent closing reports, the 86 log, fixed issues and every checklist, list, restock and date label change (each writes an event in the same write, checked against the change). Nobody can edit an event, the owner included.
- **Slurs:** names, issues, Tell Derek and everything sent to the seniors are checked against a list of slurs on the phone before they go, including spaced-out and number-for-letter spellings. It's a check in the app, not in the rules, so someone with a script could get round it; the seniors and the owner can take any issue or ask down.
- The Firebase web config in the site is public by design. It names the project; it doesn't grant access. The rules do.
- What people type is always shown as text, never run, and record ids that aren't plain letters, digits and dashes are skipped.

## Who can do what

O = owner, M = senior (role `manager`), S = staff (joined with the current team code), X = signed in but not on the team (no record, or an old code), V = visitor. Anything not listed is refused, including every collection not named here.

| Collection | Read | Create | Change | Delete |
|---|---|---|---|---|
| `config/team` (the team code) | nobody | console only | console only | console only |
| `staff/{uid}` (who's on the team) | O, M, S: everyone. X: only their own | a phone for itself, with a first name (up to 30 characters) and the current team code. O: a senior's record, with its username in the same write | a staff phone: its own name, with the current code | O, M: any staff phone. O: a senior. Anyone: their own (leaving). Nobody: the owner |
| `usernames/{name}` (login lookup) | anyone can look up one name; nobody can list them | O, with a senior's record | nobody | O, when removing a senior |
| `sent` (a copy of everything sent) | O, M | O, M, S: what was sent (up to 8,000 characters) and its kind, as themselves; or, for rate the shift only, with no uid or name and the server's time. Never My pay or the team link | nobody | O |
| `tells` (Tell Derek: missing, add, wrong) | O: all. M, S: their own | O, M, S, as themselves: a kind and the text (up to 1,000) | O: marks it done | O |
| `asks` (to the seniors: days off, swaps, complaints, faults, fixes, ideas, incidents, anything else) | O, M: all. S: their own named ones | O, M, S: a kind, the text (up to 2,000) and an optional when (up to 60). Named, as themselves, or anonymous with no uid or name | O, M: seen or done, with an optional reply (up to 500), signed | O, M |
| `reports` (closing and handover) | O, M, S | O, M, S, as themselves: bar or floor, the report, a summary and how many photos (up to 8) | nobody | nobody |
| `photos` (closing photos) | O, M: all. S: their own drafts, and any on a sent report | O, M, S: a JPEG up to 700,000 characters | the person who took it, before it's sent: the note, or attaching it to their own report in that report's write | the person who took it, before it's sent. O, M: once over 30 days old |
| `shift/{day}/tasks/{list}-{item}` (tonight's checklist items) | O, M, S | O, M, S, as themselves, for tonight (a day or two either side for phones that sync late), with its event and the version one higher. Start, Done, Unblock, back to not started: anyone. Blocked: anyone, with a reason. Not needed tonight (with a reason), bringing it back, and giving it to someone: O, M. Nothing changes once its list is finished | the same as create | nobody |
| `shift/{day}/runs/{list}` (each list, started then finished) | O, M, S | O, M, S: start it, or finish it once everything's done. Finishing with items left: O, M, with a reason. Reopening: anyone, with a reason. Each change writes its event | the same as create | nobody |
| `lists/{list}` (the seniors' version of a list) | O, M, S | O, M: the whole list, with its copy in `listlog` | the same as create | nobody |
| `listlog/{list}-{v}` | O, M | only with the list it copies | nobody | nobody |
| `labels/{id}` (date labels) | O, M, S | O, M: the item, side, days it keeps and whether it needs a label, with its event | Opened, Changed it, Binned: anyone, with its event. Changing the item itself: O, M | O, M, with its event |
| `restock` (restocking from the cellar) | O, M, S | O, M, S, as themselves, with its event | Take it on, brought up (whoever has it), got it, not in the cellar, blocked (with a reason): anyone. Give it to someone: O, M. Cancel: the asker, or O, M with a reason. Each change writes its event | nobody |
| `events` (the audit trail) | O, M, S | only inside the change it describes | nobody | nobody |
| `out` (86 board) | O, M, S | O, M, S, only with its log entry | nobody | O, M, S, only with its back-in-stock log entry |
| `outlog` (86 history) | O, M, S | only paired with a board change | nobody | nobody |
| `issues` (faults and jobs) | O, M, S | O, M, S, as themselves | O, M, S: take it on, give it to someone on the team, or mark it fixed with what was done. Fixed is final | the raiser while nobody's on it; O, M any |
| `settings/contacts` (Who to call) | O, M, S | O, M: up to 30 numbers, signed | the same | nobody |
| `fixtures` (football on the screens) | O, M, S | O, M: a real date from two days ago to 90 days ahead, a kick-off time and both teams | nobody | O, M |
| `drinkMedia/{drink}` (house photo and how-to video) | O, M, S | O, M: a JPEG and/or a link to YouTube, Vimeo, Instagram, TikTok or Google Drive | the same | O, M |

Visitors (V) can do one thing: look up a single username, which returns the made-up sign-in address and the uid. X can read their own staff record, and join if they have the current code. Both are tested.

Collections from before version 3 (rota, chat, briefings, guest recovery, sales, concerns, incidents, ratings, certificates and the rest) are no longer in the rules, so no app account can read or write them. Their data stays in the database until the owner deletes it in the console (optional; see "Moving to version 3").

Hiding a button is never the protection. Every row above is enforced by `firestore.rules` and covered by allowed and refused cases in `test/rules.test.mjs`.

## Switching the staff-only version on (owner)

Do these in order, outside service. Steps 1 and 2 change nothing the current app uses, so they're safe first.

1. **Turn on anonymous sign-in.** Firebase console, Authentication, Sign-in method, Add new provider, Anonymous, Enable, Save. Leave Email/Password on: the owner and the seniors use it.
2. **Make the team code.** Firestore Database, Data: collection `config`, document ID `team`, one field `code` (string), at least 8 characters, letters and digits only. Generate it in a password manager. It goes in the team link, so treat it like the door code: anyone with the link can join.
3. **Merge the pull request.** GitHub Pages publishes it in a few minutes.
4. **Publish the rules** within a few minutes of the merge: Firestore Database, Rules, paste `firestore.rules` (also at `/bar-book/firestore.rules.txt` for copying on a phone), Publish.
5. **Log in as the owner:** Team tab, Owner or senior login, with your username and your old PIN as the password. Tap Share the team link at the top and send it to the staff WhatsApp group.
6. **Take off old accounts, then add the seniors.** Open Who's on the team and take off every old manager and test account listed there. Then, in Owner settings at the bottom of the Team page, add Illias, Hassan and Artur one at a time: a first name, a username and a password you pick (6 or more characters). Tell each their password in person.
7. **Optional, later:** delete the old collections in the console (see "Moving to version 3").

If the owner's password is ever lost: the app can't reset the owner (by design). In the console, add a new user under Authentication (any made-up address, a password of 6 or more characters), then in Firestore create `staff/{new uid}` with your name, username and `role: owner`, change `usernames/{your username}` to the new address and uid, and delete the old `staff/{old uid}`.

## Phones and accounts over time

- **Joining** is opening the team link (or pasting the code) and picking a name. The phone remembers it. A phone can change its name (a shared bar phone passed to the next person) and leave from Info.
- **Taking a phone off the team** (lost, or someone who has left): the owner or a senior taps Take off the team. The phone forgets the team code and wipes its saved team data the next time it has signal. Anyone who still has the link can join again, so for someone who mustn't come back, change the code (below).
- **Changing the team code** takes every staff phone off at once: change `config/team.code` in the console and share the new link. Nothing they wrote is lost.
- **Clear everything** at the bottom of Info wipes what the app keeps on that phone and takes it off the team.
- **Passwords:** the owner and the seniors change their own in Owner or Senior settings. If a senior's is lost, the owner takes them off the team in Who's on the team and adds them again with a new one.
- **Anonymous users** pile up in Authentication, Users, one per phone that ever joined. They open nothing without a staff record and the current code; delete them there if you want a tidy list.

## Risks that remain, and why

These are the trade-offs of running with no server and no billing.

1. **Anyone with the team link can join.** The link carries the code, and the repo and site are public, so the code is the only thing between a stranger and the staff side. Keep the link in the staff group, and change the code when someone leaves on bad terms or the link gets out. The seniors see everyone who has joined under Who's on the team.
2. **Names are typed, not checked.** A phone can join as any first name. Posts carry the phone's uid as well, so the rules know which phone wrote what, but two phones could both say "Sam". The owner or a senior takes a wrong one off.
3. **Password guessing** for the owner's and seniors' accounts. Firebase locks a login for a while after many wrong passwords but doesn't publish the thresholds. Use a long password for the owner and each senior; the username lookup is public for a username you already know.
4. **Anonymity is limited.** Anonymous messages to the seniors and copies of rate the shift save no author, and no app account can see who sent them, but in a team this size what it says, and when, may give it away. The app says so.
5. **The slur check runs on the phone.** It stops ordinary use, not a determined person with a script. Every issue and ask can be taken down.
6. **Closed phones get nothing.** Notifying a phone with the app shut needs Cloud Functions and the paid plan. A senior's or the owner's phone with Bar Book open in the background can show a notification for something new; the team uses WhatsApp for anything urgent.
7. **Photos live in the database**, because Firebase Storage needs the paid plan. Each is shrunk under 600,000 characters, 8 at most per report, and cleared after 30 days by the owner's or a senior's phone.
8. **The audit trail isn't tamper-proof.** No app account can edit an event, but anyone with Firebase console access can change any record, and there are no backups on Spark. Keep console access to the project owners.
9. **No App Check yet.** Scripts using the public config are still bound by the rules; App Check would only make abuse harder.

## What it costs

Nothing, on the Spark plan as set up today. Spark can't bill you: when a free quota runs out, that Firebase product stops until the quota resets, so the worst case is the team board pausing, not a charge.

| | Free on Spark | My estimate for this team |
|---|---|---|
| Stored data | 1 GiB | photos at most around 290 MB with the 30-day clear-out (16 a night at the 600 KB worst case; usually far less), plus whatever the old collections still hold until they're deleted, plus each drink's house photo, which stays (200 drinks with one would be about 50 MB, 120 MB at most), text a few MB |
| Document reads | 50,000 a day | roughly 25,000 to 50,000 on a busy day. Each phone loads a few hundred records when it opens (tonight's tasks, lists, changes and restocks are about 250 of that by the close, plus issues and the 86 board; the owner's and seniors' phones also load the last 150 copies in `sent`); version 3 dropped the rota, chat, briefings and the manager screens, which were most of the rest. Opening a drink while on the team reads one more, its house photo and video link. After that only changes are read: each tap on an item or a restock is two records for every phone that's open. This is an estimate from the list sizes, not a measurement |
| Writes / deletes | 20,000 a day each | a few hundred |
| Outbound data | 10 GiB a month | closing photos load only when someone taps "Show photos". A drink's house photo loads each time a phone on the team opens that drink: three real photos of the back bar came to 200 to 270 KB each after the app shrinks them (600 KB at most), so 10 phones each opening 30 drinks with photos a night is about 2.5 GB a month |
| GitHub Pages | 1 GB site, soft 100 GB a month | about 2 MB per launch with signal, before compression |

Firestore's daily quotas reset around midnight Pacific time (about 8am UK time). The top of the reads estimate is the free limit, so check Usage after the first busy nights with tasks and restocking: running out at 11pm would pause the live features until 8am. If the reads get close, the cheapest fix is smaller list limits in `src/live-src.js` (or fewer downloads on busy days), not a paid plan.

Not used, because they need the Blaze (pay as you go) plan: Cloud Storage for Firebase and Cloud Functions, which is why there are no push notifications to phones that are closed and no emails sent automatically. The WhatsApp and Email buttons open the phone's own app with the text written in; Bar Book sends nothing itself. Blaze has no spending cap; budget alerts only send emails. Don't upgrade without deciding that on purpose.

## Before and after each release

1. `npm test` on the laptop: rules tests and browser tests, all green. Both run on the local emulators, never the live project.
2. Read the rules diff (`git diff main -- firestore.rules`). A rules change and the app change it needs ship together.
3. If there is live data by then: no automatic backups exist on Spark. Export what matters first (for example, copy key documents from the console) before any rules change that renames or reshapes data.
4. Publish the rules: Firebase console, Firestore Database, Rules, paste `firestore.rules` (also served at `/bar-book/firestore.rules.txt` so it can be copied on a phone), Publish. Or from the laptop: `npx firebase deploy --only firestore:rules --project black-tap-foh-book`. When a release changes the rules, publish them and merge within a few minutes of each other, outside service: in between, the old app's writes or the new app's are refused.
5. Merge the pull request. GitHub Pages publishes `main` in a few minutes. Phones pick up the new version on their next launch with signal.
6. Check on phones: a staff phone joins from the team link and picks a name; something sent on WhatsApp shows in Everything sent on a senior's phone, and a rate the shift copy shows as anonymous; a Tell Derek note reaches the owner only; something sent to the seniors, named and anonymous, read and answered in the Inbox; an item started, done, blocked with a reason and taken back; a list finished; a restock asked for, taken on, brought up and confirmed; a closing report with a photo; an issue raised, taken and fixed; a phone taken off the team.
7. Check refusals as staff: no Inbox, Everything sent or Owner/Senior settings; can't read the seniors' asks, anyone else's Tell Derek notes or the sent copies; can't mark an item not needed or finish a list with items left; can't change a list, a label's item, a game or a drink's photo.
8. Watch Firebase console, Usage, for the first week.

## Rolling back

The app and the rules go back together: version 3 of the app doesn't work with the version 2 rules, and the old app doesn't work with the new ones.

1. **App:** on GitHub, open the merged pull request and press Revert, then merge the revert. Pages republishes the old version in a few minutes.
2. **Rules:** paste the old rules back. They're in the old `firestore.rules.txt` on `main` (before the merge), and the console's Rules page also keeps a history of published versions.
3. **Data:** a rollback deletes nothing. What was written under version 3 stays where it is, and the old collections are still there unless they've been deleted, so rolling back to version 2 brings the old screens and their data back. Staff would need their old usernames and PINs again.

## Moving to version 3

Nothing needs moving. The checklists, lists, date labels, restocking, the 86 board and log, issues, closing reports and photos, drink media, games and Who to call keep their collections and carry on. New: `config/team`, `sent`, `tells`, and `asks` with the new kinds.

Old staff accounts (username and PIN) stop working: their staff records have no team code, so the rules don't count them as on the team. **Old manager accounts still count as seniors** (a senior needs no code), so the owner takes every old manager and test account off in Who's on the team before adding the seniors (step 6 above).

**Optional: deleting the old data.** These collections are no longer used by any screen or allowed by the rules: `audit`, `feed`, `calendar`, `shifts`, `requests`, `incidents`, `reviews`, `ratings`, `handovers`, `settings/hoq`, `settings/comp`, `settings/features`, `settings/onboard`, `nights`, `status`, `blocks`, `briefings`, `briefReads`, `guests`, `waste`, `kit`, `safety`, `pars`, `counts`, `training`, `concerns`, `concernPhotos`, `directory`, `chats` (with their `msgs`), `chatPhotos`, `pings`, `refusals`, `certs`, `avail`, `pulse`, `quiz`, `onboard`, `resets`, `shift/{day}/ticks`, `config/pins`, and the in-app messaging removed on 16 November 2026: `notices`, `seen`, `templates` and `shouts`. Download anything worth keeping first (there are no backups on Spark), then delete each collection in the console (Firestore Database, Data, the three dots next to the collection, Delete collection). It frees storage and can't be undone.

## App Check, later

App Check makes it harder for anything other than this site to use the project. It's worth adding once the team is using the app, in monitor mode first:

1. Register the site with reCAPTCHA Enterprise in App Check (Firebase lists up to 10,000 assessments a month at no cost; with the default one-day token, 20 phones use about 1,200). It doesn't say what happens past that, or whether Google Cloud asks for a billing account on the way; if it asks for a card, stop.
2. Add the App Check snippet to `src/live-src.js` and release.
3. Watch the App Check metrics for a week or two. Enforce only when nearly all requests are verified, since enforcing too early locks the team out.

## Optional extras

- Restricting the browser API key to `rickdsage.github.io` in Google Cloud (APIs and Services, Credentials) stops other websites using it in browsers. It isn't a security boundary.
- If you ever add Google sign-in or email links, add `rickdsage.github.io` under Authentication, Settings, Authorised domains. Username and password logins don't need it.

## Keeping the code private

It's optional, and it hides less than it sounds:

- The app's code runs on every phone that opens it, so anyone with the link can read the built site (`index.html`, `live.js`) whatever this repo's setting. Going private hides the source files, the tests, these docs and the history.
- Nothing in the repo is secret: the Firebase config is public by design, and the rules protect the data. Keep it that way whichever you choose.
- Copies made while the repo was public, such as forks and clones, stay where they are.
- `LICENSE` and the "All rights reserved" line in the app already mean nobody may reuse the code without your permission.

If you still want it, there are two ways. Both are for you to do: they change GitHub settings, billing or hosting.

**Option 1: GitHub Pro (paid; nothing changes for the team).** On GitHub Free, Pages only publishes public repositories. Pro publishes from private ones too, and the site stays public at the same address, so home-screen icons and logins carry on. Check the current price on GitHub's billing page before upgrading.

1. github.com, your picture, Settings, Billing and plans: upgrade to Pro.
2. This repo, Settings, General, Danger Zone, Change visibility: Make private.
3. Check that Settings, Pages still shows the site as published, and open it on a phone.

**Option 2: Firebase Hosting (free on Spark; new address).** Hosting is free up to 10 GB stored and 360 MB sent a day. A launch downloads about 310 KB (compressed) when the app has changed and less when it hasn't, so that covers over 1,000 launches a day; if it ever ran out, the site would stop until the next day rather than charge. The costs: a new address (`https://black-tap-foh-book.web.app`), everyone adds the app to their home screen again and logs in again (favourites and drafts don't move across), and each release becomes a deploy from the laptop instead of just a merge.

1. Ask Claude to prepare the repo for Firebase Hosting: a `hosting` section in `firebase.json` that publishes only the site files. Merge it.
2. On the laptop, in the repo folder: `npx firebase login`, then `npx firebase deploy --only hosting --project black-tap-foh-book`. It prints the new address.
3. Open the new address on a phone, log in, and check Tonight, a tick and the drinks list.
4. Send the team the new address. Each person opens it in Safari, uses Add to Home Screen, logs in, and deletes the old icon.
5. Only then make the repo private (Settings, General, Danger Zone, Change visibility). That takes the old GitHub Pages address down.
6. If you restricted the browser API key to `rickdsage.github.io` (see Optional extras), add `black-tap-foh-book.web.app` to it.
7. From then on, every release is: merge, then the deploy command from step 2.

Either way, the rules tests keep running on GitHub. In a private repo they use the plan's monthly Actions minutes (2,000 on Free, 3,000 on Pro).

## Sources (checked 24 and 25 October 2026)

- Firebase pricing plans (Spark shut-off, budget alerts): https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore pricing and free quota: https://firebase.google.com/docs/firestore/pricing
- Firestore quotas and the 1 MiB document limit: https://firebase.google.com/docs/firestore/quotas
- Rules conditions and access-call limits (10 per request, 20 per batch): https://firebase.google.com/docs/firestore/security/rules-conditions
- Field validation with `diff().affectedKeys()`: https://firebase.google.com/docs/firestore/security/rules-fields
- Offline persistence: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- App Check with reCAPTCHA Enterprise: https://firebase.google.com/docs/app-check/web/recaptcha-provider
- Cloud Storage needs Blaze: https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- Cloud Functions need Blaze: https://firebase.google.com/docs/functions/faq-and-troubleshooting
- Rules unit tests: https://firebase.google.com/docs/rules/unit-tests
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub plans (Pages from private repositories needs Pro or above; Actions minutes): https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- Firebase Hosting on Spark (10 GB stored, 360 MB a day): https://firebase.google.com/pricing
- Chilled food at 8°C or below, fridges at 5°C or below: https://www.gov.uk/food-hygiene-businesses/chilling-and-freezing
- Freezers at -18°C or colder (FSA, Safer Food, Better Business): https://food.gov.uk/sites/default/files/media/document/sfbb-retailers-chilling-02-frozen-storage.pdf
- Cellar 11 to 13°C (Cask Marque cellar card): https://cask-marque.co.uk/wp-content/uploads/2017/10/a4-cask-cellar-card.pdf
- Monitoring workers (ICO, UK GDPR): https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/employment/monitoring-workers/
