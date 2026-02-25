import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardItem, Difficulty, CardTheme } from '../types/game.types';
import { generateCards, getPairsCount, calculateScore } from '../utils/cardUtils';

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
    initGame();
  }, [initGame]);

  const flipCard = useCallback(
    (id: string) => {
      if (isLocked || isComplete) return;
      const card = cards.find((c) => c.id === id);
      if (!card || card.isFlipped || card.isMatched) return;

      if (!isActive) setIsActive(true);

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
            if (newMatched === totalPairs) {
              setIsComplete(true);
              setIsActive(false);
              const score = calculateScore(moves + 1, time, difficulty);
              onComplete?.(moves + 1, time, score);
            }
          } else {
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
    restart: initGame,
  };
};
