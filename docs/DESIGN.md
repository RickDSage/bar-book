# How Bar Book is designed

Derek's rule, 18 November 2026: the whole app is streamlined, and every future change follows these principles. Check a change against this page before it ships. If a change breaks one, either fix the change or update this page on purpose, in the same pull request.

## The principles

1. **Strip what isn't needed.** Before adding a screen, button or setting, look for one that already does the job and extend it. If something isn't used on a real shift, take it out. Fewer screens and fewer buttons beat more features.
2. **No duplicates.** One thing lives in one place. If two parts of the app show the same information, merge them and link from the other. Examples: what's new lives only in tonight's brief (no separate pop-ups); one item picker (`src/pick.js`); one 86 source that ripples everywhere.
3. **Five tabs at most.** Drinks, Shift, Stock, Team, More (Apple's guideline is three to five). Anything used off shift, such as My pay, goes in More.
4. **Find reaches everything.** 🔍 at the top of every screen finds every screen, setting, action and drink. A new screen, setting or action needs a Guide entry (`FEATURES` or `gdItems`) and search words (`PLACE_KW`), or it can't ship.
5. **Easy back.** Every page reached from another has ‹ Back to where it came from, and the phone's own back works. ⌂ goes home.
6. **Fold, don't scroll.** Long pages fold into sections that remember whether they're open. Only the part you're working on is open.
7. **One Clear, one Undo, same place.** Every list's ↺ Clear sits in the row of tools at its top and acts straight away, with no "are you sure?". ↩ Undo clear takes its place for 15 minutes (or ↩ Undo on the toast for a clear on this phone only). Lists start fresh by themselves at 6am, so nobody has to clear them at night. Only wipes that can't be undone (Reset this phone, Start again) ask first.
8. **Nothing pops up over the app** except the first-time walkthrough. News, updates and alerts go in Needs you now and tonight's brief (the stories ring), where people choose when to look.
9. **Short and plain.** A walkthrough is four cards at most. A help line is one sentence. Tours of seven or more steps are finished about one time in six; three or four steps about three times in four (Chameleon's tour benchmarks).
10. **The iPad bar station is the fastest screen.** Anything a bartender needs mid-service is one tap from the station. The iPad has no WhatsApp: everything it sends goes by Mail, AirDrop or Files.
11. **Words, never colour alone.** Every status says what it is.
12. **Every change updates the help.** The walkthrough (`src/guide.js`, bump `WALK_V` and write `WALK_NEW`), the tour (`INTRO`), the ? panels (`src/help.js`) and the Guide's entries change in the same pull request.

## What we don't build

Things already decided against, so they aren't suggested again: a waste log, notice board, who's-on screen, refusals register, a separate faults tracker (Issues covers it), QR codes, costing or GP, chat or broadcast, real push notifications, guest upsell outside Training, and anything that duplicates Nory, Check65 or Toast.
