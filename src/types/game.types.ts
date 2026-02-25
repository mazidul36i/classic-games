export type GameType = 'card-flip' | 'number-sequence' | 'pattern-memory' | 'word-match';
export type GameMode = 'single' | 'multiplayer';
export type Difficulty = '4x4' | '6x6' | '8x8';
export type CardTheme = 'colors' | 'emojis' | 'numbers' | 'animals' | 'symbols';

export interface CardItem {
  id: string;
  pairId: string;
  value: string;
  color?: string;
  isFlipped: boolean;
  isMatched: boolean;
  flippedBy?: string; // uid
}

export interface GameState {
  cards: CardItem[];
  flippedCards: string[]; // card ids
  matchedPairs: number;
  totalPairs: number;
  moves: number;
  timeElapsed: number;
  isComplete: boolean;
  startedAt: number | null;
}

export interface GameConfig {
  gameType: GameType;
  mode: GameMode;
  difficulty: Difficulty;
  theme: CardTheme;
}

export interface GameResult {
  id?: string;
  uid: string;
  displayName: string;
  gameType: GameType;
  mode: GameMode;
  difficulty: Difficulty;
  score: number;
  moves: number;
  timeSeconds: number;
  completedAt: number;
  isWin: boolean;
}

// Number Sequence Game
export interface SequenceGameState {
  sequence: number[];
  playerSequence: number[];
  currentStep: number;
  level: number;
  isShowingSequence: boolean;
  isPlayerTurn: boolean;
  isComplete: boolean;
  lives: number;
}

// Pattern Memory Game
export interface PatternGameState {
  gridSize: number; // e.g. 4 = 4x4
  pattern: number[]; // active cell indices
  playerPattern: number[];
  level: number;
  isShowingPattern: boolean;
  isPlayerTurn: boolean;
  isComplete: boolean;
}
