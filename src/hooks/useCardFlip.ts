import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardItem, Difficulty, CardTheme } from '../types/game.types';
import { generateCards, getPairsCount, calculateScore } from '../utils/cardUtils';
import { play } from '../audio/cues';

interface UseCardFlipOptions {
  difficulty: Difficulty;
  theme: CardTheme;
  onComplete?: (moves: number, timeSeconds: number, score: number) => void;
}

export const useCardFlip = ({ difficulty, theme, onComplete }: UseCardFlipOptions) => {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalPairs = getPairsCount(difficulty);

  // Timer
  useEffect(() => {
    if (isActive && !isComplete) {
      timerRef.current = setInterval(() => setTime((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, isComplete]);

  const initGame = useCallback(() => {
    setCards(generateCards(difficulty, theme));
    setFlippedIds([]);
    setMatchedPairs(0);
    setMoves(0);
    setTime(0);
    setIsActive(false);
    setIsLocked(false);
    setIsComplete(false);
  }, [difficulty, theme]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      initGame();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [initGame]);

  const flipCard = useCallback(
    (id: string) => {
      if (isLocked || isComplete) return;
      const card = cards.find((c) => c.id === id);
      if (!card || card.isFlipped || card.isMatched) return;

      if (!isActive) setIsActive(true);
      play('flip');

      const newFlipped = [...flippedIds, id];
      setFlippedIds(newFlipped);
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c))
      );

      if (newFlipped.length === 2) {
        setIsLocked(true);
        setMoves((m) => m + 1);

        const [firstId, secondId] = newFlipped;
        const firstCard = cards.find((c) => c.id === firstId)!;
        const secondCard = card;
        const matched = firstCard.pairId === secondCard.pairId;

        setTimeout(() => {
          if (matched) {
            setCards((prev) =>
              prev.map((c) =>
                c.id === firstId || c.id === secondId
                  ? { ...c, isMatched: true }
                  : c
              )
            );
            const newMatched = matchedPairs + 1;
            setMatchedPairs(newMatched);
            play('match');
            if (newMatched === totalPairs) {
              setIsComplete(true);
              setIsActive(false);
              // Held back so the fanfare starts after the match has rung out
              // rather than on top of it.
              play('win', { delay: 0.28 });
              const score = calculateScore(moves + 1, time, difficulty);
              onComplete?.(moves + 1, time, score);
            }
          } else {
            play('miss');
            setCards((prev) =>
              prev.map((c) =>
                c.id === firstId || c.id === secondId
                  ? { ...c, isFlipped: false }
                  : c
              )
            );
          }
          setFlippedIds([]);
          setIsLocked(false);
        }, 900);
      }
    },
    [cards, flippedIds, isLocked, isComplete, isActive, matchedPairs, totalPairs, moves, time, difficulty, onComplete]
  );

  /* `initGame` also runs on mount and whenever the table's settings change, and
     a deck riffling at you the moment a page loads is startling — worse, on a
     cold load the context is still locked, so it would be swallowed anyway.
     Only an asked-for deal is announced. */
  const restart = useCallback(() => {
    initGame();
    play('deal');
  }, [initGame]);

  return {
    cards,
    flippedIds,
    matchedPairs,
    totalPairs,
    moves,
    time,
    isComplete,
    isLocked,
    flipCard,
    restart,
  };
};
