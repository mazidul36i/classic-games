# Roadmap

Where The Memory Parlour stands, and what I would build next — in order, and
without turning on billing.

The design work is done and it is genuinely good: the Parlour theme is coherent,
the reduced-motion handling is thorough, and the app looks like a product rather
than a tutorial. The gap used to be underneath: the app was deployed publicly with
its databases in test mode, one of the two multiplayer games dealt the wrong deck,
and nothing was tested. Phases 0 and 1 have since closed that. Both rule files are
written and deployed, 105 rules assertions run against the emulator, the score
write is one transaction, and Word Match multiplayer deals a word deck.

What is left underneath is smaller and different in kind: two writes the client
makes that the rules now refuse, a password field that should never have been
stored, no unit test runner, and a first-load bundle that has grown rather than
shrunk.

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

- **Hosting: ~360 MB of transfer per day.** The current build ships ~959 KB of
  JavaScript, about 295 KB of it over the wire after compression, plus 11 KB of
  CSS and the fonts. That is somewhere near **1,000–1,100 cold visits a day**
  before the site stops serving until tomorrow. Note the direction: the bundle
  has *grown* since this was first written, because chat and multi-round rooms
  both landed in the entry chunk. This is why bundle splitting moved up the list
  — it is no longer a performance nicety, it is how many people can visit.
- **Realtime Database: 100 simultaneous connections.** That is the hard ceiling
  on concurrent multiplayer, and every open tab on a room page holds one.
- **Firestore: 50k reads and 20k writes a day.** Comfortable at this scale, but
  the daily and weekly boards in 3.2 multiply the writes per finished game, so it
  is worth counting before shipping them.

None of these are close today. All of them are reasons Phase 5 exists.

---

## Phase 0 — Close the holes

Everything here is a correctness or safety bug in code that is live right now.
Most of the original list has shipped; two new ones have opened since, and one of
those is a direct consequence of the rules work.

### 0.1 Write security rules — **shipped**

`database.rules.json` and `firestore.rules` both exist, are wired into
`firebase.json`, and are deployed. The deployed Firestore rules match the repo
exactly. Both files carry `npm run test:rules` behind them (see Phase 1), and the
shape is the one this section originally called for: `users/{uid}` owner-write
with `email` and `createdAt` immutable, `gameHistory` create-only and
uid-pinned, `leaderboard` rows named `{uid}_{difficulty}` and validated, rooms
readable only by code and writable only by a seated player.

**One thing to check before the next release:** `database.rules.json` has changed
twice since it was last deployed together with a client — multi-round rooms and
table talk both extended it. Rules and client still ship as one release, not two.

### 0.2 Make the score write atomic and rules-checked — **shipped**

`saveGameResult` (`src/firebase/firestore.ts:60`) folds all three writes —
history, leaderboard row, profile counters — into a single `runTransaction`.
`submitLeaderboardScore` and `updateUserStats` are gone; a tab closed midway now
leaves nothing behind rather than a profile out of step with the history.

The rules half shipped with it: the entry ID must equal
`{request.auth.uid}_{difficulty}`, a standing row may only be replaced by a
strictly higher score, `completedAt == request.time` with a three-second floor
between writes, and `score` is bounded by a per-difficulty ceiling that mirrors
`calculateScore`. A rename on an unbeaten row is the one permitted no-op update.

**Be honest about the ceiling:** this makes the board *tamper-resistant*, not
*authoritative*. Someone with the browser console open can still submit a score
that is merely plausible. That is an acceptable trade for a hobby leaderboard,
and it is the best argument for Phase 5.1 the day it stops being one.

### 0.3 Word Match multiplayer deals the wrong game — **shipped**

`generateWordCards` lives in `src/utils/wordUtils.ts`, and both the room page and
`useMultiplayer` pick the generator by `gameType` (`src/hooks/useMultiplayer.ts:35`).
A Word Match room is dealt a word deck.

