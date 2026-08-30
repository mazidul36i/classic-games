import type { CardItem, Difficulty } from '../types/game.types';

// Word pairs for matching (word → related word / synonym / antonym)
const WORD_PAIRS: [string, string][] = [
  ['Happy', 'Joyful'], ['Cold', 'Frigid'], ['Big', 'Large'],
  ['Fast', 'Quick'], ['Smart', 'Clever'], ['Brave', 'Bold'],
  ['Calm', 'Peaceful'], ['Dark', 'Dim'], ['Hot', 'Warm'],
  ['Small', 'Tiny'], ['Old', 'Ancient'], ['New', 'Fresh'],
  ['Kind', 'Gentle'], ['Loud', 'Noisy'], ['Strong', 'Powerful'],
  ['Rich', 'Wealthy'], ['Poor', 'Needy'], ['Love', 'Adore'],
  ['Sad', 'Gloomy'], ['Angry', 'Furious'], ['Weak', 'Feeble'],
  ['Wise', 'Sage'], ['Funny', 'Hilarious'], ['Tired', 'Weary'],
  ['Clean', 'Spotless'], ['Sharp', 'Keen'], ['Soft', 'Tender'],
  ['Bright', 'Radiant'], ['Quiet', 'Silent'], ['Tall', 'Towering'],
  ['Deep', 'Profound'], ['Simple', 'Plain'],
];

export const getWordPairsCount = (difficulty: Difficulty): number => {
  switch (difficulty) {
    case '4x4': return 8;
    case '6x6': return 18;
    case '8x8': return 32;
    default: return 8;
  }
};

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Word Match's deck: pairs of related words rather than matching emoji/colour
 *  faces, but shaped as `CardItem` so it can be dealt through the same
 *  multiplayer plumbing (`Card.tsx` renders `value`) as `generateCards`. */
export const generateWordCards = (difficulty: Difficulty): CardItem[] => {
  const count = getWordPairsCount(difficulty);
  const pairs = WORD_PAIRS.slice(0, count);
  const cards: CardItem[] = [];
  pairs.forEach(([a, b], i) => {
    const pairId = `pair-${i}`;
    cards.push({ id: `${pairId}-a`, pairId, value: a, isFlipped: false, isMatched: false });
    cards.push({ id: `${pairId}-b`, pairId, value: b, isFlipped: false, isMatched: false });
  });
  return shuffle(cards);
};
