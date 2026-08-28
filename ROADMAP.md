# Roadmap

Where The Memory Parlour stands, and what I would build next — in order.

The design work is done and it is genuinely good: the Parlour theme is coherent,
the reduced-motion handling is thorough, and the app looks like a product rather
than a tutorial. The gap is underneath. The app is deployed publicly with both
databases in test mode, one of the two multiplayer games deals the wrong deck,
and there is no test covering any of it. So the sequencing below is deliberate:
close the holes, make multiplayer trustworthy, then build the reasons to come
back.

---

## Phase 0 — Close the holes

Everything here is a correctness or safety bug in code that is live right now.
None of it is more than a day's work; all of it should ship before any new
feature.

### 0.1 Write security rules — the one that matters

There are no `firestore.rules` or `database.rules.json` in this repo, and
`firebase.json` deploys neither. Both databases are open. Concretely, today:

- anyone can write any score to `leaderboard/{gameType}/scores` — the board is
  decorative, not a record
- anyone can read and write any room in the Realtime Database, including rooms
  they are not in
- anyone can rewrite another player's `users/{uid}` profile and stats

**Do:** add both rule files, wire them into `firebase.json`, and deploy them.
Minimum viable shape — profiles writable only by their owner; `gameHistory`
create-only, with `uid == request.auth.uid`; leaderboard **not client-writable at
all** (see 0.2); rooms readable and writable only by a signed-in player already
in `players/`, with `hostId` immutable after creation.

### 0.2 Move score writing off the client

`saveGameResult` (`src/firebase/firestore.ts:71`) writes history, the leaderboard
row and the user's stats from the browser in three sequential unbatched calls.
Even with rules in place, a client that can write a leaderboard row can write
*any* leaderboard row.

**Do:** let the client write `gameHistory` only. A Cloud Function on that create
derives the leaderboard entry and the profile counters. That makes the board
authoritative, makes the three writes atomic, and is a precondition for anything
competitive — daily challenges, seasons, prizes.

### 0.3 Word Match multiplayer deals the wrong game

`MultiplayerRoom.handleStart` calls `generateCards(room.difficulty, room.theme)`
(`src/pages/MultiplayerRoom.tsx:33`) regardless of `room.gameType`. A Word Match
room is dealt an emoji or colour deck: the lobby offers the mode, the room says
"Word Match", and the board is Card Flip. Multiplayer for this game has never
actually worked.

**Do:** lift `generateWordCards` out of `WordMatchPage.tsx` into
`src/utils/wordUtils.ts` and pick the generator by `gameType`. This is the single
highest-value-per-hour fix in the list — it doubles the working multiplayer
catalogue in about an hour.

### 0.4 Word Match 8×8 is a lie

`generateWordCards` reads `difficulty === "4x4" ? 8 : difficulty === "6x6" ? 18 : 18`
(`src/pages/WordMatchPage.tsx:42`), and `WORD_PAIRS` only holds enough entries for
18. Choosing "the long night" silently deals the 6×6 board.

**Do:** either extend the word list to 32 pairs, or hide 8×8 for Word Match in the
lobby. I would extend the list — the difficulty note promises something the game
should deliver.

### 0.5 A leaver freezes the room forever

`leaveRoom` (`src/firebase/realtime.ts:106`) removes the player and nothing else.
If it was their turn, `gameState.currentTurn` now points at a uid with no player,
`isMyTurn` is false for everyone, and the room is dead — no timeout, no host
override, no way out but abandoning it. There is no `onDisconnect` handler
anywhere in the codebase, so closing a tab does not even trigger the leave path.

**Do:** register `onDisconnect().remove()` on the player node when joining; on
leave or disconnect, if the departing player held the turn, pass it to the next
player. Add the host control the UI already implies — reclaim or close the table.

### 0.6 Housekeeping

- Remove `console.log("game state", gs)` (`src/hooks/useMultiplayer.ts:36`) — it
  logs the full board, every flip, in production.
- `index.html` still ships `<link rel="icon" href="/vite.svg" />`. The app has a
  strong visual identity and a vermilion crosshatch card back that would make a
  perfect favicon.

---

## Phase 1 — Make the table trustworthy

Multiplayer currently works because everyone is polite. Every rule is enforced in
the browser, so any client can flip on another player's turn, award itself points,
or resolve a turn however it likes.

**1.1 Make the score write atomic.** `incrementPlayerScore`
(`src/firebase/realtime.ts:174`) is a `get` followed by a `set`. Two writes that
interleave lose a point. Use `runTransaction` — a five-line change, and there is
no transaction anywhere in the codebase today.

**1.2 Move turn resolution server-side.** The 900ms `setTimeout` in
`useMultiplayer` decides matches and hands out the next turn from the client. It
should be a Cloud Function triggered on the second flip, or at minimum a
rules-enforced write where `currentTurn == auth.uid` gates every path. Rules alone
get most of the way there and cost far less than a function.

**1.3 Add a turn clock.** `turnStartedAt` is already written on every resolve and
never read. Use it: show the countdown the field is there for, and pass the turn
when it expires. This is also the belt-and-braces fix for 0.5.

**1.4 Stop scanning the whole database for a quick match.** `quickMatch`
(`src/firebase/realtime.ts:66`) downloads **every room** and filters in the
browser. It is O(all rooms ever created) on each press, and it only works today
because rooms are world-readable — the rules in 0.1 will break it. Index open
rooms under `openRooms/{gameType}_{difficulty}_{theme}/{roomId}` and query that.