### 0.4 Word Match 8×8 is a lie — **shipped**

`WORD_PAIRS` holds 32 entries and `getWordPairsCount` returns 8 / 18 / 32. "The
long night" deals a real 8×8 board.

### 0.5 A leaver freezes the room forever — **shipped**

`leaveRoom` hands the turn on before unseating, a closed tab unseats the player
through `onDisconnect`, and the turn clock (1.3) covers the case where neither
happens. The host control the UI implied now exists inside the live room: a
"close the room" door in the masthead (`src/pages/MultiplayerRoom.tsx:180`),
behind a confirmation, not only on the result panel.

### 0.6 Housekeeping — **shipped**

The `console.log("game state", gs)` is gone from `useMultiplayer`, and
`index.html` ships `/favicon.svg` — the vermilion crosshatch card back — instead
of `vite.svg`.

### 0.7 The leaderboard rules reject the two solo games — **open, and live**

This is the sharp edge of 0.2, and it is the most urgent thing in the document.

`NumberSequencePage` and `PatternMemoryPage` both call `saveGameResult` with
`difficulty: "4x4"` hard-coded and a score that accumulates without bound —
`score + level * 10` and `score + level * 15` respectively. The leaderboard rule
caps a `4x4` entry at **800** and floors it at **10**. So:

- a Number Sequence run that reaches level 13 scores 910 and is **denied**
- a Pattern Memory run that reaches level 10 scores 825 and is **denied**
- either game lost on level 1 scores 0 and is **denied** on the floor

And because all three writes are now one transaction, a rejected leaderboard row
takes the **game history row and the profile counters down with it**. The good
run is the one that vanishes. Atomicity made this failure total rather than
partial, which is the right trade — but only once the bounds are right.

**Do:** the two solo games are not board games and should not be scored on a
board-size ceiling. Give the leaderboard rule a per-game shape rather than a
per-difficulty one — `maxScoreFor(gameType, difficulty)` reading the `gameType`
wildcard the match already binds — and pick honest bounds for a level-based
score. Drop the `>= 10` floor to `>= 0`, since a lost first level is a real
result. Then add the deny cases to `scripts/test-firestore-rules.mjs`, because
this is exactly the class of bug that is silent in the client: the write fails,
nothing on screen says so, and the player's game is simply not recorded.

**Also worth fixing while in there:** neither solo game has a real difficulty, so
they are stamping `4x4` to satisfy a field shaped for the card games. Either give
`GameResult.difficulty` an honest value for them or make the field optional.

### 0.8 The profile stores the account password — **open, and live**

`createUserProfile` (`src/firebase/firestore.ts:32`) writes

```
password: btoa(String.fromCharCode(...new TextEncoder().encode(password)))
```

into `users/{uid}`. That is base64, not a hash — it is the plaintext password with
extra steps, reversible by anyone in one line. The field is declared in
`UserProfile` and **is never read anywhere in the app**. Meanwhile
`firestore.rules` makes every profile readable by any signed-in user, so any
account can read every other account's password, and those passwords are
certainly reused elsewhere.

Firebase Auth already holds the credential; the app never needs it again — the
reset flow in `ad77a10` goes through Auth, not this field.

**Do:** delete the parameter from `createUserProfile`, the field from
`UserProfile`, and the argument from `registerWithEmail`. Then purge the field
from the documents already written — a one-off script against the existing
`users` collection, since rules forbid a client from touching another profile and
nothing on the client would clear its own. Consider tightening the profile read
rule at the same time: the leaderboard already carries the display name, and
there is no screen that needs to read a stranger's whole profile document.

### 0.9 The turn ping-pongs once a clock expires — **open, and live**

Found while verifying 3.5's sound, with two accounts at one table. Once a turn
genuinely runs out the 45s limit, `currentTurn` does not settle on the next
seat — it alternates between the two players continuously, each hop writing
`currentTurn`, `flippedCards` and `turnStartedAt` again. Both tabs became
unresponsive under the write volume, and the table is unplayable from then on.

