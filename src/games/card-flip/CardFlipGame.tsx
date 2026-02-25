import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Card from '../../components/game/Card';
import GameStats from '../../components/game/GameStats';
import WinModal from '../../components/game/WinModal';
import { useCardFlip } from '../../hooks/useCardFlip';
import { useAuth } from '../../hooks/useAuth';
import { saveGameResult } from '../../firebase/firestore';
import type { Difficulty, CardTheme } from '../../types/game.types';
import { getGridCols } from '../../utils/cardUtils';

interface CardFlipGameProps {
  difficulty: Difficulty;
  theme: CardTheme;
  onBack: () => void;
}

const gridColsMap: Record<number, string> = {
  4: 'grid-cols-4',
  6: 'grid-cols-6',
  8: 'grid-cols-8',
};

const cardSizeMap: Record<string, 'sm' | 'md' | 'lg'> = {
  '4x4': 'lg',
  '6x6': 'md',
  '8x8': 'sm',
};

export default function CardFlipGame({ difficulty, theme, onBack }: CardFlipGameProps) {
  const { user } = useAuth();
  const [finalScore, setFinalScore] = useState(0);
  const [finalMoves, setFinalMoves] = useState(0);
  const [finalTime, setFinalTime] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const handleComplete = useCallback(
    async (moves: number, timeSeconds: number, score: number) => {
      setFinalMoves(moves);
      setFinalTime(timeSeconds);
      setFinalScore(score);
      setShowModal(true);

      if (user) {
        await saveGameResult({
          uid: user.uid,
          displayName: user.displayName || 'Player',
          gameType: 'card-flip',
          mode: 'single',
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
  const colClass = gridColsMap[cols] || 'grid-cols-4';
  const cardSize = cardSizeMap[difficulty] || 'md';

  const handlePlayAgain = () => {
    setShowModal(false);
    restart();
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-3xl">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-white">
          Card Flip Match
          <span className="ml-2 text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full font-normal">
            {difficulty} · {theme}
          </span>
        </h1>
        <button
          onClick={restart}
          className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
        >
          Restart
        </button>
      </div>

      {/* Stats */}
      <GameStats moves={moves} time={time} matched={matchedPairs} total={totalPairs} />

      {/* Game Board */}
      <motion.div
        className={`grid ${colClass} gap-2 sm:gap-3`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            onClick={flipCard}
            size={cardSize}
            disabled={isLocked || isComplete}
          />
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
