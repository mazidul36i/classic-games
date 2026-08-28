import { useSearchParams } from "react-router-dom";
import { useState, useCallback } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { saveGameResult } from "../firebase/firestore";
import GameHead from "../components/game/GameHead";
import GameStats from "../components/game/GameStats";
import WinModal from "../components/game/WinModal";
import type { Difficulty } from "../types/game.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Word pairs for matching (word → related word / synonym / antonym)
const WORD_PAIRS: [string, string][] = [
  ["Happy", "Joyful"], ["Cold", "Frigid"], ["Big", "Large"],
  ["Fast", "Quick"], ["Smart", "Clever"], ["Brave", "Bold"],
  ["Calm", "Peaceful"], ["Dark", "Dim"], ["Hot", "Warm"],
  ["Small", "Tiny"], ["Old", "Ancient"], ["New", "Fresh"],
  ["Kind", "Gentle"], ["Loud", "Noisy"], ["Strong", "Powerful"],
  ["Rich", "Wealthy"], ["Poor", "Needy"], ["Love", "Adore"],
];

interface WordCard {
  id: string;
  pairId: string;
  word: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const shuffle = <T, >(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const generateWordCards = (difficulty: Difficulty): WordCard[] => {
  const count = difficulty === "4x4" ? 8 : difficulty === "6x6" ? 18 : 18;
  const pairs = WORD_PAIRS.slice(0, count);
  const cards: WordCard[] = [];
  pairs.forEach(([a, b], i) => {
    cards.push({ id: `${ i }-a`, pairId: `${ i }`, word: a, isFlipped: false, isMatched: false });
    cards.push({ id: `${ i }-b`, pairId: `${ i }`, word: b, isFlipped: false, isMatched: false });
  });
  return shuffle(cards);
};

export default function WordMatchPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const reduce = useReducedMotion();

  const rawDifficulty = params.get("difficulty") as Difficulty;
  const difficulty: Difficulty = ["4x4", "6x6", "8x8"].includes(rawDifficulty) ? rawDifficulty : "4x4";

  const [cards, setCards] = useState<WordCard[]>(() => generateWordCards(difficulty));
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const totalPairs = cards.length / 2;

  const handleFlip = useCallback(
    (id: string) => {
      if (isLocked || isComplete) return;
      const card = cards.find((c) => c.id === id);
      if (!card || card.isFlipped || card.isMatched) return;

      const newFlipped = [...flippedIds, id];
      setFlippedIds(newFlipped);
      setCards((prev) => prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c)));

      if (newFlipped.length === 2) {
        setIsLocked(true);
        setMoves((m) => m + 1);
        const [firstId] = newFlipped;
        const first = cards.find((c) => c.id === firstId)!;
        const matched = first.pairId === card.pairId;

        setTimeout(() => {
          if (matched) {
            setCards((prev) =>
              prev.map((c) =>
                c.id === firstId || c.id === id ? { ...c, isMatched: true } : c
              )
            );
            const newMatched = matchedPairs + 1;
            setMatchedPairs(newMatched);
            if (newMatched === totalPairs) {
              const score = Math.max(totalPairs * 100 - moves * 3, 10);
              setFinalScore(score);
              setIsComplete(true);
              setShowModal(true);
              if (user) {
                saveGameResult({
                  uid: user.uid,
                  displayName: user.displayName || "Player",
                  gameType: "word-match",
                  mode: "single",
                  difficulty,
                  score,
                  moves: moves + 1,
                  timeSeconds: time,
                  completedAt: Date.now(),
                  isWin: true,
                });
              }
            }
          } else {
            setCards((prev) =>
              prev.map((c) =>
                c.id === firstId || c.id === id ? { ...c, isFlipped: false } : c
              )
            );
          }
          setFlippedIds([]);
          setIsLocked(false);
        }, 900);
      }
    },
    [cards, flippedIds, isLocked, isComplete, matchedPairs, totalPairs, moves, time, user, difficulty]
  );

  const restart = () => {
    setCards(generateWordCards(difficulty));
    setFlippedIds([]);
    setMatchedPairs(0);
    setMoves(0);
    setTime(0);
    setIsLocked(false);
    setIsComplete(false);
    setShowModal(false);
    setFinalScore(0);
  };

  const cols = difficulty === "4x4" ? "grid-cols-4" : "grid-cols-6";
  const cellSizeClass = difficulty === "4x4" ? "h-20 sm:h-24" : "h-16 sm:h-20";

  return (
    <div className="relative z-10 max-w-[42rem] mx-auto px-5 sm:px-10 pt-6 pb-20 flex flex-col items-center">
      <GameHead
        rank="J"
        suit="♥"
        red
        title="Word Match"
        meta={`${difficulty.replace("x", "×")} · ${totalPairs} pairs`}
        action={
          <button onClick={restart} className="p-icon-btn" aria-label="Shuffle and deal again">
            <RotateCcw className="w-4.5 h-4.5" strokeWidth={1.75} />
          </button>
        }
      />

      <GameStats moves={moves} time={time} matched={matchedPairs} total={totalPairs} />

      <motion.div
        className="p-felt rounded-sm w-full mt-9 p-6 sm:p-8"
        initial={reduce ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className={`relative z-10 grid ${cols} gap-2 sm:gap-2.5`}>
          {cards.map((card, i) => {
            const shown = card.isFlipped || card.isMatched;
            return (
              <motion.button
                key={card.id}
                onClick={() => handleFlip(card.id)}
                disabled={isLocked || isComplete || shown}
                className={`p-word ${cellSizeClass} ${
                  card.isMatched ? "p-word-matched" : shown ? "" : "p-word-down"
                }`}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.015, 0.3), ease: EASE }}
                whileTap={reduce || shown ? undefined : { scale: 0.95 }}
              >
                {shown ? card.word : ""}
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <WinModal
        isOpen={showModal}
        moves={moves}
        time={time}
        score={finalScore}
        onPlayAgain={restart}
      />
    </div>
  );
}