Nothing about it is new; it was simply inaudible before. The sound cues read
turn changes off the room snapshot, so the loop announced itself as an endless
alternating bell — 453 voices queued on one client before I stopped counting.

**Not** clock skew: `.info/serverTimeOffset` measured **1099 ms** against a
45,000 ms limit, so both clients agree with the server about when a turn is
over. The suspects are the expiry effect at `src/hooks/useMultiplayer.ts:86-99`
— where every seated client races to call `passTurn`, and the comment's claim
that "the first one wins and the rest are refused" is what the observed
behaviour contradicts — together with the `currentTurn` / `turnStartedAt`
`.write` rules in `database.rules.json`, which gate on
`now > turnStartedAt + 45000` and should refuse a second pass landing
immediately after the first.

**Do:** reproduce by seating two accounts and letting one turn expire without
touching the board. Then decide whether the pass should be a transaction on
`gameState` rather than a plain `update`, so two clients cannot both move the
turn from the same starting state. Worth doing before Phase 4's race mode,
which puts far more turn traffic through this same path — and worth doing for
the quota alone, since a looping table writes to Realtime Database forever.

The sound layer already defends itself: announcement cues are throttled to one
per 1200 ms in `src/audio/cues.ts`, so a flapping room can no longer machine-gun
the bell. That is a muffler, not a fix.

### 0.10 Refreshing mid-hand locked you out of your own room — **shipped**

Reported from a real game on a phone: refreshed the page, and from then on
tapping a card did nothing. Reproduced at a two-browser table in about a minute,
and it was worse than "glitched" — it was total.

`joinRoom` armed `onDisconnect(rooms/{id}/players/{uid}).remove()`. A refresh
drops the websocket, so the server deleted the seat. `MultiplayerRoom` only ever
*subscribed* to a room — nothing re-seated you — so you came back to your own
table as a spectator: board visible, `myPlayer` null, every tap dead. And there
was no way back in, because `joinRoom` answers `'in-play'` for any room that is
not `'waiting'`, and the rules refused to re-create a seat in a dealt room. The
lobby's own words for it were "That hand is already under way."

**Fixed** by keeping the seat instead of deleting it. Seats carry `connected`
now: a waiting room still gives the seat up on disconnect (a stranger who opens
a room and closes it should not hold a place), but once cards are down the seat
is kept and only marked away. `activeOrder` in `src/utils/flipUtils.ts` moves
the turn straight past an absent seat, so a player who is gone for good still
costs the table nothing, and one who is merely reloading finds their seat, score
and turn waiting. Needs the rules deployed — `connected` is a new seat field,
deliberately not in the required-children list so seats written before it stay
writable.

One thing this exposed on the way: the round reset was watching `round` change
to know a fresh round had started, which quietly read "the first round number
this hook ever saw" as new. Harmless while a reload also cost you your seat;
once the seat survived it zeroed your score every refresh. It reads the board
now — matched cards record who turned them, so the pairs standing to your name
in the round *currently dealt* are a fact rather than something to remember.

### 0.11 A turn could be abandoned halfway, and nothing would finish it — **shipped**

Found while chasing 0.10, and live in production alongside it. The whole
resolution of a two-card flip — match or miss, the point, the turn, the round —
ran inside a `setTimeout` in the tab that made the second flip. That tab was the
only thing in the system that knew the turn was unfinished. Reload it, or let a
phone discard it in the background, and `flippedCards` stayed at two forever:
the old handler's `flippedCards?.length >= 2` guard then refused every later tap
until the 45s clock passed the turn.

A second way into the same dead end: `flipCard` was a read-then-append with no
check that the card was already in the array, and a card in `flippedCards` is
only drawn face up — the *stored* card still reads `isFlipped: false`. Two taps
of one card inside a single round trip (which on a phone is most double taps)
wrote `[c0, c0]`. A card always matches itself, so that was a free point and a
partner orphaned for the rest of the round — and neither tap believed it had
completed a pair, so nothing resolved it either.

