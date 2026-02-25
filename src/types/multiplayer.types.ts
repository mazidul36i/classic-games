import type { CardItem, GameType, Difficulty, CardTheme } from './game.types';

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomPlayer {
  uid: string;
  displayName: string;
  photoURL?: string;
  score: number;
  isReady: boolean;
  isCurrentTurn: boolean;
  joinedAt: number;
}

export interface Room {
  id: string;
  hostId: string;
  status: RoomStatus;
  gameType: GameType;
  difficulty: Difficulty;
  theme: CardTheme;
  players: Record<string, RoomPlayer>;
  gameState?: MultiplayerGameState;
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
