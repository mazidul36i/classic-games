import { useState, useCallback, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/game/Card.tsx";
import GameStats from "../components/game/GameStats.tsx";
import WinModal from "../components/game/WinModal.tsx";
import { useCardFlip } from "../hooks/useCardFlip.ts";
import { useAuth } from "../hooks/useAuth.ts";
import { saveGameResult } from "../firebase/firestore.ts";
import type { Difficulty, CardTheme } from "../types/game.types.ts";
import { getGridCols } from "../utils/cardUtils.ts";
import { ChevronLeft, RotateCcw } from "lucide-react";

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
  const navigate = useNavigate();
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
      "clamp(2.5rem, calc((100vw - 2rem - (var(--board-cols) - 1) * 0.5rem) / var(--board-cols)), 5.5rem)",
  } as CSSProperties;
  const cardSize = difficulty === "8x8" ? "sm" : "fluid";

  const handlePlayAgain = () => {
    setShowModal(false);
    restart();
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-3xl">
        <button
          onClick={() => navigate("/lobby")}
          className="flex items-center justify-center w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
        >
          <ChevronLeft className="text-xl font-bold text-white mr-1" />
        </button>
        <h1 className="text-xl font-bold text-white">Card Flip Match</h1>
        <button
          onClick={restart}
          className="flex items-center justify-center w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
        >
          <RotateCcw className="text-xl font-bold text-white" />
        </button>
      </div>

      {/* Stats */}
      <GameStats moves={moves} time={time} matched={matchedPairs} total={totalPairs} />

      {/* Game Board */}
      <motion.div
        className={`grid w-fit mx-auto ${colClass} gap-2 sm:gap-3 place-items-center`}
        style={boardStyle}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {cards.map((card) => (
          <Card key={card.id} card={card} onClick={flipCard} size={cardSize} disabled={isLocked || isComplete} />
        ))}
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