**Fixed** in three parts:

- `flipCard` is a transaction on `flippedCards`, so a duplicate and a third card
  are refused by the write rather than by whatever the tab had in memory.
- Resolution moved out of the click handler and onto the room subscription
  (`useMultiplayer`): whoever holds the turn resolves the pair they can *see*,
  which means the same player's next tab picks it up after a reload. A pair
  where both ids are the same is treated as an ordinary miss, so a board already
  spoiled by the old build heals instead of paying out again.
- The point rides inside `resolvePair`'s single multi-path update with the board
  that earned it. The score rule reads `status` and `currentTurn` off the stored
  room, so both are still what they were when the pair was completed, and the
  whole write is refused together or lands together.

Covered by `scripts/test-flip.mjs` (folded into `npm run test:rules`), which
pins the stuck states the old client could write as well as the recovery out of
them, and checks that the rules still refuse a resolve that pays itself more
than a point or comes from the wrong seat.

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
- rooms may not be listed, only opened by code; `hostId` and `createdAt` are
  immutable after creation
- `createdAt` and `turnStartedAt` are pinned to server time (`newData.val() === now`),
  so the staleness sweep and the turn clock cannot be gamed by a bad clock

What rules still cannot check is whether a claimed match is *real* — the client
computes `cards`, and a rule cannot cheaply compare two card faces. That last mile
is Phase 5.2.

`maxPlayers` is the other thing rules cannot express, because they cannot count
children. It now has a client-side answer rather than none: `joinRoom` verifies
the seat it took and stands the player back up if their `seatedOrder` puts them
past capacity — which also fixes two players clearing the capacity check in the
same instant. A patched client can still seat a fifth player at a four-seat
table; the join is otherwise legal and nothing else breaks.

`npm run test:rules` runs **77 assertions against the Realtime Database rules and
28 against Firestore's** — the deny cases as much as the allow ones. Two emulator
traps are documented in `scripts/test-rules.mjs`, because either one makes the
whole suite vacuously green: an `owner` bearer token bypasses rules, and a
namespace the emulator has no rules for is wide open.

**1.3 The turn clock is real.** `turnStartedAt` was written on every resolve and
never read. It now drives a visible countdown, and once it expires anyone still at
the table may pass the turn — a write the rules permit *only* after the deadline,
so it cannot be used to jump a live turn. Deadlines are server-stamped and the
countdown is drawn against `.info/serverTimeOffset`, so a player whose clock is
wrong still sees the right number.

**1.4 Quick match is a search, not a lookup.** It used to read **every room** and
filter in the browser; the rules in 1.2 forbid that outright. Public rooms now
publish a pointer to `openRooms/{gameType}_{difficulty}_{theme}/{roomId}`, and
matchmaking reads one bucket, capped at eight candidates.

The first version of that read the index once and, finding nothing, opened a
table and sat down at it — so two players pressing the button in the same second
each sat alone at a different table forever. It is now a two-minute search: sweep
the index, open a table so we can be found, watch it for an arrival, keep
sweeping. Which of two simultaneous tables gets abandoned is settled by room code
in `pickOpponentRooms` (`src/utils/matchUtils.ts`), so exactly one player moves
whichever order they arrive in. The lobby shows a live clock, a "stop looking"
control and a timeout notice.

**1.5 Rooms clean up after themselves.** No scheduled function, so cleanup is
opportunistic and comes from four places: `onDisconnect().remove()` on the player
node, so a closed tab empties a seat; deleting the room when the last player
leaves; retracting index pointers that outlived their rooms, on the next quick
match; and a rule letting any signed-in client delete a *waiting* room older than
six hours, which the join path does when it meets one. The last player in a
**private** room also arms `onDisconnect` on the room itself — nothing indexes
private rooms, so nobody else could ever find one to sweep it. A lone searcher's
table and its index pointer go with the tab if it closes, so the next searcher
does not inherit a ghost.

