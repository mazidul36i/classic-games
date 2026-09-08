import type { CardItem, GameType, Difficulty, CardTheme } from './game.types';

// There is no terminal 'finished' status: ending a session for good means
// deleting the room (see `closeRoom`), not a status value to render around.
// 'round-finished' is the only post-round state, and it stays playable.
export type RoomStatus = 'waiting' | 'playing' | 'round-finished';

export interface RoomPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  score: number;
  roundsWon: number;
  isReady: boolean;
  joinedAt: number;
  /** Whether the tab holding this seat is currently connected. Once a hand is
   *  in play a seat is kept when its player drops — a refresh is a two-second
   *  gap, and it used to cost them the seat entirely — and turn order skips
   *  seats that are away. Optional: seats written before this existed have no
   *  flag, and are read as present. */
  connected?: boolean;
}

/** The between-rounds negotiation: whatever the table is proposing to play next,
 *  and who at the table has agreed to it. Only present while `status` is
 *  'round-finished'; cleared the moment the next round is dealt. */
export interface NextRoundProposal {
  gameType: GameType;
  difficulty: Difficulty;
  theme: CardTheme;
  readyPlayers: Record<string, boolean>;
}

/** One line of table talk, as stored under `rooms/{id}/chat/{pushId}`. Written
 *  once and never edited; `sentAt` is server-stamped, so every client agrees
 *  on the order. `displayName` is a snapshot — the author may have left the
 *  table by the time someone scrolls back. */
export interface ChatMessage {
  uid: string;
  displayName: string;
  text: string;
  sentAt: number;
}

export interface Room {
  id: string;
  hostId: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: RoomStatus;
  gameType: GameType;
  difficulty: Difficulty;
  theme: CardTheme;
  round: number;
  nextRound?: NextRoundProposal | null;
  players: Record<string, RoomPlayer>;
  gameState?: MultiplayerGameState;
  chat?: Record<string, ChatMessage>;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface MultiplayerGameState {
  cards: CardItem[];
  currentTurn: string; // uid
  flippedCards: string[]; // card ids currently flipped this turn
  matchedPairs: number;
  totalPairs: number;
  turnStartedAt: number;
}

export interface MultiplayerResult {
  roomId: string;
  winnerId: string;
  players: Record<string, { score: number; displayName: string }>;
  finishedAt: number;
}
