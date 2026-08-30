# Roadmap

Where The Memory Parlour stands, and what I would build next — in order, and
without turning on billing.

The design work is done and it is genuinely good: the Parlour theme is coherent,
the reduced-motion handling is thorough, and the app looks like a product rather
than a tutorial. The gap is underneath. The app is deployed publicly with its
databases in test mode, one of the two multiplayer games deals the wrong deck,
and — until the rules test that came with Phase 1 — there was no test covering any
of it.

**The constraint that shapes this plan: the project stays on the Firebase Spark
(free) plan for now.** That rules out Cloud Functions entirely — including
scheduled ones — which is where the previous plan put its trust. So the trust
moves to the only free enforcement point there is: security rules. Phases 0–4
below all ship on Spark. Everything that genuinely needs a card on file is
quarantined in Phase 5, with the condition that would make me go turn it on.

---

## Ground rules — what free actually gives

Worth writing down, because two items below are ordered by these numbers rather
than by how interesting they are.

**Free and good enough to build on:** Firestore and Realtime Database with full
security rules, email/password and Google sign-in, Hosting with SSL and a custom
domain, the emulator suite, and the whole client-side app.

**Not available at all:** Cloud Functions (any trigger, including scheduled),
Firestore TTL policies, and — for projects created since late 2024 — Cloud
Storage. Anything in the old plan that read "a Cloud Function on that create"
has to be re-planned, not just postponed.

**The ceilings that will actually bite, roughly, in the order they'll bite:**

- **Hosting: ~360 MB of transfer per day.** The current build ships ~925 KB of
  JavaScript, about 285 KB of it over the wire after compression, plus fonts.
  That is somewhere near **1,000–1,200 cold visits a day** before the site stops
  serving until tomorrow. This is why bundle splitting moved up the list — it is
  no longer a performance nicety, it is how many people can visit.
- **Realtime Database: 100 simultaneous connections.** That is the hard ceiling
  on concurrent multiplayer, and every open tab on a room page holds one.
- **Firestore: 50k reads and 20k writes a day.** Comfortable at this scale, but
  the daily and weekly boards in 3.2 multiply the writes per finished game, so it
  is worth counting before shipping them.

None of these are close today. All of them are reasons Phase 5 exists.

---

## Phase 0 — Close the holes

Everything here is a correctness or safety bug in code that is live right now.
None of it is more than a day's work, none of it costs anything, and all of it
should ship before any new feature.

### 0.1 Write security rules — the one that matters

**Half done.** `database.rules.json` exists, is wired into `firebase.json`, and
has `npm run test:rules` behind it (see Phase 1) — but it has not been deployed
yet, and there is still no `firestore.rules`. So today, live:

- anyone can write any score to `leaderboard/{gameType}/scores` — the board is
  decorative, not a record
- anyone can rewrite another player's `users/{uid}` profile and stats
- rooms are still open until the Realtime Database rules are actually pushed

Note that deploying the database rules and shipping the current client are one
release, not two: the rules reject writes the old client makes (it stamps its own
timestamps and scans `rooms` for a quick match), and the new client is written
against the rules. Push them together.

**Do:** write the Firestore half, then deploy both.
Rules are free, and on this plan they are the *only* server-side thing in the
system — so they carry more weight here than they would on a project with
functions. Minimum viable shape:

- `users/{uid}` — readable by anyone signed in, writable only by its owner, with
  `email` and `createdAt` immutable after creation.
- `gameHistory/{id}` — create-only, `request.resource.data.uid == request.auth.uid`,
  no update or delete from any client.
- `leaderboard/{gameType}/scores/{entryId}` — see 0.2. The document ID is already
  `{uid}_{difficulty}`, which rules can check directly: a player can only write
  the row that is named after them.
- `rooms/{roomId}` — readable and writable only by a signed-in player already in
  `players/`, `hostId` immutable after creation, `createdAt` pinned to `now`.

Test them with the emulator (`firebase emulators:start`, free) before deploying,
because a rules mistake here is silent in exactly the same way the missing rules
are today.

### 0.2 Make the score write atomic and rules-checked

`saveGameResult` (`src/firebase/firestore.ts:71`) writes three things: the
history document, then the leaderboard row, then the user's counters — three
separate round trips, of which only the leaderboard write is transactional. A tab
closed between call one and call three leaves the profile permanently out of step
with the history.

