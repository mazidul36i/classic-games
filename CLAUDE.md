# CLAUDE.md

Notes for Claude Code working in this repo. `README.md` covers the product (games,
scoring, data model, setup) — this file only covers what is not obvious from the
code or the README.

## What this is

**The Memory Parlour** — a React 19 + TypeScript + Vite 7 memory-games SPA on
Firebase, deployed to https://classicplay.web.app and custom domain https://classicplay.mazidul.com. Four games, solo and turn-based
multiplayer. Package name is `memory-games`; the repo and hosting site are
`classic-games` / `classicplay`.

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
- **Open bug:** when a turn hits the 45s limit, `currentTurn` ping-pongs between seats
  forever and makes the table unplayable (`src/hooks/useMultiplayer.ts` expiry effect).
  Documented as `ROADMAP.md` 0.9; it is live in production.
- **A seat is never deleted once a hand is in play** — it is kept and marked
  `connected: false`, because deleting it on disconnect meant a refresh locked the
  player out of their own room for good (`ROADMAP.md` 0.10). Anything that asks "who
  is at this table" has to pick: `seatedOrder` for seats the table is *holding*
  (capacity, who may come back), `activeOrder` for who is actually playing (turn
  order, consensus, ready counts). Using the wrong one is how a dropped tab either
  freezes the table or loses its seat.
- **Nothing may finish a turn from a single tab's memory.** A completed pair is
  resolved off the room subscription by whoever holds the turn, so a tab that goes
  away mid-reveal leaves a pair the *next* tab can finish (`ROADMAP.md` 0.11). Adding
  a `setTimeout` in a click handler to settle game state reintroduces that bug.
- A player's score for the round in play is derivable from the board — matched cards
  carry `flippedBy` — which is why the round reset asks `claimedPairs` rather than
  remembering what the round number used to be. A hook's first snapshot is not
  evidence that anything changed.

## Reference docs in this repo

- `README.md` — product, setup, data model, scoring.
- `ROADMAP.md` — the authoritative plan and bug list, phased and ordered. Check it
  before proposing work; update it when something ships.
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
