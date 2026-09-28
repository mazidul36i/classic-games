# Fix log

Short record of what broke, why, and what the fix relies on. Newest first.
Read the entries touching whatever you are about to change. History before the
first entry is in `ROADMAP.md` Phase 0–1.

---

## 2026-09-28 — Profile history and filtered leaderboards were empty; lobby slug and deck fixes

`firestore.indexes.json` (new), `firebase.json`, `Profile.tsx`, `Leaderboard.tsx`,
`GameLobby.tsx`, `MultiplayerRoom.tsx` · from `E2E_TEST_REPORT.md`

**Issue.** The profile showed the right totals, but "Recent hands" said *No hands on
record*. Unknown `/lobby/<slug>` URLs showed Card Flip. Word Match offered a deck
picker that had no effect.

**RCA.** Two queries need composite indexes, and the project had none: game history
(`uid ==` + `orderBy completedAt desc`) and the leaderboard's board-size filter
(`difficulty ==` + `orderBy score desc`). Firestore throws `failed-precondition`, and
both pages had a bare `catch` that turned it into an empty list. Confirmed live from
the console. The totals worked because they read counters on the profile document.
The leaderboard's "All" view is a single-field sort, which is why the report saw a
working board. For the lobby, an invalid slug fell back to `card-flip` in
`GameLobby.tsx`; it was not stale state. Word Match was flagged `usesDeck`, but
`generateWordCards` takes no theme.

**Fix.** Declared both indexes and wired them into `firebase.json`. Both `catch`es
now log the error. Unknown slugs redirect: the display names `sequence`, `pattern`
and `dots` map to their games, anything else goes to the `/lobby` default. Word
Match drops the deck picker and queues under the fixed theme, so players who picked
different decks no longer land in separate matchmaking buckets.

**Don't undo.** Any new `where` + `orderBy` on different fields needs an entry in
`firestore.indexes.json`. The CI workflow deploys Hosting only, so indexes and rules
go out by hand (`firebase deploy --only firestore:indexes`).

**Verified.** `npx tsc -b`, `npm run lint`. In the browser: the live index errors for
both queries; `/lobby/sequence?difficulty=6x6` → `/lobby/number-sequence?difficulty=6x6`;
`/lobby/nonsense` → `/lobby/dots-and-boxes`; Word Match lobby has no deck picker.

**Found during live verification: Dots and Boxes results were never recorded.**
Nobody had a Dots row in history or on the leaderboard. The live Firestore ruleset
was from 2026-09-13 and did not include the Dots rules from `9f987f1` (2026-09-15).
Those rules were tested on the emulator but never deployed, so every save was
refused, and the save's `catch` hid it. Deployed `firestore:rules`; round 2 of a
live test table then recorded once per player and did not duplicate on reload.
The save now logs failures, and the profile got a label for Dots and Boxes (it
showed "?✦ dots and-boxes").

**Not a bug.** The report's "lobby blank for 2–5s": nothing in the lobby waits on the
network, and the panel is a 0.87s framer-motion fade. In the automation window
`visibilityState` was `hidden` at 0 fps, and the panel stayed at `opacity: 0` for 7s+.
This is the throttled-window trap already in `CLAUDE.md`.

---

## 2026-09-28 — Turn ping-pong, double round credit, and the slow next-round deal

`useMultiplayer.ts`, `realtime.ts`, `dealUtils.ts`, `multiplayer.types.ts`,
`database.rules.json`, `test-rules.mjs` · ROADMAP 0.9, 0.12, 0.13

**Issue.** (0.9) Once a turn expired, `currentTurn` flipped between seats nonstop
and the table became unusable. (0.12) Reloading the round-over screen credited
the winner another `roundsWon` each time. (0.13) If the table spent more than 45s
agreeing on the next round, the deal failed with `permission_denied`.

**RCA.** (0.9) The expiry effect ran on the SDK's optimistic local write. A pass
shows up locally with an *estimated* server timestamp, so a tab that misjudged
the clock saw the turn it had just passed as already expired and passed it
again, looping entirely on local events. The rules time-gate every seat except
the holder, so a holder's premature pass was accepted for real. Two tabs with
good clocks never loop, which is why a clean repro needs a skewed tab: with a
50s skew, the SDK harness showed 9,041 turn changes in 20s. (0.12) The only
guard was `creditedRoundRef`, which starts empty on every mount. The Dots
leaderboard save (`savedResultRoundRef`) had the same guard and so did the same
thing to history and profile counters. (0.13) `startNextRound`'s first write set
`status: playing` on top of the last round's `turnStartedAt`.

**Fix.** (0.9) The expiry effect never passes its own turn, and each tab makes
at most one pass attempt per `TURN_LIMIT_MS`, timed with `performance.now()`.
A real expiry can't recur faster than that, so a due pass is never delayed.
(0.12) Seats carry `wonRound`. The credit writes it together with `roundsWon`,
and the rules require it to equal the room's `round` and refuse a second credit
for the same round. The Dots save also records the saved round in
`localStorage`. (0.13) The first write of the deal also stamps
`gameState/turnStartedAt`, the expiry effect skips a cleared board
(`isBoardCleared`), and a dealer whose tab died between the two writes finishes
the deal on the next tab (`layNextRound`).