The old plan moved this to a Cloud Function. Without one, the free answer is to
do it properly on the client and let the rules do the checking:

**Do (client):** fold all three writes into a single `runTransaction`. Firestore
transactions span documents — read the leaderboard row first, then write the
history doc, the leaderboard row and the profile counters together. The
read-then-write pattern is already in `submitLeaderboardScore`
(`src/firebase/firestore.ts:98`); this is that pattern widened.

**Do (rules):** make a forged row as expensive as possible to write.

- the entry ID must equal `{request.auth.uid}_{difficulty}`, and `uid` must match
  the caller
- a row may only be replaced by a **higher** score, so an attacker gets one shot
  at a plausible number rather than free rein over the board
- `score`, `moves` and `timeSeconds` must be integers inside sane bounds for
  their game and difficulty — a perfect 4×4 has a known ceiling
- `completedAt == request.time`, and at least a few seconds after the row's
  previous `completedAt` — a crude but real rate limit, and rules can express it
  because they can read the document being replaced

**Be honest about the ceiling:** this makes the board *tamper-resistant*, not
*authoritative*. Someone with the browser console open can still submit a score
that is merely plausible. That is an acceptable trade for a hobby leaderboard,
and it is the best argument for Phase 5.1 the day it stops being one.

### 0.3 Word Match multiplayer deals the wrong game

`MultiplayerRoom.handleStart` calls `generateCards(room.difficulty, room.theme)`
(`src/pages/MultiplayerRoom.tsx:32`) regardless of `room.gameType`. A Word Match
room is dealt an emoji or colour deck: the lobby offers the mode, the room says
"Word Match", and the board is Card Flip. Multiplayer for this game has never
actually worked.

**Do:** lift `generateWordCards` out of `WordMatchPage.tsx` into
`src/utils/wordUtils.ts` and pick the generator by `gameType`. This is the single
highest-value-per-hour fix in the list — it doubles the working multiplayer
catalogue in about an hour, and costs nothing but the hour.

### 0.4 Word Match 8×8 is a lie

`generateWordCards` reads `difficulty === "4x4" ? 8 : difficulty === "6x6" ? 18 : 18`
(`src/pages/WordMatchPage.tsx:41`), and `WORD_PAIRS` only holds 18 entries.
Choosing "the long night" silently deals the 6×6 board.

**Do:** either extend the word list to 32 pairs, or hide 8×8 for Word Match in the
lobby. I would extend the list — the difficulty note promises something the game
should deliver, and 14 more word pairs is a ten-minute job.

### 0.5 A leaver freezes the room forever

**Mostly done, in Phase 1.** `leaveRoom` used to remove the player and nothing
else, so a leaver holding the turn left `currentTurn` pointing at a uid with no
player and the room dead. It now hands the turn on before unseating, closing a tab
unseats the player through `onDisconnect`, and the turn clock (1.3) covers the
case where neither happens.

**Still to do:** the host control the UI implies — reclaim or close the table from
the room itself. "Close the room" exists, but only on the result modal after a
finished hand.

### 0.6 Housekeeping

- Remove `console.log("game state", gs)` (`src/hooks/useMultiplayer.ts:36`) — it
  logs the full board, every flip, in production.
- `index.html:5` still ships `<link rel="icon" type="image/svg+xml" href="/vite.svg" />`.
  The app has a strong visual identity and a vermilion crosshatch card back that
  would make a perfect favicon.

---

## Phase 1 — Make the table trustworthy without a server — **shipped**

Multiplayer used to work because everyone was polite: every rule was enforced in
the browser, so any client could flip on another player's turn, award itself
points, or resolve a turn however it liked.

The old plan's answer was a Cloud Function on the second flip. What shipped
instead is `database.rules.json` — free, and now the only server-side thing in
the project — plus the turn clock that covers what rules cannot check.

**1.1 The multiplayer score write is atomic.** `incrementPlayerScore`
(`src/firebase/realtime.ts`) was a `get` followed by a `set`, so two writes that
interleaved lost a point. It is a `runTransaction` now.

**1.2 Turn enforcement moved into the rules.** `database.rules.json` gates every
write the client makes:

- only the turn holder may touch `gameState`, and only the host may deal
- `flippedCards` may never hold three cards
- `matchedPairs` may only rise, and only by one; `totalPairs` is fixed at the deal
- a player's `score` may only rise by one, only by that player, and only while
  they hold the turn
- `currentTurn` may only be handed to a uid that is actually seated
- rooms may not be listed, only opened by code; `hostId`, `gameType`,
  `difficulty` and `createdAt` are immutable after creation
- `createdAt` and `turnStartedAt` are pinned to server time (`newData.val() === now`),
  so the staleness sweep and the turn clock cannot be gamed by a bad clock

What rules still cannot check is whether a claimed match is *real* — the client
computes `cards`, and a rule cannot cheaply compare two card faces. That last mile
is Phase 5.2. Also unenforceable without counting children: `maxPlayers`. A
patched client can seat a fifth player at a four-seat table; the join is otherwise
legal and nothing else breaks.

`npm run test:rules` runs 42 assertions against the emulator — the deny cases as
much as the allow ones. Two emulator traps are documented in
`scripts/test-rules.mjs`, because either one makes the whole suite vacuously
green: an `owner` bearer token bypasses rules, and a namespace the emulator has no
rules for is wide open.

**1.3 The turn clock is real.** `turnStartedAt` was written on every resolve and
never read. It now drives a visible countdown, and once it expires anyone still at
the table may pass the turn — a write the rules permit *only* after the deadline,
so it cannot be used to jump a live turn. Deadlines are server-stamped and the
countdown is drawn against `.info/serverTimeOffset`, so a player whose clock is
wrong still sees the right number.

**1.4 Quick match no longer scans the database.** It read **every room** and
filtered in the browser; the rules in 1.2 forbid that outright. Public rooms now
publish a pointer to `openRooms/{gameType}_{difficulty}_{theme}/{roomId}`, and
matchmaking reads one bucket, capped at eight candidates.

**1.5 Rooms clean up after themselves.** No scheduled function, so cleanup is
opportunistic and comes from four places: `onDisconnect().remove()` on the player
node, so a closed tab empties a seat; deleting the room when the last player
leaves; retracting index pointers that outlived their rooms, on the next quick
match; and a rule letting any signed-in client delete a *waiting* room older than
six hours, which the join path does when it meets one. The last player in a
**private** room also arms `onDisconnect` on the room itself — nothing indexes
private rooms, so nobody else could ever find one to sweep it.

Two other things fell out of the work. Turn order was `Object.keys(players)`,
which is not a guaranteed order and so could differ between clients mid-game; it
is now seated order, by `joinedAt`. And `RoomPlayer.isCurrentTurn` was written on
every deal and read nowhere — removing it also removed the only write one player
made to another player's data, which is what let the rules close that path
completely.

**Still open after this phase:** a room abandoned *mid-play* survives until
someone who knows its code visits — it is not in the matchmaking index and nobody
can enumerate it. That is the honest cost of having no scheduler, and it is what
Phase 5.3 buys.

---

## Phase 2 — Foundations worth having before more features

**2.1 Split the bundle.** The build ships ~925 KB of JavaScript across five
chunks — `firebase-vendor` is 484 KB of it, `motion` another 123 KB — with no
`lazy()` or `Suspense` anywhere, so every visitor downloads the Realtime Database
and both multiplayer pages to play Pattern Memory once. `vite.config.ts` already
splits vendors by library, which is the easy half; the missing half is
route-level `lazy()`, so those vendors stay out of the first-load path.

On Spark this is a capacity question, not just a speed one: first load is the
number that divides into the daily hosting allowance. Cutting it roughly in half
doubles how many people can visit before the site goes dark for the day.

**2.2 Tests.** There is no test runner and no `test` script in `package.json`.
Best return per line of setup: `calculateScore` and `generateCards` (pure, and the
deck generator has already shipped one silent off-by-one in its Word Match twin),
`useCardFlip` behaviour, and multiplayer turn resolution once it moves out of the
component. Vitest plus Testing Library, `npm test` in CI beside the lint step that
already passes clean. The emulator suite is free and can test the 0.1 rules too —
worth doing, since rules are now load-bearing.

