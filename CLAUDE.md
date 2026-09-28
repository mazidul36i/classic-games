# CLAUDE.md

Notes for Claude Code working in this repo. `README.md` covers the product (games,
scoring, data model, setup) — this file only covers what is not obvious from the
code or the README.

## What this is

**The Memory Parlour** — a React 19 + TypeScript + Vite 7 games SPA on
Firebase, deployed to https://classicplay.web.app and custom domain https://classicplay.mazidul.com. Five games, solo and turn-based
multiplayer. Four are memory games; Dots and Boxes is multiplayer-only and the
first that is not about recall. Package name is `memory-games`; the repo and
hosting site are `classic-games` / `classicplay`.

## Commands

```bash
npm run dev        # Vite dev server on :5173
npm run build      # tsc -b && vite build -> dist/
npm run lint       # ESLint (flat config, typescript-eslint + react-hooks)
npm run test:rules # the real test suite: both rule files + the flip/seat tests
npm run test:match # matchmaking script (needs emulators already running)
npm run test:chat  # chat script (needs emulators already running)
```

There is **no unit test runner yet** (Vitest is planned in `ROADMAP.md` 2.2). Before
calling a change done, run `npx tsc -b`, `npm run lint`, and — if rules, realtime, or
firestore code moved — `npm run test:rules`.

### Testing multiplayer locally

A room needs two players, so multiplayer is tested across **two dev servers on ports
5173 and 5174**, each already signed in as a different user. Sit one player at each
port and drive them as the two seats at the table.

If either port is not already serving, start it in the background — `npm run dev` takes
5173, and a second `npm run dev` picks up 5174 on its own. Leave both running for the
session rather than restarting between checks.

Those servers talk to the **live** project, so a test table is a real room in the
production database and a rules change cannot be tried without deploying it first.
For anything touching `database.rules.json`, point the app at the emulators instead:

```bash
firebase emulators:start --only database,firestore,auth --project gs-gameplay
VITE_USE_EMULATORS=true npx vite --port 5175 --strictPort   # and again on 5176
```

Start the emulators with the project's **own** id, not a demo one: the RTDB emulator
serves any namespace and one it has no rules for is wide open, so a mismatched id
tests nothing. Confirm before trusting a run — a signed-out read of
`http://127.0.0.1:9000/rooms/X.json?ns=gs-gameplay-default-rtdb` must come back 401.
Register throwaway players through the app's own `/register`; the Auth emulator
starts empty.

## Architecture in one screen

- `src/pages/` — games own their own state at the page level. Only Card Flip splits
  logic into a hook (`useCardFlip`); `useMultiplayer` mirrors that same logic over the
  Realtime Database.
- `src/firebase/` — `config` (env-driven), `auth`, `firestore` (profiles, history,
  leaderboard), `realtime` (rooms). All Firebase access goes through these four files;
  do not call the SDK directly from components.
- `src/hooks/` — `useMultiplayer` and `useQuickMatch` are the two heaviest files in the
  project and the most connected nodes in the graph. Change them carefully.
- `src/store/` — Zustand: `authStore`, `gameStore`, `soundStore`.
- `src/audio/` — `engine.ts` (`play()`, `installUnlock()` wired from `App.tsx`) and
  `cues.ts`. Audio must stay behind the unlock gate and the sound toggle.
- `src/routes/AppRoutes.tsx` — routing plus the auth guard. Fourteen static page
  imports; route-level `lazy()` is a known pending change.
- Styling: **Tailwind v4** with `@theme` tokens in `src/index.css` (paper/ink/vermilion/
  felt/brass, five display fonts). Use the tokens and the `.p-*` Parlour component
  classes rather than raw colours. Reduced-motion support is thorough — keep it that way.

## Hard constraints

- **Free (Spark) plan only.** No Cloud Functions, no scheduled jobs, no TTL policies,
  no Cloud Storage. Security rules are the only server-side enforcement point, so
  anything that must be trusted belongs in `database.rules.json` / `firestore.rules`.
- **Bundle size is a real ceiling**, not a nicety — Hosting transfer caps daily visits.
  Adding to the entry chunk has a cost; see `ROADMAP.md` "Ground rules".
- Never commit `.env`. Deploy credentials live in GitHub repository secrets; pushing to
  `main` deploys via `.github/workflows/firebase-hosting-merge.yml`, PRs get a preview
  channel.

## Gotchas

