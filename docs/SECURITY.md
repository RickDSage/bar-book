# Security, setup and operations

How team logins are protected, how to switch them on, what it costs, and how to undo a release.
Written for rules version 2 (`firestore.rules`). Official limits were checked on 24 and 25 October 2026; links are at the end.

## The short version

- Everyone logs in with a username and a PIN. Underneath, that is a Firebase email and password login with a made-up address (`sam-1a2b3c4d@users.example.com`). Nobody's real email or phone number is stored.
- What a login can do depends only on its record in `staff/{uid}`: **owner**, **manager** or **staff**. No record means no access to anything. Names saved on posts are labels for the screen; the rules check the login's uid.
- There is exactly one owner, created once with a setup code. The owner can't be removed, demoted, reset or copied by anyone through the app.
- Every account change (added, new PIN, role changed, removed) writes an audit entry in the same write. The rules refuse the change without it, and nobody can edit or delete the entries.
- History can't be rewritten: sent reports, signed-off reports, the 86 log, decisions on requests, closed incidents, fixed issues and the account audit are all locked once written. Every change to a checklist item, a list or a restock writes an event in the same write, checked against the change; nobody can edit or delete an event, the owner included, so a correction is a new change with its own event.
- The Firebase web config in the site is public by design. It names the project; it doesn't grant access. The rules do.
- What people type is always shown as text, never run. Record ids aren't checked by the rules, so the app skips any record whose id isn't plain letters, digits and dashes, and a field called id inside a record can't take the real id's place (the rules refuse such a field, so only a write from the Firebase console could add one). Until 25 October 2026 a team login used from a script could have planted code in a manager's screen through an id; a browser test now covers it.

## Who can do what

O = owner, M = manager, S = staff, X = logged in but not on the team (for example someone removed), V = visitor not logged in. Anything not listed is refused, including every collection not named here.

