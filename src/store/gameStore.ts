import { create } from 'zustand';
import type { GameConfig, GameState } from '../types/game.types';

interface GameStore {
  config: GameConfig | null;
  gameState: GameState | null;
  setConfig: (config: GameConfig) => void;
  setGameState: (state: GameState) => void;
  updateGameState: (partial: Partial<GameState>) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  config: null,
  gameState: null,
  setConfig: (config) => set({ config }),
  setGameState: (gameState) => set({ gameState }),
  updateGameState: (partial) =>
    set((s) => ({
      gameState: s.gameState ? { ...s.gameState, ...partial } : null,
    })),
  resetGame: () => set({ gameState: null }),
}));
