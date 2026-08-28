# The Memory Parlour

A memory-games platform built with React, TypeScript and Firebase. Four games of
recollection, played alone or across the table — with real-time multiplayer rooms,
a global leaderboard and per-player stats.

**Live:** [classicplay.web.app](https://classicplay.web.app)

## Games

| Game | Modes | Difficulty | Rules |
|------|-------|-----------|-------|
| **Card Flip Match** | Solo · Multiplayer | 4×4, 6×6, 8×8 | Concentration. Flip two cards a turn and keep the pairs that match. |
| **Word Match** | Solo · Multiplayer | 4×4, 6×6 | The same board, but pairs are related words rather than symbols. |
| **Number Sequence** | Solo | — | A sequence flashes across a 3×3 pad and grows by one each level. Repeat it back. Three lives. |
| **Pattern Memory** | Solo | 4×4 grid | Cells light up, then go dark. Recreate the pattern. Three lives, one returned per level cleared. |

Card Flip and Word Match can be dealt with five decks: **colours, emojis, numbers,
animals** and **symbols**.

## Features

- **Real-time multiplayer** — create a room with a 6-character code, join one, or
  take a quick match into the first open table. Up to 4 players, turn-based over
  Firebase Realtime Database; matching a pair earns another turn.
- **Firebase Auth** — email/password and Google sign-in. Playing requires an account;
  the front page, lobby and leaderboard are open to anyone.
- **Global leaderboard** — per game, filterable by difficulty.
- **Player profile** — games played, win rate, best score per game, and recent history.
- **The Memory Parlour theme** — a letterpress/broadsheet design system built on
  Tailwind v4 tokens, with reduced-motion support throughout.
- **Responsive** — one layout from phone to desktop.

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 19 · TypeScript |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 (`@theme` tokens in `src/index.css`) |
| Animation | Framer Motion |
| Routing | React Router v7 |
| State | Zustand |
| Auth | Firebase Auth (email + Google) |
| Data | Firestore — profiles, history, leaderboard |
| Realtime | Firebase Realtime Database — multiplayer rooms |
| Hosting | Firebase Hosting, deployed by GitHub Actions |

## Getting started

### Prerequisites

- Node 20.19+ (Vite 7)
- A Firebase project with **Authentication** (Email/Password + Google),
  **Firestore** and **Realtime Database** enabled

### Install and run

```bash
git clone https://github.com/mazidul36i/classic-games.git
cd classic-games
npm install
cp .env.example .env    # then fill in the values below
npm run dev
```

The app runs at http://localhost:5173.

### Environment

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
```

## Project structure

```
src/
├── components/
│   ├── game/      Card, GameStats, GameHead, WinModal
│   └── layout/    Layout, Navbar, PageHead
├── firebase/      config, auth, firestore, realtime
├── hooks/         useAuth, useCardFlip, useMultiplayer
├── pages/         Home, Login, Register, GameLobby, the four games,
│                  MultiplayerRoom, Leaderboard, Profile
├── routes/        AppRoutes — routing and the auth guard
├── store/         authStore, gameStore (Zustand)
├── types/         game, user and multiplayer types
├── utils/         cardUtils — deck generation and scoring
└── index.css      design tokens and the Parlour component set
```

Games live at the page level and own their own state; only Card Flip splits its
logic into a hook (`useCardFlip`), which `useMultiplayer` mirrors over the
Realtime Database.

## Data model

**Firestore**

```
users/{uid}                displayName, email, photoURL, createdAt,
                           totalGamesPlayed, totalWins, highScores{gameType: score}
gameHistory/{docId}        uid, displayName, gameType, mode, difficulty,
                           score, moves, timeSeconds, completedAt, isWin
leaderboard/{gameType}/scores/{docId}
                           uid, displayName, score, moves, timeSeconds,
                           difficulty, completedAt
```

**Realtime Database**

```
rooms/{roomId}
  hostId, status (waiting | playing | finished), isPrivate, maxPlayers
  gameType, difficulty, theme, createdAt, startedAt, finishedAt
  players/{uid}    displayName, photoURL, score, isReady, isCurrentTurn, joinedAt
  gameState        cards[], currentTurn, flippedCards[], matchedPairs,
                   totalPairs, turnStartedAt
```

Both databases are currently open in test mode — write security rules before
running this anywhere public.

## Scoring

Card games score on pairs, moves and time:

```
Card Flip   score = pairs × 100 − moves × 2 − seconds × 0.5   (min 10)
Word Match  score = pairs × 100 − moves × 3                   (min 10)
```

The level-based games accumulate as you go: **+10 × level** per sequence cleared,
**+15 × level** per pattern. In multiplayer, each matched pair is one point and
the highest score when the board is cleared takes the table.

## Scripts

```bash
npm run dev      # development server
npm run build    # tsc -b, then a production build to dist/
npm run preview  # serve the production build
npm run lint     # ESLint
```

## Deployment

Pushing to `main` builds and deploys to Firebase Hosting via
`.github/workflows/firebase-hosting-merge.yml`; pull requests get a preview
channel. Firebase credentials come from repository secrets and variables, so no
`.env` is committed.

## License

MIT