- `scripts/test-rules.mjs` explains two ways emulator rule tests go silently vacuous
  (owner bearer token bypasses rules; a wrong namespace is wide open). Read its header
  before touching it. If a rules change comes back all green, confirm a case you expect
  to fail still fails.
- `npm run test:rules` can leave an orphan `java` process holding port 9000. Kill it
  before re-running.
- Dealing the next multiplayer round is **two sequential writes, not one atomic
  multi-path update** — the emulator won't reliably let a field's `validate` see a
  sibling's brand-new value from the same write. See `MULTIPLAYER_ROUNDS.md`.
- **The expiry effect must never pass its own turn, and a tab gets at most one pass
  attempt per turn length** (`performance.now()`). The rules time-gate everyone except
  the holder, and the SDK's optimistic writes carry an *estimated* server time, so
  without these guards a tab that misjudges the clock passes nonstop. Reproducing it
  needs a skewed clock; two honest SDK clients never loop. — `FIX_LOG.md` 2026-09-28
- **"Already done for this round" must be stored, not kept in a ref.** Refs reset on
  reload. `wonRound` on the seat guards `roundsWon` (and the rules enforce it), and
  `localStorage` guards the Dots leaderboard save. — `FIX_LOG.md` 2026-09-28
- The first write of a next-round deal also restarts `gameState/turnStartedAt`, and the
  expiry effect ignores a cleared board (`isBoardCleared`). Otherwise the other seats
  pass the turn away from the dealer between the two writes.
- **Firestore composite indexes live in `firestore.indexes.json`**, and CI deploys
  Hosting only, so run `firebase deploy --only firestore:indexes` (and the rules) by hand.
  A missing index throws `failed-precondition`, which a bare `catch` turns into an empty
  list. That's how profile history sat empty. — `FIX_LOG.md` 2026-09-28
- The profile's `password` field is **intentional** (owner's decision). Do not remove
  it, even though `ROADMAP.md` 0.8 describes it as a bug.
- **A seat is never deleted once a hand is in play** — it is kept and marked
  `connected: false`, because deleting it on disconnect meant a refresh locked the
  player out of their own room for good. Anything that asks "who is at this table"
  has to pick: `seatedOrder` for seats the table is *holding* (capacity, who may come
  back), `activeOrder` for who is actually playing (turn order, consensus, ready
  counts). Using the wrong one is how a dropped tab either freezes the table or loses
  its seat. — `FIX_LOG.md` 2026-09-08, `ROADMAP.md` 0.10
- **Nothing may finish a turn from a single tab's memory.** A completed pair is
  resolved off the room subscription by whoever holds the turn, so a tab that goes
  away mid-reveal leaves a pair the *next* tab can finish. Adding a `setTimeout` in a
  click handler to settle game state reintroduces that bug.
  — `FIX_LOG.md` 2026-09-08, `ROADMAP.md` 0.11
- A player's score for the round in play is derivable from the board — matched cards
  carry `flippedBy` — which is why the round reset asks `claimedPairs` rather than
  remembering what the round number used to be. A hook's first snapshot is not
  evidence that anything changed. — `FIX_LOG.md` 2026-09-08
- **`gameState` holds two shapes now**, a deck and a Dots and Boxes grid, told apart
  by shape (`isCardBoard` in `flipUtils`, `isDotsBoard` in `dotsUtils`) and never by
  reading the room's `gameType` — dealing a round writes `gameType` and `gameState`
  together, and a rule cannot see a sibling's brand-new value. The rules' `gameState`
  validate accepts either shape for the same reason.
- **Dots and Boxes keeps no score on the seat.** One line can close two boxes, and the
  `score` rule only ever allows +1; the `boxes` map already records who closed what, so
  the count is derived (`boxCounts`). `players/$uid/score` stays 0 in those rooms, and
  a level board credits nobody, because `roundsWon` is a claim only its own player may
  make. Anything reading a seat's standing has to ask which game it is — `scoreOf` in
  `MultiplayerRoom.tsx`.
- **Dots and Boxes writes its own leaderboard rows**, one per player per round, from
  `useMultiplayer.ts`'s `round-finished` effects — there is no solo mode to drive
  `saveGameResult` the way the other four games do. `score` is boxes closed that round
  and `moves` is lines drawn, not points or a level; `firestore.rules`' `maxScoreFor`/
  `maxMoves` cap both to that board's box and edge counts. See `FIX_LOG.md` 2026-09-15.
- A dots move has no pause in the middle, so unlike a flip there is no half-finished
  turn to recover: the line, the boxes it closed and the turn go in **one** `update()`,
  the same shape as `resolvePair`. Do not split it.