**2.3 Extract one game engine.** `WordMatchPage.tsx` reimplements `useCardFlip`
almost line for line — its own flip state, lock, timer, moves and completion
handling — and the two have already drifted (different scoring, different
difficulty handling, the 8×8 bug in one and not the other). One
`useMatchGame({ deck, scoring })` hook, with Card Flip and Word Match passing
different deck generators, removes the drift and is what keeps 0.3 fixed.

**2.4 Make the board keyboard-accessible.** `Card` is a `<div onClick>` with no
`role`, no `tabIndex`, no `aria-label` (`src/components/game/Card.tsx:31`). The
card games cannot be played without a mouse and are opaque to a screen reader —
conspicuous, because the rest of the app is careful: `aria-pressed` on every lobby
option, labelled lives counters, `useReducedMotion` throughout. Make it a real
`<button>` with an accessible name ("Card 7, face down"), and announce matches via
a live region. Half a day, and it brings the weakest part of the app up to the
standard the rest already sets.

**2.5 Add an error boundary.** Any throw inside a game unmounts the whole app to a
blank page. One boundary at the route level, in the Parlour's voice, is an hour's
work — and more valuable here than usual, because once rules enforce writes (0.1),
permission-denied becomes a normal client-side failure mode.

---

## Phase 3 — Reasons to come back

The app has four games, a leaderboard and a profile — everything needed to play
once. Nothing yet gives a reason to return tomorrow. All of this is free; 3.1 and
3.2 are noticeably weaker without a server, and I would ship them anyway.

**3.1 The Daily Hand.** One seeded deck per day, the same for everyone, one scored
attempt. It costs almost nothing — seed the existing shuffle by date — and it is
the standard retention mechanic for this genre because it manufactures a fair
comparison. It also fits the theme better than anything else here: the house deals
one hand a day. Caveat worth accepting up front: with the seed derived on the
client, a curious player can read tomorrow's hand out of the bundle, and "one
attempt" is enforced only by the leaderboard rule from 0.2 that refuses a second
write for the same day. Fine for a friendly board.

**3.2 Time-boxed leaderboards.** `getLeaderboard`
(`src/firebase/firestore.ts:141`) is all-time only, so a player arriving next
month can never appear on it. The one-row-per-player problem is already fixed —
entries are keyed `{uid}_{difficulty}` and the query keeps each player's best — so
what is left is genuinely just the time window: extend the entry ID to
`{uid}_{difficulty}_{YYYY-MM-DD}`, store the day as a field, and query it. This is
what makes 3.1 worth playing.

Count the writes before shipping: a finished game currently writes three
documents, and a daily board plus a weekly board makes it five. At 20k writes a
day that is still thousands of games, but it is the first feature that turns the
Firestore quota into a real number rather than a theoretical one.

**3.3 A shareable result.** A game with this visual identity and no share path is
leaving its cheapest growth channel unused. Render the finished hand as a small
card — moves, time, the day's seed — that a player can post. Draw it to a canvas
in the browser and hand over a data URL or a clipboard image; do **not** plan on
uploading it anywhere, since Cloud Storage is a Phase 5 item. Wordle's
spoiler-free grid is the model.

**3.4 Streaks and honours on the profile.** The profile already computes win rate
and best scores from counters maintained in `updateUserStats`
(`src/firebase/firestore.ts:45`); it has room for a streak counter and a small set
of earned marks — first perfect hand, ten days running, cleared the long night.
Cheap to add on top of counters that already exist, and it folds into the same
transaction as 0.2 rather than adding writes.

**3.5 Sound.** Four memory games with no audio. A short set of letterpress-ish
cues — the card, the match, the miss — with a persisted mute toggle, adds a
surprising amount of feel for a day's work. Keep the files tiny and let them
cache: audio comes out of the same daily hosting transfer as the bundle.

---

## Phase 4 — The bigger bets

Worth a prototype once the foundation holds, roughly in order of how much I
believe in them. All of these still fit inside the free plan.

- **Race mode for the solo games.** Number Sequence and Pattern Memory are
  single-player only, and both are naturally competitive: same seed, same start,
  live progress bars, first to fail drops out. It reuses the room infrastructure
  Phase 1 will have hardened, and doubles the multiplayer catalogue again. Watch
  the 100-connection ceiling — this is the feature most likely to find it.
- **Asynchronous challenges.** Send a friend a link to the exact hand you just
  played, with the seed encoded in the URL. No lobby, no waiting, no scheduling,
  no database write at all — the lowest-friction multiplayer there is, and the
  cheapest thing in this document. It turns 3.3's share card into an invitation.
