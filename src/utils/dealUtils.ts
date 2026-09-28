import type { CardTheme, Difficulty, GameType } from '../types/game.types';
import type { NewBoard, RoomGameState } from '../types/multiplayer.types';
import { cardBoard, isCardBoard } from './flipUtils';
import { emptyDotsBoard, gridSizeFor, isDotsBoard, totalBoxes } from './dotsUtils';
import { generateCards } from './cardUtils';
import { generateWordCards } from './wordUtils';

/**
 * The board a round is played on — the first hand of a room, and every round
 * after it, so the two never disagree about what "the agreed-on game" means.
 *
 * Dots and Boxes reads the room's difficulty as the size of the grid. It is the
 * same "length of hand" setting the card games spend on a bigger deck, spent
 * here on a bigger board, which is what lets one room, one matchmaking bucket
 * and one next-round proposal carry either game without a field of their own.
 */
export const dealBoard = (
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme,
  firstPlayerUid: string
): NewBoard =>
  gameType === 'dots-and-boxes'
    ? emptyDotsBoard(gridSizeFor(difficulty), firstPlayerUid)
    : cardBoard(
        gameType === 'word-match'
          ? generateWordCards(difficulty)
          : generateCards(difficulty, theme),
        firstPlayerUid
      );

/**
 * Whether there is nothing left to play on this board — every pair taken, or
 * every box closed.
 *
 * Worth asking because `status` can say 'playing' over a finished board: the
 * next round is dealt in two writes (see `startNextRound`), and between them
 * the room is back in play with the last round's board still on it. There is
 * no turn to take on that board, so there is no turn to run out of either.
 */
export const isBoardCleared = (gs: RoomGameState | null | undefined): boolean => {
  if (isCardBoard(gs)) return gs.totalPairs > 0 && gs.matchedPairs >= gs.totalPairs;
  if (isDotsBoard(gs)) return Object.keys(gs.boxes ?? {}).length >= totalBoxes(gs.gridSize);
  return false;
};