**1.6 Rooms play more than one hand.** Not in the original plan, and it changed
the shape of the room: `RoomStatus` cycles `waiting → playing → round-finished →
playing` instead of ending at a terminal `finished`, `Room.round` counts,
`Room.nextRound` carries a proposal plus a `readyPlayers` map, and
`RoomPlayer.roundsWon` persists while `score` resets each round. Players change
game, size or theme between rounds without leaving the table; ending a session is
a room delete, which any seated player may do. The rules gained the transitions
and the resets. Details and the one accepted gap — true "everyone agreed to
*this* proposal" consensus is not cheaply expressible for a variable-size room,
so it is client-enforced — are in `MULTIPLAYER_ROUNDS.md`.

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

**2.1 Split the bundle.** The build ships ~959 KB of JavaScript across five
chunks — `firebase-vendor` is 491 KB of it, `motion` another 123 KB, and the
entry chunk has grown to 296 KB as chat and multi-round rooms landed — with no
`lazy()` or `Suspense` anywhere. Every visitor downloads the Realtime Database,
the chat panel and both multiplayer pages to play Pattern Memory once.
`vite.config.ts` already splits vendors by library, which is the easy half; the
missing half is route-level `lazy()` in `src/routes/AppRoutes.tsx`, where all
fourteen pages are static imports, so those vendors stay out of the first-load
path.

On Spark this is a capacity question, not just a speed one: first load is the
number that divides into the daily hosting allowance. Cutting it roughly in half
doubles how many people can visit before the site goes dark for the day. This is
the item that has moved backwards since the last revision, and it is the reason
it is now first in the week below.

**2.2 Tests.** There is still no test runner and no `test` script in
`package.json`. What exists is three emulator/integration scripts —
`test:rules`, `test:match`, `test:chat` — which cover the rules well and the
client not at all. Best return per line of setup: `calculateScore` and
`generateCards` (pure, and the deck generator has already shipped one silent
off-by-one in its Word Match twin), `pickOpponentRooms` (already written to be
testable in isolation and currently only exercised by the integration script),
`useCardFlip` behaviour, and multiplayer turn resolution. Vitest plus Testing
Library, `npm test` in CI beside the lint step that already passes clean.

**2.3 Extract one game engine.** `WordMatchPage.tsx` still reimplements
`useCardFlip` almost line for line — its own `flippedIds`, lock, timer, moves and
completion handling, 166 lines against the hook's 123. The deck generator is no
longer duplicated (0.3 moved it out), but the scoring still is, and it has
drifted: `useCardFlip` uses `calculateScore` (`moves * 2 + time * 0.5` penalty),
Word Match computes `totalPairs * 100 - moves * 3` inline with no time penalty at
all — while the game shows a timer. One `useMatchGame({ deck, scoring })` hook,
with Card Flip and Word Match passing different deck generators, removes the
remaining drift and is what keeps 0.3 fixed.

Worth noting the rules now depend on this: `firestore.rules` documents its score
ceiling as mirroring `calculateScore` "and the Word Match twin in
`src/utils/wordUtils.ts`" — but there is no scoring function in `wordUtils.ts`.
The comment describes where the code should be, not where it is.

**2.4 Make the board keyboard-accessible.** `Card` is still a `<div onClick>`
with no `role`, no `tabIndex`, no `aria-label` (`src/components/game/Card.tsx:32`).
The card games cannot be played without a mouse and are opaque to a screen reader
— conspicuous, because the rest of the app is careful: `aria-pressed` on every
lobby option, labelled lives counters, `aria-label` on every icon button in the
room masthead, `useReducedMotion` throughout. Make it a real `<button>` with an
accessible name ("Card 7, face down"), and announce matches via a live region.
Half a day, and it brings the weakest part of the app up to the standard the rest
already sets.

