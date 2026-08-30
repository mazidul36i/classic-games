# Multi-round multiplayer — summary

Rooms no longer end after one game. Players can play multiple rounds, switching
game/mode between rounds, without leaving the room or doing a "rematch".

## Data model (`src/types/multiplayer.types.ts`)
- `RoomStatus`: `'waiting' | 'playing' | 'round-finished'` (no more terminal `'finished'` — ending a session is a room delete).
- `Room.round`: increments each round.
- `Room.nextRound`: negotiation node (`gameType`/`difficulty`/`theme` proposal + `readyPlayers` map).
- `RoomPlayer.roundsWon`: persists across rounds; `score` resets each round.

## Rules (`database.rules.json`)
- `status` can go `playing -> round-finished -> playing` (by the last turn holder), not just to a dead end.
- `gameType`/`difficulty`/`theme`/`round` gained their own `.write` grants (previously only ever set once, at creation) and can change on the write that opens a new round.
- `roundsWon`, `score`, `matchedPairs`, `totalPairs` all allow a legitimate reset for a fresh round.
- `nextRound` node: any seated player may propose (full overwrite); you can only set your own `readyPlayers` flag to `true` (never someone else's).
- Ending a session between rounds = deleting the room, allowed for any seated player (not just host).
- Known accepted gap (documented inline): true "everyone agreed to *this* proposal" consensus isn't cheaply expressible for a variable-size room in RTDB rules — enforced client-side, not server-side.

## Client (`src/firebase/realtime.ts`, `src/hooks/useMultiplayer.ts`)
- `resolveFlip` now ends a round into `round-finished` instead of a dead `finished`.
- New: `creditRoundWin`, `resetOwnScoreForNewRound`, `seedNextRoundProposal`, `proposeNextRound`, `setNextRoundReady`, `startNextRound`.
- Hook effects: winner self-credits their round win, each player self-resets their own score on a new round, and the last round's turn-holder auto-deals once both players are ready.
- **Important implementation detail**: dealing the next round is TWO sequential writes, not one atomic multi-path update — the emulator doesn't reliably let a field's validate see a sibling field's brand-new value from the same write, so `status` is flipped to `playing` first, then everything else (round/gameType/difficulty/theme/gameState/nextRound/score) is written after.

## UI (`src/pages/MultiplayerRoom.tsx`)
- Old "game over" modal replaced with an in-page "Round Over" panel: rounds-won tally, game/difficulty/theme picker, live agreement status, auto-deal on agreement, "End the session" always available.

## Verification
- `npm run test:rules` — 62/62 DB rules tests pass (added round-flow coverage), 28/28 Firestore tests pass (untouched).
- `npx tsc -b`, `npm run lint`, `npm run build` — all clean.
- Nothing committed; changes are in the working tree only.
