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
  /** The last round this seat was credited a win for. `roundsWon` only moves
   *  alongside it, and never twice for the same round — a reload of the
   *  round-over screen used to credit the same win again. Absent until the
   *  seat's first win. */
  wonRound?: number;
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
  gameState?: RoomGameState;
  chat?: Record<string, ChatMessage>;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

/** What every game at a table has in common: whose go it is, and since when.
 *  The rest of `gameState` is whatever the game being played needs. */
export interface BoardState {
  currentTurn: string; // uid
  turnStartedAt: number;
}

export interface MultiplayerGameState extends BoardState {
  cards: CardItem[];
  flippedCards: string[]; // card ids currently flipped this turn
  matchedPairs: number;
  totalPairs: number;
}

/**
 * Dots and Boxes. `gridSize` is boxes per side (a 4×4 board is 5×5 dots), and
 * doubles as the marker that tells the two board shapes apart.
 *
 * Both maps are absent until something is in them — the database cannot store
 * an empty object, so a freshly dealt board is `gridSize` and the turn alone.
 * A claimed edge records who drew it, and a closed box who closed it, which is
 * what makes a player's score a fact about the board rather than something a
 * client has to remember. See `utils/dotsUtils`.
 */
export interface DotsGameState extends BoardState {
  gridSize: number;
  edges?: Record<string, string>; // edgeId -> uid
  boxes?: Record<string, string>; // boxId  -> uid
}

/** The two boards share nothing but `BoardState`, so anything reaching past
 *  that has to say which one it is holding: `isCardBoard` in `utils/flipUtils`,
 *  `isDotsBoard` in `utils/dotsUtils`. */
export type RoomGameState = MultiplayerGameState | DotsGameState;

/** A board as it is dealt — everything but the clock, which the server stamps
 *  on the way in. `cardBoard` in `utils/flipUtils` and `emptyDotsBoard` in
 *  `utils/dotsUtils` are the two ways to make one. */
export type NewBoard =
  | Omit<MultiplayerGameState, 'turnStartedAt' | 'flippedCards'>
  | Omit<DotsGameState, 'turnStartedAt'>;

export interface MultiplayerResult {
  roomId: string;
  winnerId: string;
  players: Record<string, { score: number; displayName: string }>;
  finishedAt: number;
}