**2.5 Add an error boundary.** There is none — any throw inside a game unmounts
the whole app to a blank page. One boundary at the route level, in the Parlour's
voice, is an hour's work — and more valuable now than when this was written,
because rules enforce writes and permission-denied is a live client-side failure
mode. 0.7 is the proof: a denied write today fails silently with nothing on
screen.

---

## Phase 3 — Reasons to come back

The app has four games, a leaderboard and a profile — everything needed to play
once. Multiplayer now gives a reason to stay at the table (1.6) and something to
say while you're there (3.6). Nothing yet gives a reason to return tomorrow. All
of this is free; 3.1 and 3.2 are noticeably weaker without a server, and I would
ship them anyway.

**3.1 The Daily Hand.** One seeded deck per day, the same for everyone, one scored
attempt. It costs almost nothing — seed the existing shuffle by date — and it is
the standard retention mechanic for this genre because it manufactures a fair
comparison. It also fits the theme better than anything else here: the house deals
one hand a day. Caveat worth accepting up front: with the seed derived on the
client, a curious player can read tomorrow's hand out of the bundle, and "one
attempt" is enforced only by the leaderboard rule from 0.2 that refuses a second
write for the same day. Fine for a friendly board.

**3.2 Time-boxed leaderboards.** `getLeaderboard`
(`src/firebase/firestore.ts:123`) is all-time only, so a player arriving next
month can never appear on it. The one-row-per-player problem is already fixed —
entries are keyed `{uid}_{difficulty}` and the query keeps each player's best — so
what is left is genuinely just the time window: extend the entry ID to
`{uid}_{difficulty}_{YYYY-MM-DD}`, store the day as a field, and query it. This is
what makes 3.1 worth playing. The entry-ID rule in `firestore.rules` is written
against the two-part ID and will need to move with it.

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

**3.4 Streaks and honours on the profile.** The profile computes win rate and best
scores from counters that `saveGameResult` maintains inside its transaction
(`src/firebase/firestore.ts:60`); it has room for a streak counter and a small set
of earned marks — first perfect hand, ten days running, cleared the long night.
Cheap to add on top of counters that already exist, and it folds into that same
transaction rather than adding writes.

**3.5 Sound — shipped.** Sixteen letterpress-ish cues — the card, the pair, the
miss, the knuckle on wood when a life goes — with a mute toggle in the nav that
is remembered on the device. The worry about hosting transfer largely went away:
every cue is *synthesised* in `src/audio/engine.ts` from a filtered noise burst
and an oscillator, so there are **no audio files at all** — the whole feature
costs 2.4 kB gzipped of code and nothing per play, needs no licence, works
offline, and is retuned by editing a number rather than re-recording.
`src/audio/cues.ts` holds the recipes.

The pips in the two sequence games are pitched on a minor pentatonic — sixteen
distinct notes across Pattern Memory's board — so a figure plays back as a
phrase instead of a machine gun, and pitching is by *cell* rather than by
position so a resumed replay is not transposed against what the player just
heard.

The multiplayer table is the subtle part: nothing there is driven by a click,
so the cues are read off transitions between room snapshots — which is also
what keeps the actor and their opponents hearing the same thing at the same
moment, with no second optimistic path to double-fire. Three shapes of the
stored `gameState` had to be respected: `passTurn` clears `flippedCards`
without touching `matchedPairs` (so a clock-out is `pass`, not a spurious
`miss`), `startGame`/`startNextRound` rewrite `gameState` with no
`flippedCards` key at all (so a card turning is a strict *growth* test), and
`startNextRound` writes twice (so a turn moving on is only a turn *taken* when
`round` has not also moved).

Two things worth knowing. Audio is deliberately **not** tied to
`prefers-reduced-motion` — that is a motion preference, and honouring it with
silence would mute someone who only dislikes animation; the nav toggle is the
audio control. And a hidden tab is silent except for the "your turn" bell,
which is the one cue that exists to say you have to do something.

