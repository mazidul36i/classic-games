import type { CardTheme, Difficulty, GameType } from '../types/game.types';
import type { NewBoard } from '../types/multiplayer.types';
import { cardBoard } from './flipUtils';
import { emptyDotsBoard, gridSizeFor } from './dotsUtils';
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
