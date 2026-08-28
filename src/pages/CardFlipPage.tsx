import { useState, useCallback, type CSSProperties } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import Card from "../components/game/Card.tsx";
import GameHead from "../components/game/GameHead.tsx";
import GameStats from "../components/game/GameStats.tsx";
import WinModal from "../components/game/WinModal.tsx";
import { useCardFlip } from "../hooks/useCardFlip.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { saveGameResult } from "../firebase/firestore.ts";
import type { Difficulty, CardTheme } from "../types/game.types.ts";
import { getGridCols } from "../utils/cardUtils.ts";
import { RotateCcw } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const VALID_DIFFICULTIES: Difficulty[] = ["4x4", "6x6", "8x8"];
const VALID_THEMES: CardTheme[] = ["colors", "emojis", "numbers", "animals", "symbols"];

const gridColsMap: Record<number, string> = {
  4: "grid-cols-4",
  6: "grid-cols-6",
  8: "grid-cols-8",
};

export default function CardFlipPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const reduce = useReducedMotion();
  const [finalScore, setFinalScore] = useState(0);
  const [finalMoves, setFinalMoves] = useState(0);
  const [finalTime, setFinalTime] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const rawDifficulty = params.get("difficulty") as Difficulty;
  const rawTheme = params.get("theme") as CardTheme;

  const difficulty: Difficulty = VALID_DIFFICULTIES.includes(rawDifficulty) ? rawDifficulty : "4x4";
  const theme: CardTheme = VALID_THEMES.includes(rawTheme) ? rawTheme : "emojis";

  const handleComplete = useCallback(
    async (moves: number, timeSeconds: number, score: number) => {
      setFinalMoves(moves);
      setFinalTime(timeSeconds);
      setFinalScore(score);
      setShowModal(true);

      if (user) {
        await saveGameResult({
          uid: user.uid,
          displayName: user.displayName || "Player",
          gameType: "card-flip",
          mode: "single",
          difficulty,
          score,
          moves,
          timeSeconds,
          completedAt: Date.now(),
          isWin: true,
        });
      }
    },
    [user, difficulty]
  );

  const { cards, matchedPairs, totalPairs, moves, time, isComplete, isLocked, flipCard, restart } =
    useCardFlip({ difficulty, theme, onComplete: handleComplete });

  const cols = getGridCols(difficulty);
  const colClass = gridColsMap[cols] || "grid-cols-4";
  const boardStyle: CSSProperties = {
    "--board-cols": cols,
    "--card-size":
      "clamp(2.5rem, calc((100vw - 5rem - (var(--board-cols) - 1) * 0.5rem) / var(--board-cols)), 5.5rem)",
  } as CSSProperties;
  const cardSize = difficulty === "8x8" ? "sm" : "fluid";

  const handlePlayAgain = () => {
    setShowModal(false);
    restart();
  };

  return (
    <div className="relative z-10 max-w-[46rem] mx-auto px-5 sm:px-10 pt-6 pb-20 flex flex-col items-center">
      <GameHead
        rank="A"
        suit="♠"
        title="Card Flip Match"
        meta={`${difficulty.replace("x", "×")} · ${theme} deck`}
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
        <motion.div
          className={`relative z-10 grid w-fit mx-auto ${colClass} gap-2 sm:gap-3 place-items-center`}
          style={boardStyle}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.12 }}
        >
          {cards.map((card, index) => (
            <motion.div
              key={card.id}
              initial={reduce ? false : { opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, delay: Math.min(index * 0.014, 0.32), ease: EASE }}
            >
              <Card card={card} onClick={flipCard} size={cardSize} disabled={isLocked || isComplete} />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      <WinModal
        isOpen={showModal}
        moves={finalMoves}
        time={finalTime}
        score={finalScore}
        onPlayAgain={handlePlayAgain}
      />
    </div>
  );
}