**3.6 Table talk — shipped.** A chat beside the multiplayer board: free text
plus a row of one-tap phrases for when the turn clock is running, a per-device
mute for each seat, and a few lines the table writes itself (who sat down, who
took the round). Messages live under `rooms/{id}/chat`, ride the room
subscription that already exists (no new connection against the ceiling of
100), and leave with the room when it closes, so there is nothing to sweep.
The rules pin every message to a seated author, the name on their seat, the
server's clock and 200 characters — `npm run test:rules` covers the deny
cases. What they cannot do is rate-limit: a per-player "last sent" stamp can't
be checked from a sibling path in the same write, so the one-second cooldown
is client manners only. A patched client can flood a table it is seated at,
and nothing else; that is the honest ceiling, same as `maxPlayers`.

---

## Phase 4 — The bigger bets

Worth a prototype once the foundation holds, roughly in order of how much I
believe in them. All of these still fit inside the free plan.

- **Race mode for the solo games.** Number Sequence and Pattern Memory are
  single-player only, and both are naturally competitive: same seed, same start,
  live progress bars, first to fail drops out. It reuses the room infrastructure
  Phase 1 hardened — including the round cycle from 1.6, which already lets a
  table switch game between hands — and doubles the multiplayer catalogue again.
  Watch the 100-connection ceiling: this is the feature most likely to find it.
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
  the data to do it is already in `gameHistory` — once 0.7 stops throwing some of
  it away.

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
that is hard to forge (0.2) and one that is impossible to forge. It would also
retire the whole class of bug in 0.7, where the client's arithmetic and the
rules' bounds have to be kept in agreement by hand across two files.
*Trigger:* the first forged entry, or the first time a prize, season or public
ranking makes forging worth someone's afternoon.

**5.2 Server-side turn resolution.** A function triggered on the second flip
compares the two card faces, awards the point and hands out the next turn —
closing the one gap rules cannot check in 1.2, where a client claims a match that
never happened. The same function is the natural home for the `maxPlayers` count
and the chat rate limit, both of which are client manners today.
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

The original week is mostly spent: Phase 0's rules, transaction, decks, word
list, leaver fix, favicon and stray log all shipped in `ee7e6e9`, and Phase 1
shipped with them. Multi-round rooms, a real quick-match search, the
forgot-password flow and table talk have landed since.

The next week, on the free plan:

1. **Day 1 — the live bugs, in this order.** 0.7 first: the leaderboard rule
   is currently throwing away finished games in two of the four titles, and every
   day it stays up is data that is gone. Then 0.8 — delete the password field,
   and purge it from the documents already written. Neither is more than a few
   hours, and both are the kind of thing that is embarrassing to find later.
   0.9 is the third, and it wants a day of its own rather than an hour: an
   expired turn currently leaves the table ping-ponging and writing forever,
   which makes a room unplayable and quietly eats the write quota.
2. **Day 2 — route-level `lazy()` (2.1).** The bundle is the one number that has
   moved the wrong way, and it is the ceiling on how many people can visit at all.
   Fourteen static page imports in one router file is an afternoon's work for
   roughly half the first load.
3. **Day 3 — Vitest (2.2),** around `calculateScore`, `generateCards`,
   `pickOpponentRooms` and `useCardFlip`. Before the engine extraction, so it has
   a net under it — and so 0.7's fix has somewhere to grow a regression test that
   is not an emulator run.
4. **Day 4 — extract `useMatchGame` (2.3),** fold Word Match into it and settle
   the scoring drift, then make `Card` a real button (2.4). Add the error
   boundary (2.5) on the way past; it is an hour.
5. **Day 5 — the Daily Hand (3.1).** Which is where this document has wanted to
   be for two revisions now, and it is still the next feature rather than the
   next chore.

And what I would deliberately not do yet: more games, more themes, more decks. The
catalogue is not the constraint — two of the four games currently fail to record a
good run, and none of them have a reason to be played twice. Fix that first.
