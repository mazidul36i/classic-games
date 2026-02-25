# 🧠 MemoryGames

A modern, full-featured **memory games platform** built with React, TypeScript, Firebase, and Tailwind CSS. Play classic memory games solo or challenge friends in real-time multiplayer.

---

## 🎮 Games

| Game | Mode | Description |
|------|------|-------------|
| 🃏 **Card Flip Match** | Single + Multiplayer | Classic concentration — flip cards to find matching pairs by color, emoji, number, animal, or symbol |
| 🔢 **Number Sequence** | Single Player | Watch a growing number sequence flash on screen and repeat it from memory |
| 🔲 **Pattern Memory** | Single Player | Memorize a highlighted grid pattern and recreate it — levels get harder each round |
| 🔤 **Word Match** | Single + Multiplayer | Match synonym/related word pairs hidden under cards |

---

## ✨ Features

- **3D Card Flip Animations** — smooth CSS perspective + Framer Motion transitions
- **Multiple Card Themes** — Colors, Emojis, Numbers, Animals, Symbols
- **3 Difficulty Levels** — 4×4 (8 pairs), 6×6 (18 pairs), 8×8 (32 pairs)
- **Real-time Multiplayer** — create or join rooms with a 6-character code, up to 4 players
- **Turn-based Multiplayer** — synchronized board via Firebase Realtime Database; match a pair = extra turn
- **Firebase Auth** — Email/Password and Google Sign-In
- **Global Leaderboard** — per-game, filterable by difficulty
- **Player Profile** — stats dashboard, win rate, best scores, game history
- **Responsive Design** — mobile-first, works on all screen sizes
- **Dark Theme** — deep slate + indigo color palette

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| Routing | React Router v7 |
| State Management | Zustand |
| Authentication | Firebase Auth (Email + Google) |
| Database | Firebase Firestore (profiles, history, leaderboard) |
| Realtime | Firebase Realtime Database (multiplayer rooms) |

---

## 📁 Project Structure

```
src/
├── components/
│   ├── game/          # Card, GameStats, WinModal
│   └── layout/        # Navbar, Layout
├── firebase/
│   ├── config.ts      # Firebase initialization
│   ├── auth.ts        # Auth helpers
│   ├── firestore.ts   # Firestore CRUD
│   └── realtime.ts    # Realtime DB (multiplayer)
├── games/
│   └── card-flip/     # CardFlipGame component
├── hooks/
│   ├── useAuth.ts     # Auth state hook
│   ├── useCardFlip.ts # Card flip game logic
│   └── useMultiplayer.ts # Multiplayer sync hook
├── pages/
│   ├── Home.tsx
│   ├── Login.tsx / Register.tsx
│   ├── GameLobby.tsx
│   ├── CardFlipPage.tsx
│   ├── NumberSequencePage.tsx
│   ├── PatternMemoryPage.tsx
│   ├── WordMatchPage.tsx
│   ├── MultiplayerRoom.tsx
│   ├── Leaderboard.tsx
│   └── Profile.tsx
├── routes/
│   └── AppRoutes.tsx  # All routes + protected routes
├── store/
│   ├── authStore.ts   # Zustand auth store
│   └── gameStore.ts   # Zustand game store
├── types/
│   ├── game.types.ts
│   ├── user.types.ts
│   └── multiplayer.types.ts
└── utils/
    └── cardUtils.ts   # Card generation, scoring
```

---

## 🚀 Getting Started

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd memory-games
npm install
```

### 2. Configure Firebase

Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com) and enable:
- **Authentication** → Email/Password + Google providers
- **Firestore Database** → Start in test mode
- **Realtime Database** → Start in test mode

Copy the environment file and fill in your credentials:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production

```bash
npm run build
npm run preview
```

---

## 🔥 Firebase Data Structure

### Firestore

```
users/{uid}
  displayName, email, photoURL, createdAt
  totalGamesPlayed, totalWins
  highScores: { "card-flip": 750, "word-match": 420, ... }

gameHistory/{docId}
  uid, displayName, gameType, mode, difficulty
  score, moves, timeSeconds, completedAt, isWin

leaderboard/{gameType}/scores/{docId}
  uid, displayName, score, moves, timeSeconds, difficulty, completedAt
```

### Realtime Database (Multiplayer)

```
rooms/{roomId}
  hostId, status (waiting | playing | finished)
  gameType, difficulty, theme
  createdAt, startedAt, finishedAt
  players/{uid}
    displayName, photoURL, score, isReady, isCurrentTurn, joinedAt
  gameState/
    cards[]         → full card array with flip/match state
    currentTurn     → uid of player whose turn it is
    flippedCards[]  → card ids flipped this turn
    matchedPairs    → count of matched pairs
    totalPairs      → total pairs in game
    turnStartedAt   → timestamp
```

---

## 🎯 Scoring

Scores are calculated based on difficulty, moves, and time:

```
Score = (pairs × 100) - (moves × 2) - (time_seconds × 0.5)
Minimum score: 10 points
```

In multiplayer, each matched pair = **1 point**. The player with the most points when all pairs are found wins.

---

## 🛣️ Routes

| Path | Page | Auth Required |
|------|------|:---:|
| `/` | Home | No |
| `/login` | Login | No |
| `/register` | Register | No |
| `/lobby` | Game Lobby | No |
| `/play/card-flip` | Card Flip Game | No |
| `/play/number-sequence` | Number Sequence | No |
| `/play/pattern-memory` | Pattern Memory | No |
| `/play/word-match` | Word Match | No |
| `/room/:roomId` | Multiplayer Room | ✅ Yes |
| `/leaderboard` | Leaderboard | No |
| `/profile` | Player Profile | ✅ Yes |

---

## 📜 Scripts

```bash
npm run dev      # Start development server
npm run build    # TypeScript check + production build
npm run preview  # Preview production build locally
npm run lint     # Run ESLint
```

---

## 📄 License

MIT — feel free to use, modify, and distribute.