- **Install as an app.** No manifest, no service worker. These games are the
  archetypal phone-in-a-queue activity, and all of them except multiplayer work
  offline in principle. On this plan it pays twice: a cached shell is transfer the
  hosting quota never has to spend again.
- **A fifth game with a different shape.** All four current games are recall
  tests. Something with working-memory pressure — an n-back, or a "what changed"
  spot-the-difference — would broaden the appeal without breaking the theme.
- **Difficulty that adapts.** Three fixed sizes are coarse. Tuning the board to a
  player's measured accuracy would keep the middle of the skill curve engaged, and
  the data to do it is already in `gameHistory`.

---

## Phase 5 — What the meter would buy

Deliberately deferred. Everything here needs the Blaze plan, which means a billing
account. Blaze keeps the same free allowances and charges only for the overage, so
at this app's current traffic the bill would be small — but "small" is not
"nothing", and nothing is the right number until one of the triggers below
actually fires. Whenever one does: set a budget alert and per-service spend caps
on day one, before deploying anything.

**5.1 Authoritative score writes.** A Cloud Function on `gameHistory` create
derives the leaderboard row and the profile counters server-side, and rules drop
client writes to the leaderboard entirely. This is the difference between a board
that is hard to forge (0.2) and one that is impossible to forge.
*Trigger:* the first forged entry, or the first time a prize, season or public
ranking makes forging worth someone's afternoon.

**5.2 Server-side turn resolution.** A function triggered on the second flip
compares the two card faces, awards the point and hands out the next turn —
closing the one gap rules cannot check in 1.2, where a client claims a match that
never happened.
*Trigger:* multiplayer between strangers rather than between friends.

**5.3 Scheduled cleanup and TTL.** A nightly function deleting rooms older than a
few hours, plus a Firestore TTL policy on old history, replaces the opportunistic
sweep in 1.5 with something that runs whether or not anyone is online.
*Trigger:* the RTDB store creeping toward its 1 GB, or the 1.5 sweep visibly
failing to keep up.

**5.4 Cloud Storage.** Uploaded avatars, or any user-supplied image. Projects
created since late 2024 need Blaze even to enable the bucket, so this is a hard
blocker rather than a quota one — until then, profile pictures stay whatever URL
the auth provider gives us.
*Trigger:* wanting custom avatars badly enough to pay for them.

**5.5 Headroom.** The three ceilings from the top of this document — 100
concurrent RTDB connections, ~360 MB of daily hosting transfer, 50k Firestore
reads a day — are all lifted by the same upgrade.
*Trigger:* concurrent players regularly above ~80, or the first day the site stops
serving because the transfer ran out. Both are good problems.

**5.6 The long tail.** Abuse protection beyond rules (App Check — check its own
billing terms before enabling), transactional email via the Trigger Email
extension, phone auth, BigQuery export of `gameHistory` to feed the adaptive
difficulty in Phase 4. None of these are close.

---

## What I would do first

If I had one week, on the free plan:

1. **Days 1–2** — Phase 0 in full: both rule files deployed and emulator-tested,
   the three writes folded into one transaction, the Word Match deck, the 8×8 word
   list, the leaver fix, the favicon, the stray `console.log`. The app is live;
   this is the part that is actually urgent, and none of it needs billing.
2. ~~**Day 3** — Phase 1's rules work.~~ **Done**: `database.rules.json` with
   `npm run test:rules` behind it, the score transaction, the `openRooms` index,
   and the turn clock. Note that Phase 0.1 is only half closed — the Realtime
   Database has rules now, Firestore still does not.
3. **Day 4** — Route-level `lazy()` (2.1), then Vitest with tests around
   `cardUtils`, `useCardFlip` and the new rules (2.2). Before the engine
   extraction, so it has a net under it.
4. **Day 5** — Extract `useMatchGame`, fold Word Match into it, make `Card` a real
   button.

The Daily Hand slips to week two, which is the honest cost of doing the rules work
by hand instead of buying a function. It is still the next feature.

And what I would deliberately not do yet: more games, more themes, more decks. The
catalogue is not the constraint — one of the four games has never worked in
multiplayer, and none of them have a reason to be played twice. Fix that first.
