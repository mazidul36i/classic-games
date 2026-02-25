import type { CardItem, Difficulty, CardTheme } from '../types/game.types';

const EMOJI_PAIRS: string[] = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
  '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
  '🦆', '🦅', '🦉', '🦋', '🐛', '🐝', '🦄', '🐲',
  '🌸', '🌻', '🍀', '🍁', '🍄', '🌈', '⭐', '🌙',
];

const COLOR_PAIRS: { value: string; color: string }[] = [
  { value: 'Red', color: '#ef4444' },
  { value: 'Blue', color: '#3b82f6' },
  { value: 'Green', color: '#22c55e' },
  { value: 'Yellow', color: '#eab308' },
  { value: 'Purple', color: '#a855f7' },
  { value: 'Orange', color: '#f97316' },
  { value: 'Pink', color: '#ec4899' },
  { value: 'Cyan', color: '#06b6d4' },
  { value: 'Teal', color: '#14b8a6' },
  { value: 'Indigo', color: '#6366f1' },
  { value: 'Lime', color: '#84cc16' },
  { value: 'Amber', color: '#f59e0b' },
  { value: 'Rose', color: '#f43f5e' },
  { value: 'Sky', color: '#0ea5e9' },
  { value: 'Violet', color: '#8b5cf6' },
  { value: 'Emerald', color: '#10b981' },
  { value: 'Fuchsia', color: '#d946ef' },
  { value: 'Slate', color: '#64748b' },
  { value: 'Stone', color: '#78716c' },
  { value: 'Zinc', color: '#71717a' },
  { value: 'Gold', color: '#d97706' },
  { value: 'Coral', color: '#f87171' },
  { value: 'Mint', color: '#6ee7b7' },
  { value: 'Lavender', color: '#c4b5fd' },
  { value: 'Navy', color: '#1e3a8a' },
  { value: 'Maroon', color: '#991b1b' },
  { value: 'Olive', color: '#4d7c0f' },
  { value: 'Salmon', color: '#fb923c' },
  { value: 'Crimson', color: '#dc2626' },
  { value: 'Turquoise', color: '#2dd4bf' },
  { value: 'Periwinkle', color: '#818cf8' },
  { value: 'Charcoal', color: '#374151' },
];

const ANIMAL_PAIRS: string[] = [
  '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🦏', '🦛',
  '🦒', '🐘', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎',
  '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩',
  '🦮', '🐈', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢',
];

const SYMBOL_PAIRS: string[] = [
  '♠', '♥', '♦', '♣', '★', '☆', '◆', '◇',
  '●', '○', '■', '□', '▲', '△', '▼', '▽',
  '⬟', '⬠', '⬡', '⬢', '⬣', '⬤', '⬥', '⬦',
  '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏',
];

export const getPairsCount = (difficulty: Difficulty): number => {
  switch (difficulty) {
    case '4x4': return 8;
    case '6x6': return 18;
    case '8x8': return 32;
    default: return 8;
  }
};

export const getGridCols = (difficulty: Difficulty): number => {
  switch (difficulty) {
    case '4x4': return 4;
    case '6x6': return 6;
    case '8x8': return 8;
    default: return 4;
  }
};

const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const generateCards = (difficulty: Difficulty, theme: CardTheme): CardItem[] => {
  const count = getPairsCount(difficulty);
  const cards: CardItem[] = [];

  if (theme === 'colors') {
    const selected = COLOR_PAIRS.slice(0, count);
    selected.forEach((pair, i) => {
      const pairId = `pair-${i}`;
      ['a', 'b'].forEach((suffix) => {
        cards.push({
          id: `${pairId}-${suffix}`,
          pairId,
          value: pair.value,
          color: pair.color,
          isFlipped: false,
          isMatched: false,
        });
      });
    });
  } else if (theme === 'emojis') {
    const selected = EMOJI_PAIRS.slice(0, count);
    selected.forEach((emoji, i) => {
      const pairId = `pair-${i}`;
      ['a', 'b'].forEach((suffix) => {
        cards.push({
          id: `${pairId}-${suffix}`,
          pairId,
          value: emoji,
          isFlipped: false,
          isMatched: false,
        });
      });
    });
  } else if (theme === 'numbers') {
    for (let i = 1; i <= count; i++) {
      const pairId = `pair-${i}`;
      ['a', 'b'].forEach((suffix) => {
        cards.push({
          id: `${pairId}-${suffix}`,
          pairId,
          value: String(i),
          isFlipped: false,
          isMatched: false,
        });
      });
    }
  } else if (theme === 'animals') {
    const selected = ANIMAL_PAIRS.slice(0, count);
    selected.forEach((animal, i) => {
      const pairId = `pair-${i}`;
      ['a', 'b'].forEach((suffix) => {
        cards.push({
          id: `${pairId}-${suffix}`,
          pairId,
          value: animal,
          isFlipped: false,
          isMatched: false,
        });
      });
    });
  } else if (theme === 'symbols') {
    const selected = SYMBOL_PAIRS.slice(0, count);
    selected.forEach((sym, i) => {
      const pairId = `pair-${i}`;
      ['a', 'b'].forEach((suffix) => {
        cards.push({
          id: `${pairId}-${suffix}`,
          pairId,
          value: sym,
          isFlipped: false,
          isMatched: false,
        });
      });
    });
  }

  return shuffle(cards);
};

export const calculateScore = (moves: number, timeSeconds: number, difficulty: Difficulty): number => {
  const basePairs = getPairsCount(difficulty);
  const base = basePairs * 100;
  const penalty = moves * 2 + Math.floor(timeSeconds * 0.5);
  return Math.max(base - penalty, 10);
};