- **Both `edges` and `boxes` are absent until something is in them** — the database
  cannot store an empty object, so neither is in the rules' required-children list and
  every reader defaults them. A freshly dealt board is `gridSize` and the turn alone.
- `difficulty` doubles as the dots board size (`gridSizeFor`): 4×4/6×6/8×8 boxes. That
  is what lets one room, one matchmaking bucket and one next-round proposal carry
  either game. Games with no deck are bucketed under a fixed `theme` (`tableTheme` in
  `GameLobby.tsx`) so two players who never saw the deck picker can still find each
  other.
- **Dots and Boxes seats two to four.** A seat's identity is its **suit**, not its
  initial — four at a table makes initials collide (two players called Alice and Anna
  would both write "A") — and suit, ink and turn order all come from the same place,
  `seatedOrder`, so a seat plate and a box on the board cannot disagree. `seatSuitAt` /
  `seatInkAt` / `seatIndexOf` in `dotsUtils`, `.p-ink-1..4` in `index.css`. The four
  inks have to read on the dark baize *and* on the parchment seat plates, so all four
  are mid-tone — a cream or a near-black vanishes on one ground or the other.
- **A room in play refuses new seats**, so a table whose size the host chose must not be
  dealt early or it locks out the people it was opened for: `seatsNeeded` in
  `MultiplayerRoom.tsx` requires a *full* table for dots, while the card games keep the
  old "any two who are ready" rule. Quick match now waits for the table to fill rather
  than for one opponent, which is why `bucketKey` carries the seat count
  (`gameType_difficulty_theme_seats`) — someone who asked for four must not be seated at
  a table that closes at two.
- The quick-match teardown **stands up rather than closes the room** (`leaveRoom`, which
  closes it behind the last player out). A table waiting on its third player already has
  a second one sitting at it, and closing it would take their game with it. For the same
  reason the search clock only runs while you are still sitting alone.
- Driving the app with the Chrome tools: a **hidden** browser window pauses rAF and
  throttles timers, so framer-motion entry animations never run (panels stay at
  `opacity: 0`) and coordinate clicks miss. Check `document.visibilityState` before
  believing a screenshot; drive clicks through `javascript_tool` (`el.click()`) and
  inject `*{opacity:1!important;transform:none!important}` to see the page. Note also
  that setting an input's value without dispatching a real `input` event does not reach
  React — type into it instead.

## Recording a fix

**Every bug investigated and resolved gets a short entry in `FIX_LOG.md`**, newest
first, under `## YYYY-MM-DD — one-line title`, with the commit and files on the next
line. Keep it to a screen — a sentence or two each of:

- **Issue** — the symptom as reported.
- **RCA** — what it actually was, and where.
- **Fix** — what changed, and why that shape if it isn't obvious.
- **Don't undo** — the invariants the fix rests on, as things not to do.
- **Verified** — what was run.
- **Left open** — anything deliberately not fixed.

Put the one-line version of any new invariant under **Gotchas** above and link the
entry; the log holds the reasoning so the Gotchas line can stay one line.

**Before changing an area, skim the entries naming it** — each lists its files up
top. Separate from `ROADMAP.md`: the roadmap is the plan, the log is what broke.
Link between them rather than restating either.

## Reference docs in this repo

- `README.md` — product, setup, data model, scoring.
- `ROADMAP.md` — the authoritative plan and bug list, phased and ordered. Check it
  before proposing work; update it when something ships.
- `FIX_LOG.md` — what has broken, the RCA, and what each fix depends on. Read the
  entries covering whatever you are about to change; add one whenever you resolve
  something. See "Recording a fix" above.
- `MULTIPLAYER_ROUNDS.md` — multi-round room design and its accepted rule gaps.
- `graphify-out/` — knowledge graph of the repo. `graphify query "<question>"` answers
  structural questions without re-reading files; `GRAPH_REPORT.md` has the community map.

---

## For future Claude sessions

Treat this file as living. **Append or edit a line here whenever you learn something a
future session would otherwise have to rediscover** — a non-obvious invariant, a command
that must be run in a particular way, a trap that cost you a debugging cycle, or a
convention the code implies but never states. Keep entries short and factual, put them
under the section they belong to, and delete anything that stops being true. Do not
duplicate what `README.md` or `ROADMAP.md` already says — link to it instead.

That applies doubly after a debugging session: the one-line lesson belongs here, the
full account belongs in `FIX_LOG.md`, and neither is finished without the other. See
"Recording a fix".
