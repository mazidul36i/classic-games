import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { saveGameResult } from "../firebase/firestore";
import { ChevronLeft } from "lucide-react";

const GRID_SIZE = 9; // 3x3, numbers 1-9

export default function NumberSequencePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerSequence, setPlayerSequence] = useState<number[]>([]);
  const [level, setLevel] = useState(0);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [lives, setLives] = useState(3);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isClickHandling, setIsClickHandling] = useState(false);
  const clickHandlingRef = useRef(false);

  const beginClickHandling = () => {
    clickHandlingRef.current = true;
    setIsClickHandling(true);
  };

  const endClickHandling = () => {
    clickHandlingRef.current = false;
    setIsClickHandling(false);
  };

  const showSequence = useCallback((seq: number[]) => {
    beginClickHandling();
    setIsPlayerTurn(false);
    setIsShowingSequence(true);
    setPlayerSequence([]);

    let i = 0;
    const showNext = () => {
      if (i >= seq.length) {
        setActiveCell(null);
        setIsShowingSequence(false);
        setIsPlayerTurn(true);
        endClickHandling();
        return;
      }
      setActiveCell(null);
      timeoutRef.current = setTimeout(() => {
        setActiveCell(seq[i]);
        i++;
        timeoutRef.current = setTimeout(showNext, 600);
      }, 300);
    };
    showNext();
  }, []);

  const startNextLevel = useCallback((currentSeq: number[], lvl: number) => {
    const next = Math.floor(Math.random() * GRID_SIZE) + 1;
    const newSeq = [...currentSeq, next];
    setSequence(newSeq);
    setLevel(lvl + 1);
    setTimeout(() => showSequence(newSeq), 700);
  }, [showSequence]);

  const startGame = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLives(3);
    setScore(0);
    setIsGameOver(false);
    endClickHandling();
    setIsStarted(true);
    setLevel(0);
    setSequence([]);
    setPlayerSequence([]);
    const firstNum = Math.floor(Math.random() * GRID_SIZE) + 1;
    const seq = [firstNum];
    setSequence(seq);
    setLevel(1);
    setTimeout(() => showSequence(seq), 500);
  };

  const handleCellClick = (num: number) => {
    if (!isPlayerTurn || isGameOver || isShowingSequence || clickHandlingRef.current) return;
    beginClickHandling();
    setError(null);

    const newPlayerSeq = [...playerSequence, num];
    setPlayerSequence(newPlayerSeq);

    const expectedNum = sequence[newPlayerSeq.length - 1];
    if (num !== expectedNum) {
      // Wrong
      setError(num);
      const newLives = lives - 1;
      setLives(newLives);
      setTimeout(() => setError(null), 500);
      if (newLives <= 0) {
        setIsGameOver(true);
        setIsPlayerTurn(false);
        endClickHandling();
        if (user) {
          saveGameResult({
            uid: user.uid,
            displayName: user.displayName || "Player",
            gameType: "number-sequence",
            mode: "single",
            difficulty: "4x4",
            score,
            moves: level,
            timeSeconds: 0,
            completedAt: Date.now(),
            isWin: false,
          }).then(() => {
          });
        }
      } else {
        // Retry same sequence
        setTimeout(() => {
          setPlayerSequence([]);
          showSequence(sequence);
        }, 800);
      }
      return;
    }

    if (newPlayerSeq.length === sequence.length) {
      setTimeout(() => {
        // Completed level
        const newScore = score + level * 10;
        setScore(newScore);
        setIsPlayerTurn(false);
        setTimeout(() => startNextLevel(sequence, level), 800);
      }, 800);
      return;
    }

    endClickHandling();
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-10 flex flex-col items-center gap-6">
      {/* Header */ }
      <div className="flex items-center justify-between w-full max-w-3xl">
        <button
          onClick={ () => navigate(-1) }
          className="flex items-center justify-center w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
        >
          <ChevronLeft className="text-xl font-bold text-white mr-1" />
        </button>
        <h1 className="text-xl font-bold text-white">Number Sequence</h1>
        <div
          className="bg-slate-600 text-shadow-accent text-shadow-2xs rounded-xl px-2 py-1 text-sm">{ "❤️".repeat(lives) }{ "🖤".repeat(3 - lives) }</div>
      </div>

      {/* Stats */ }
      <div className="flex gap-6">
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Level</div>
          <div className="text-2xl font-bold text-white">{ level }</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Score</div>
          <div className="text-2xl font-bold text-amber-400">{ score }</div>
        </div>
      </div>

      {/* Status */ }
      <div className={ `px-4 py-2 rounded-xl text-sm font-medium ${
        isShowingSequence ? "bg-amber-900/30 text-amber-400 border border-amber-700" :
          isPlayerTurn ? "bg-indigo-900/30 text-indigo-400 border border-indigo-700" :
            "bg-slate-800 text-slate-400 border border-slate-700"
      }` }>
        { isShowingSequence ? "👁️ Watch the sequence..." :
          isPlayerTurn ? "🎯 Your turn! Repeat the sequence" :
            isGameOver ? "💀 Game Over" : "Press Start to play" }
      </div>

      {/* Grid */ }
      <div className="grid grid-cols-3 gap-3">
        { Array.from({ length: 9 }, (_, i) => i + 1).map((num) => (
          <motion.button
            key={ num }
            onClick={ () => handleCellClick(num) }
            disabled={ !isPlayerTurn || isClickHandling }
            className={ `w-20 h-20 rounded-xl text-2xl font-bold transition-all border-2 ${
              activeCell === num
                ? "bg-amber-500 border-amber-400 text-white scale-105"
                : error === num
                  ? "bg-red-700 border-red-500 text-white"
                  : playerSequence[playerSequence.length - 1] === num && isPlayerTurn
                    ? "bg-indigo-600 border-indigo-400 text-white"
                    : "bg-slate-800 border-slate-600 text-white hover:bg-slate-700 disabled:cursor-not-allowed"
            }` }
            whileTap={ { scale: 0.93 } }
          >
            { num }
          </motion.button>
        )) }
      </div>

      {/* Game Over */ }
      <AnimatePresence>
        { isGameOver && (
          <motion.div
            className="text-center p-6 bg-slate-800 border border-slate-700 rounded-2xl w-full"
            initial={ { opacity: 0, y: 10 } }
            animate={ { opacity: 1, y: 0 } }
          >
            <div className="text-4xl mb-2">💀</div>
            <p className="text-white font-bold text-xl">Game Over!</p>
            <p className="text-slate-400 mt-1">You reached level { level } with a score of { score }</p>
            <button
              onClick={ startGame }
              className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
            >
              Play Again
            </button>
          </motion.div>
        ) }
      </AnimatePresence>

      { !isStarted && !isGameOver && (
        <button
          onClick={ startGame }
          className="px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-lg"
        >
          Start Game
        </button>
      ) }
    </div>
  );
}