**Don't undo.** Don't let a tab pass its own turn on expiry, and don't drop the
per-tab attempt limit. Neither the rules nor the server clock can stop a
holder's pass. Don't guard "already done this round" with a ref alone, because
refs reset on reload. Don't put the room back in play without restarting the
clock.

**Verified.** `npx tsc -b`, `npm run lint`, `npm run test:rules` (102 RTDB,
including the new `wonRound` and deal-clock cases, and 39 Firestore, 54 flip,
39 dots checks). For 0.9, a throwaway harness drove 2–3 real SDK clients
against the emulator through the expiry logic: the old logic looped (9,041 and
38,476 turn changes), the new logic made exactly one accepted pass per expiry.
Not yet driven in two browsers.

**Left open.** The two solo games still send `difficulty: "4x4"` (ROADMAP 0.7
note). Changing it would move their leaderboard row IDs.

---

## 2026-09-15 — Dots and Boxes never appeared on the leaderboard

`useMultiplayer.ts`, `firestore.rules`, `Leaderboard.tsx`, `test-firestore-rules.mjs`

**Issue.** Dots and Boxes had no leaderboard tab, and no game result was ever recorded
for it.

**RCA.** `saveGameResult` was only ever called from the four *solo* game pages
(`CardFlipPage.tsx` etc.) on their own completion handler. Multiplayer never called it
for any game — Dots and Boxes, being multiplayer-only, had no path to the leaderboard
at all. It also has no per-seat `score` to reuse (`FIX_LOG` above, "the board is the
scoreboard"), so `GameResult.score` needed a new meaning for this game.

**Fix.** Each seated player now records their own leaderboard row when their round
ends (`useMultiplayer.ts`'s `round-finished` effects, one more alongside the existing
`creditRoundWin` one) — `score` is boxes closed that round (`boxCounts`), `moves` is
lines that player drew, `difficulty` is the board size already carried for the game.
Recording per-round, not per-match, means a session of several rounds gets several
leaderboard writes per player; only a personal best stays visible, same as the other
games. `firestore.rules`' `maxScoreFor`/`maxMoves` got a `dots-and-boxes` case capped at
that board's box and edge counts (`totalBoxesFor`/`totalEdgesFor`, mirroring
`dotsUtils.ts`) instead of either existing shape — the board-game ceiling is scaled for
deck pairs, and the level-game ceiling has no board at all.

**Don't undo.** Each client writes only its own row (`d.uid == request.auth.uid` in the
rules) — there is no server to credit one player from another's tab. A round that ends
level, or lost outright, still gets recorded (`isWin: false` is a real result, same as
the solo games' 0.7 fix).

**Verified.** `npx tsc -b`, `npm run lint`, `npm run test:rules` (97 Firestore-rules
checks, including new allow/deny cases for a 4×4 board's box and edge ceilings).

**Left open.** No round-duration timer is tracked for Dots and Boxes rounds, so
`timeSeconds` is always recorded as `0` — the leaderboard doesn't display it for any
game, so this is not currently visible anywhere.

---

## 2026-09-08 — Refreshing mid-hand locked a player out of their own room

`a5a0c68` · `realtime.ts`, `useMultiplayer.ts`, `database.rules.json`, `flipUtils.ts`
· ROADMAP 0.10, 0.11

**Issue.** Refresh mid-game on a phone, then tapping cards did nothing. Permanent,
not intermittent.

**RCA.** Two bugs. (1) `onDisconnect(players/{uid}).remove()` deleted the seat on
refresh; nothing re-seated you, and `joinRoom` refuses a room that is not `waiting`
("That hand is already under way") — so you came back a spectator with no way in.
(2) A pair was resolved by a `setTimeout` in the tab that flipped it, so losing that
tab left `flippedCards` stuck at two and the old `length >= 2` guard killed every
later tap. Also `flipCard` appended without a duplicate check, so two taps of one
card wrote `[c0, c0]` — a card matches itself: free point, orphaned partner.

**Fix.** Seats carry `connected`; kept and marked away once a hand is in play, still
deleted while `waiting`. `activeOrder` skips absent seats. `flipCard` is a
transaction. Resolution moved onto the room subscription, so the next tab finishes an
abandoned pair. The point rides inside `resolvePair`'s single update. Round reset now
reads the board (`claimedPairs`) instead of watching `round` change — otherwise it
zeroed your score on every refresh.

**Don't undo.** Never delete a seat mid-hand. `seatedOrder` = seats held,
`activeOrder` = who is playing. No `setTimeout` in a click handler settling game
state. Deploy rules before app code — `connected` is a new field.

**Verified.** `npm run test:rules` (54 assertions, incl. the old stuck states and
negative rule cases); two browsers on the emulators, refresh mid-hand and full round.

**Left open.** ROADMAP 0.9 turn ping-pong. Rooms created before this still unseat on
refresh.