**1.5 Expire abandoned rooms.** `cleanupRoom` exists but is only called when a
host explicitly closes a table. Every quick match that never filled is still in
the database. A scheduled function deleting rooms older than a few hours, or a
TTL, keeps the tree from growing forever.

---

## Phase 2 — Foundations worth having before more features

**2.1 Tests.** There is no test runner. Best return per line of setup:
`calculateScore` and `generateCards` (pure, and the deck generator has already
shipped one silent off-by-one in its Word Match twin), `useCardFlip` behaviour,
and multiplayer turn resolution once it moves out of the component. Vitest plus
Testing Library, and `npm test` in CI beside the lint step that already passes
clean.

**2.2 Extract one game engine.** `WordMatchPage.tsx` reimplements `useCardFlip`
almost line for line — its own flip state, lock, timer, moves and completion
handling — and the two have already drifted (different scoring, different
difficulty handling, the 8×8 bug in one and not the other). One
`useMatchGame({ deck, scoring })` hook, with Card Flip and Word Match passing
different deck generators, removes the drift and is what makes 0.3 easy.

**2.3 Make the board keyboard-accessible.** `Card` is a `<div onClick>` with no
`role`, no `tabIndex`, no `aria-label` (`src/components/game/Card.tsx:31`). The
card games cannot be played without a mouse and are opaque to a screen reader —
conspicuous, because the rest of the app is careful: `aria-pressed` on every
lobby option, labelled lives counters, `useReducedMotion` throughout. Make it a
real `<button>` with an accessible name ("Card 7, face down"), and announce
matches via a live region. Half a day, and it brings the weakest part of the app
up to the standard the rest already sets.

**2.4 Split the bundle.** The build ships ~915KB of JavaScript, 478KB of it
`firebase-vendor`, with no `lazy()` or `Suspense` anywhere. Route-level code
splitting keeps the Realtime Database and the multiplayer pages out of the
first-load path for a visitor who just wants to try Pattern Memory — a large win
for a game people arrive at from a link.

**2.5 Add an error boundary.** Any throw inside a game unmounts the whole app to
a blank page. One boundary at the route level, in the Parlour's voice, is an
hour's work.

---

## Phase 3 — Reasons to come back

The app has four games, a leaderboard and a profile — everything needed to play
once. Nothing yet gives a reason to return tomorrow. In order of value per effort:

**3.1 The Daily Hand.** One seeded deck per day, the same for everyone, one
scored attempt. It costs almost nothing — seed the existing shuffle by date — and
it is the standard retention mechanic for this genre because it manufactures a
fair comparison. It also fits the theme better than anything else here: the house
deals one hand a day.

**3.2 Time-boxed leaderboards.** `getLeaderboard` is all-time only, so a player
arriving next month can never appear on it, and one strong player can occupy
every visible row — the query does not deduplicate by user. Add daily and weekly
boards, and keep one row per player. This is what makes 3.1 worth playing.

**3.3 A shareable result.** A game with this visual identity and no share path is
leaving its cheapest growth channel unused. Render the finished hand as a small
card — moves, time, the day's seed — that a player can post. Wordle's
spoiler-free grid is the model.

**3.4 Streaks and honours on the profile.** The profile already computes win rate
and best scores; it has room for a streak counter and a small set of earned
marks — first perfect hand, ten days running, cleared the long night. Cheap to
add on top of counters that already exist.

**3.5 Sound.** Four memory games with no audio. A short set of letterpress-ish
cues — the card, the match, the miss — with a persisted mute toggle, adds a
surprising amount of feel for a day's work.

---

## Phase 4 — The bigger bets

Worth a prototype once the foundation holds, roughly in order of how much I
believe in them:

- **Race mode for the solo games.** Number Sequence and Pattern Memory are
  single-player only, and both are naturally competitive: same seed, same start,
  live progress bars, first to fail drops out. It reuses the room infrastructure
  Phase 1 will have hardened, and doubles the multiplayer catalogue again.
- **Asynchronous challenges.** Send a friend a link to the exact hand you just
  played. No lobby, no waiting, no scheduling — the lowest-friction multiplayer
  there is, and it turns 3.3's share card into an invitation.
- **A fifth game with a different shape.** All four current games are recall
  tests. Something with working-memory pressure — an n-back, or a "what changed"
  spot-the-difference — would broaden the appeal without breaking the theme.
- **Difficulty that adapts.** Three fixed sizes are coarse. Tuning the board to a
  player's measured accuracy would keep the middle of the skill curve engaged,
  and the data to do it is already in `gameHistory`.
- **Install as an app.** No manifest, no service worker. These games are the
  archetypal phone-in-a-queue activity, and all of them except multiplayer work
  offline in principle.

---

## What I would do first

If I had one week:

1. **Days 1–2** — Phase 0 in full. Rules, the Cloud Function for scores, the Word
   Match deck, the leaver fix. The app is live; this is the part that is actually
   urgent.
2. **Day 3** — Vitest, tests around `cardUtils` and `useCardFlip`, `npm test` in
   CI. Before 2.2, so the engine extraction has a net under it.
3. **Day 4** — Extract `useMatchGame`, fold Word Match into it, make `Card` a
   real button.
4. **Day 5** — The Daily Hand, plus the daily leaderboard it needs.

And what I would deliberately not do yet: more games, more themes, more decks.
The catalogue is not the constraint — one of the four games has never worked in
multiplayer, and none of them have a reason to be played twice. Fix that first.