| Collection | Read | Create | Change | Delete |
|---|---|---|---|---|
| `config/pins` (setup code) | nobody | console only | nobody | only by the owner setup write |
| `config/owner` (the one-time claim) | nobody | the owner setup write, once | nobody | nobody |
| `staff/{uid}` (who's on the team) | O, M: everyone. S, X: only their own | O: staff or managers. M: staff. Each needs its username and audit entry in the same write | O only: someone else's role, staff and manager only | O: anyone but the owner. M: staff. Needs the username freed and an audit entry |
| `usernames/{name}` (login lookup) | anyone can look up one name; nobody can list them | with the matching staff record | only during a PIN reset | only with the staff record's removal |
| `audit/{id}` (account changes) | O, M | only inside an account change, describing it exactly | nobody | nobody |
| `feed` (team board, read-only since 26 Oct 2026; use chat) | O, M, S | nobody | nobody | the author; O any; M any except the owner's |
| `notices` (broadcasts) | O, S: all. M: those that include managers | O: to everyone, the bar or the floor, and may leave managers out. M: the same, always including managers | nobody | O any; M any except the owner's |
| `seen/{broadcast}-{uid}` (Got it) | O: all. M: for broadcasts that include managers. S: their own | O, M, S: their own, once, for a broadcast that exists | nobody | nobody |
| `reports` (shift reports) | O, M, S | O, M, S, as themselves | O, M: sign off once | nobody |
| `photos` (closing photos) | O, M: all. S: their own, and any on a sent report | O, M, S: JPEG up to 700,000 characters | the uploader, before it's sent: a note, or attaching it to their own report in that report's write | the uploader before it's sent; O, M once it's over 30 days old |
| `shift/{day}/tasks/{list}-{item}` (tonight's checklist items) | O, M, S | O, M, S, as themselves, for tonight (a day or two either side, for phones that sync late), with its event in the same write and the version one higher than before. Start, Done, Unblock: anyone. Blocked: anyone, with a reason. Not needed tonight (with a reason), Bring back, and giving it to someone: O, M. Stop: whoever started it, or O, M. Taking back a done item: whoever did it (within 5 minutes, or later with a reason), or O, M with a reason. Nothing changes once its list is finished | the same as create | nobody |
| `shift/{day}/runs/{list}` (each list, started then finished) | O, M, S | O, M, S: start it, or finish it once done equals required. Finishing with items left, and reopening: O, M, with a reason. Each change writes its event | the same as create | nobody |
| `restock` (restocking from the cellar) | O, M, S | O, M, S, as themselves: the item, how many (over 0, up to 1,000), the unit, where it's going and any detail, with its event | Take it on: anyone, or once it's given to someone, them or O, M. Give it to someone: O, M. Brought up, saying how many: whoever has it, or O, M. Got it, saying how many arrived: anyone. Not in the cellar: anyone. Blocked: anyone, with a reason. Cancel: the asker, or O, M with a reason. Back to waiting: whoever has it or O, M; anyone with a reason once it's brought up; O, M with a reason once it's received, cancelled or marked not in the cellar. What was asked for never changes, and each change writes its event | nobody |
| `events` (the audit trail of tasks, lists and restocks) | O, M, S | only inside a change to a task, a list or a restock, matching it exactly: before and after, version, who, reason and time, and for a restock the item, amount and place | nobody | nobody |
| `shift/{day}/ticks/{list}-{item}` (old ticks, before tasks) | O, M, S | nobody | nobody | nobody |
| `out` (86 board) | O, M, S | O, M, S, only with its log entry | nobody | O, M, S, only with its back-in-stock log entry |
| `outlog` (86 history) | O, M | only paired with a board change | nobody | nobody |
| `requests` (old stock requests, before restocking) | O, M, S (the app loads them for O, M only) | nobody | O, M: mark ordered once | before it's ordered: the asker; O, M |
| `asks` (late, time off, swaps) | O, M: all. S: their own | O, M, S, with the details that kind needs | O, M: seen, approved or declined (seen can still be approved); never their own unless owner | O any; the asker until it's decided |
| `incidents` | O, M | O, M, S | O, M: close once, saying what was done | O |
| `reviews` (of reports) | O, M | O, M, on a report that exists | nobody | O any; M their own |
| `ratings` (anonymous feedback) | O: all. M: only about themselves | O, M: about another manager or the owner, never themselves. No author is saved | nobody | O |
| `issues` (handover) | O, M, S | O, M, S | O, M, S: take it on yourself (O, M can give it to anyone), or mark it fixed with a note. Fixed is final | O any; the raiser while nobody's on it |
| `waste` (old waste log, read-only) | O, M: all. S: their own | nobody | nobody | nobody |
| `kit`, `safety` (old temperatures and line cleans, read-only) | O, M, S | nobody | nobody | nobody |
| `pars/{item}`, `counts` (old par levels and stock counts, read-only) | O, M | nobody | nobody | nobody |
| `training/{uid}-{drink}` (sign-offs) | O, M: all. S: their own | O, M: someone else on the team, once per drink | nobody | O, M (taking it back) |
| `concerns` (Report a concern) | O, M: all. S: those sent to everyone, the bar or the floor, and their own named ones | O, M, S: a reason, where, an optional note (required for Something else), who it's for and up to 3 photos. Named as themselves, or anonymous with no uid or name saved | anyone it was sent to: mark it dealt with, once (managers only ones need O or M) | O, M any; the sender of a named one while it's open |
| `concernPhotos/{concern}-{n}` | O, M: all. S: those on concerns sent to the team | only in the write that creates their concern: a JPEG up to 700,000 characters, carrying the concern's audience, no uid | nobody | with their concern; O, M once over 30 days old |
| `directory/{uid}` (who's on the team, for chat) | O, M, S | their own entry, or O, M anyone's, always matching the staff record's name and role | the same | O, M once the person has left |
| `chats/{id}` (team chat, private chats, groups) | the team chat: O, M, S. A private chat or group: only the people in it, not O or M | the team chat once (id team); a private chat for yourself and one other person (one per pair); a group with a name and 2 to 40 people including you | your own read time; the preview, only with a message you send in the same write; a group's name and members by whoever started it or an O, M in it; anyone leaves | nobody |
| `chats/{id}/msgs` (messages) | the people in the chat | the people in the chat, as themselves, with up to 5 pings, all in the chat | nobody | the sender (unsend), with its photo |
| `chatPhotos/{chat}-{msg}` | the people in the chat, and the sender | only in the write that sends its message: a JPEG up to 700,000 characters | nobody | the sender; their phone clears their own after 30 days |
| `pings/{uid}-{chat}` | only the person pinged | only with a message that mentions them, sent in the same write | the same | only the person pinged (their phone does on reading the chat) |

Concerns sent to the bar or the floor reach every staff phone, and each shows the ones for the side it's set to, like broadcasts. Managers only is enforced: a staff login can't read that concern or its photos, and the anonymous sender can't see it again either. Photos are re-saved by the app before upload, which drops the location and camera details a phone puts in its photos.

Since 25 October 2026 temperatures, line cleans, cleaning checks, accidents and near misses are logged in Alert65, and waste, stock counts and ordering are done in Nory. Bar Book stopped logging them so nobody records the same thing twice. What it saved before then is read-only: nobody can add, edit or delete it, and managers download it from Activity, Old records. The app shows every value in an old stock count as text, since the rules never checked count lines one by one.

A broadcast for the bar or the floor reaches every staff phone, and each shows the ones for the side it's set to in Shift. That's about relevance, not privacy. Leaving managers out is enforced: a manager's login can't read that broadcast or who has read it.

Visitors (V) can do one thing: look up a single username, which returns the made-up sign-in address and the uid. X can do the same, plus read their own (missing) staff record. Both are tested.

Hiding a button is never the protection. Every row above is enforced by `firestore.rules` and covered by an allowed and a refused case in `test/rules.test.mjs`.

## Old safety check limits

The Old records download marks each temperature Bar Book saved against these, as the app did when it was logged. Alert65 has its own.

| Equipment | In range | Otherwise | Source |
|---|---|---|---|
| Fridge | 5°C or below | Above 5°C; over 8°C: "the legal limit for chilled food" | GOV.UK: chilled food must be kept at 8°C or below, a legal requirement in England; set fridges to 5°C or below |
| Freezer | -18°C or colder | Warmer than -18°C | FSA Safer Food, Better Business: good practice is -18°C or colder |
| Cellar | 11 to 13°C | Outside 11 to 13°C | Cask Marque cellar card |
| Glass washer | recorded, not judged | | Machines differ; follow the maker's figures |

## Switching team logins on (owner setup)

The site includes the live features only when `firebase-config.json` is in the repo (it has been since 25 October 2026). These are the steps, in order, for this project or a fresh one. Steps 1 and 2 are safe to do straight away, before anything else.

1. **Check the current rules.** Firebase console, Firestore Database, Rules. If you see `allow read, write: if request.time < timestamp.date(...)`, the database was created in test mode and is open to anyone until that date. Replace it now with the contents of `firestore.rules` and press Publish. Nothing uses the database yet, so this can't break anything.
2. **Make the setup code.** Firestore Database, Data: start a collection `config`, document ID `pins`, one field `setup` (string) holding a long random code, at least 16 characters, with no spaces at the start or end (the app trims them off what you type, and the rules compare exactly). Generate it in a password manager and don't reuse it anywhere. Do this step on a computer: on 25 October 2026 setup kept refusing a code typed into the console on a phone, and worked first time once `config/pins` was made again on a laptop. Don't send it by message or put it in GitHub.
3. **Add the web config.** Project settings, Your apps (add a Web app there if there isn't one yet): copy the `firebaseConfig` values into `firebase-config.json` at the repo root, for example `{"apiKey":"...","authDomain":"black-tap-foh-book.firebaseapp.com","projectId":"black-tap-foh-book","appId":"..."}`. This file is public by design. Then run `npm run build`, commit and merge. GitHub Pages publishes it within a few minutes.
4. **Create the owner.** On the live site, tap the bell at the top right, then open First-time setup (owner only). Enter your name, a username, a PIN of 6 to 12 digits and the setup code. One write creates the owner, records the claim in `config/owner` and deletes `config/pins`, so the code stops working at that moment.
5. **Optional tidy-up.** `config/owner` keeps the used code in its `proof` field. No app account can read it and it can't be used again, but you can delete that field in the console if you'd rather it wasn't stored.
6. **Smoke test with throwaway accounts** (generic names, not real staff): add one manager and one staff member, log in as each on another phone, and check the list under "Before and after each release" below. Then remove them.

If the owner's PIN is ever lost: the app can't reset the owner (by design). In the console, add a new user under Authentication (any made-up address, a PIN of 6 to 12 digits as the password), then in Firestore create `staff/{new uid}` with your name, username and `role: owner`, change `usernames/{your username}` to the new address and uid, and delete the old `staff/{old uid}`. Console edits aren't bound by the rules, which is why only project owners should have console access.

## Accounts over time

- **Adding someone** makes their login, staff record, username and an audit entry in one go. If the write is refused, the login it made is deleted again, so refused adds leave nothing behind.
- **PIN reset** moves the person to a new login (the app can't change someone else's password). Their old login keeps existing in Firebase Authentication but opens nothing, and their phone is logged out within seconds if it has signal.
- **Removing someone** deletes their staff record and username. Their phone logs out and wipes its saved copy of team data the next time it has signal. What they wrote keeps their name.
- **Logging out** wipes the phone's saved team data immediately, so a shared phone keeps nothing for the next person.
- **Old logins** from resets and removals pile up in Authentication, Users. They open nothing; delete them there if you want a tidy list.

## Risks that remain, and why

These are the trade-offs of running with no server and no billing. None of them needs fixing before launch, but you should know them.

1. **PIN guessing.** Every PIN is 6 to 12 digits, the same for everyone; 6 digits is a million combinations. Managers and the owner needed 8 until 25 October 2026, when the owner chose 6 for everyone because 8 felt too long (6 is the shortest password Firebase accepts). After many wrong PINs Firebase locks that login for a while (the app then says so instead of "wrong PIN"), but Firebase doesn't publish the thresholds, so treat it as a speed bump. Anyone who knows a username can try PINs. The owner and managers can do the most, so a longer PIN (Change PIN) is the cheapest upgrade for them. Use usernames that aren't obvious and reset PINs when people leave.
2. **The username lookup is public.** For a username you already know, it returns the made-up sign-in address and the uid. It can't list usernames. The app needs it to log in without a server, and the rules need the uid in it to keep usernames and accounts matched. A uid isn't a password: team members already see each other's on every post, and on its own it opens nothing.
3. **Anyone can make a Firebase login.** Turning off email and password sign-up would break "Add person", because the app makes new logins from the manager's phone. A stray login has no staff record, so it can't read or write anything. Firebase limits new accounts to 100 an hour from one address.
4. **Offline phones.** A removed person's phone that never gets signal again keeps what it last saw. Logging out wipes it at once; use that on shared phones.
5. **Anonymous feedback and anonymous concerns** save no author, and no app account can see who sent them. Someone could still guess from timing ("only one other manager was on that night") or from what's in a photo. They're anonymous to the app, not to deduction. An anonymous concern sent to the whole team could also be used to have a dig at someone; managers can take any concern down.
6. **Photos live in the database**, because Firebase Storage needs the paid plan. Each is shrunk until it's under 600,000 characters as stored (about 450 KB of JPEG), 8 at most per report and 3 per concern, and the rules refuse anything over 700,000. They're cleared after 30 days by the first manager's phone to open the app after that (there's no server to do it on a timer).
7. **No App Check yet.** Scripts using the public config are still bound by the rules; App Check would only make abuse harder. See "App Check, later".
8. **A finished list's counts come from the phone.** Done and required are counted by the phone that taps Finish, because the rules can't count the tasks. Someone with a login and a script could finish a list early without a manager by sending made-up counts. Each item's change is still its own record with its event, so the item rows, Activity and the audit trail show what was really done.
9. **The audit trail isn't tamper-proof.** No app account can edit or delete an event, and each one is checked against the change it describes. But anyone with access to the Firebase console can change any record, and there are no backups on Spark. It's a strong record of who tapped what and when, not proof that can't be questioned. Keep console access to the project owners.
10. **Chats are private to the app, not to the console.** Managers and the owner can't read private chats or groups they aren't in from the app, but anyone with Firebase console access can read every record. Tell the team that, and keep console access to the project owners. Pings and new messages only reach a phone while the app is open: notifying a closed phone needs Cloud Functions and the paid plan. Chat photos are cleared by the sender's phone after 30 days; someone removed from the team can't clear theirs, so a few may stay until removed in the console.
11. **Monitoring staff.** Live, Activity and the KPIs show who did what and when, by name. Under UK GDPR that is monitoring workers: tell the team what's logged, why and who sees it before using it to hold anyone to account, and treat the KPIs as a reason to ask, not proof (they count taps, not work). The ICO's guidance is linked at the end.

## What it costs

Nothing, on the Spark plan as set up today. Spark can't bill you: when a free quota runs out, that Firebase product stops until the quota resets, so the worst case is the team board pausing, not a charge.

| | Free on Spark | My estimate for this team |
|---|---|---|
| Stored data | 1 GiB | photos at most around 290 MB with the 30-day clear-out (16 a night at the 600 KB worst case; usually far less), text a few MB |
| Document reads | 50,000 a day | roughly 25,000 to 50,000 on a busy day. Each phone loads up to about 850 records as staff or 1,550 as a manager when it opens (tonight's tasks, lists, changes and restocks are about 250 of that by the close), plus the Got it records for the broadcasts on show and a few hundred more when a manager opens Training. After that only changes are read: each tap on an item or a restock is two records for every phone that's open. A manager opening the KPIs reads the last 7 nights of changes (about 1,000 to 1,500), and the spreadsheets read 31 nights of them once a night (a few thousand). This is an estimate from the list sizes, not a measurement |
| Writes / deletes | 20,000 a day each | a few hundred |
| Outbound data | 10 GiB a month | photos load only when someone taps "Show photos" |
| GitHub Pages | 1 GB site, soft 100 GB a month | about 2 MB per launch with signal, before compression |

Firestore's daily quotas reset around midnight Pacific time (about 8am UK time). The top of the reads estimate is the free limit, so check Usage after the first busy nights with tasks and restocking: running out at 11pm would pause the live features until 8am. If the reads get close, the cheapest fix is smaller list limits in `src/live-src.js` (or fewer downloads on busy days), not a paid plan.

Not used, because they need the Blaze (pay as you go) plan: Cloud Storage for Firebase and Cloud Functions, which is why there are no push notifications to phones that are closed and no emails sent automatically. The WhatsApp and Email buttons open the phone's own app with the text written in; Bar Book sends nothing itself. Blaze has no spending cap; budget alerts only send emails. Don't upgrade without deciding that on purpose.

## Before and after each release

1. `npm test` on the laptop: rules tests and browser tests, all green. Both run on the local emulators, never the live project.
2. Read the rules diff (`git diff main -- firestore.rules`). A rules change and the app change it needs ship together.
3. If there is live data by then: no automatic backups exist on Spark. Export what matters first (for example, copy key documents from the console) before any rules change that renames or reshapes data.
4. Publish the rules: Firebase console, Firestore Database, Rules, paste `firestore.rules` (also served at `/bar-book/firestore.rules.txt` so it can be copied on a phone), Publish. Or from the laptop: `npx firebase deploy --only firestore:rules --project black-tap-foh-book`. When a release changes the rules, publish them and merge within a few minutes of each other, outside service: in between, the old app's writes or the new app's are refused.
5. Merge the pull request. GitHub Pages publishes `main` in a few minutes. Phones pick up the new version on their next launch with signal.
6. Check as each role, on a phone: owner, manager and staff can log in; Tonight shows real counts; an item started, done, blocked with a reason and taken back; a list finished; a restock asked for, taken on, brought up and confirmed; 86 and back; a report with a photo, sign-off; an issue raised, taken and fixed; Live, Activity and the KPIs as a manager.
7. Check refusals as staff: no Requests or Managers tab; can't take back someone else's done item (the app says who did it); can't mark an item not needed or finish a list with items left.
8. Watch Firebase console, Usage, for the first week.

## Rolling back

The app and the rules go back together; version 2 of the app doesn't work with the old rules, and the old app doesn't work with the new ones.

1. **App:** on GitHub, open the merged pull request and press Revert, then merge the revert. Pages republishes the old version in a few minutes.
2. **Rules:** paste the old rules back. They're in the old `firestore.rules.txt` on `main` (before the merge), and the console's Rules page also keeps a history of published versions.
3. **Data:** a rollback deletes nothing. What was written under version 2 stays where it is; the old app ignores most of it and may show the 86 board oddly until items are marked back in stock. The same goes for tonight's tasks, lists, events and restocks if you roll back past the release that added them: the older app doesn't read them, and they're there again when you roll forward.

## Moving from the old rules (migration)

There is no live data to move: team logins were never switched on in the published site, so no accounts or records exist under the old rules. If you created anything in the console while setting up, delete it before step 1 above.

What changed, for anyone reading old notes:

- Checklists moved from one document per night (`shift/{day}` with arrays) to one small record per tick (`shift/{day}/ticks/{list}-{item}`), so two people ticking at once can't wipe each other.
- The 86 board (`out/{item}`) is keyed by a slug of the item name, holds the name, and links to its log entry; the log (`outlog`) stores `item`, `itemName`, `action`, `uid`, `name`, `at`.
- Owner setup now writes `config/owner` and deletes `config/pins` in one write. The setup code must be at least 16 characters.
- New: `audit` (account changes) and `issues` (handover). Reports have a `side` (bar or floor). Sign-offs, orders and decisions record the uid as well as the name. Asks save only the fields their kind needs. Incidents have `status`, and closing one records the outcome.

**Tasks, lists and restocking (25 October 2026).** Checklist ticks (`shift/{day}/ticks`) became tasks (`shift/{day}/tasks/{list}-{item}`), each list became a procedure (`shift/{day}/runs/{list}`), and every change writes an event (`events`). Stock requests (`requests`) became restocking (`restock`). Nothing needs moving or deleting: the old ticks are read-only and appear in the Checklists download for the nights they cover, and managers can still mark the last stock requests ordered or turn them down, under Requests, until they're cleared.

## App Check, later

App Check makes it harder for anything other than this site to use the project. It's worth adding once the team is using the app, in monitor mode first:

1. Register the site with reCAPTCHA Enterprise in App Check (Firebase lists up to 10,000 assessments a month at no cost; with the default one-day token, 20 phones use about 1,200). It doesn't say what happens past that, or whether Google Cloud asks for a billing account on the way; if it asks for a card, stop.
2. Add the App Check snippet to `src/live-src.js` and release.
3. Watch the App Check metrics for a week or two. Enforce only when nearly all requests are verified, since enforcing too early locks the team out.

## Optional extras

- Restricting the browser API key to `rickdsage.github.io` in Google Cloud (APIs and Services, Credentials) stops other websites using it in browsers. It isn't a security boundary.
- If you ever add Google sign-in or email links, add `rickdsage.github.io` under Authentication, Settings, Authorised domains. Username and PIN logins don't need it.

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
