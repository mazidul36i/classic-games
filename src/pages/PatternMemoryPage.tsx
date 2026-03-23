import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { saveGameResult } from "../firebase/firestore";
import { ChevronLeft } from "lucide-react";

const GRID_SIZE = 4; // 4x4 = 16 cells
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const MAX_LIVES = 3;
const randomInt = (max: number): number => {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
};

export default function PatternMemoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState<number[]>([]);
  const [playerPattern, setPlayerPattern] = useState<number[]>([]);
  const [level, setLevel] = useState(1);
  const [isShowingPattern, setIsShowingPattern] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
  const [successCells, setSuccessCells] = useState<number[]>([]);
  const [missedCells, setMissedCells] = useState<number[]>([]);
  const [errorCell, setErrorCell] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generatePattern = (lvl: number): number[] => {
    const count = Math.min(3 + lvl, 12);
    const cells = new Set<number>();
    while (cells.size < count) {
      cells.add(randomInt(TOTAL_CELLS));
    }
    return Array.from(cells);
  };

  const showPattern = useCallback((
    pat: number[],
    startIndex = 0,
    resetProgress = true
  ) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsPlayerTurn(false);
    setIsShowingPattern(true);
    if (resetProgress) {
      setPlayerPattern([]);
      setSuccessCells([]);
    }
    setMissedCells([]);
    setErrorCell(null);

    let index = startIndex;
    const flashNext = () => {
      if (index >= pat.length) {
        setHighlightedCells([]);
        setIsShowingPattern(false);
        setIsPlayerTurn(true);
        return;
      }

      const cell = pat[index];
      setHighlightedCells([cell]);

      timeoutRef.current = setTimeout(() => {
        setHighlightedCells([]);
        index += 1;
        timeoutRef.current = setTimeout(flashNext, 200);
      }, 500);
    };

    timeoutRef.current = setTimeout(flashNext, 350);
  }, []);

  const startGame = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLives(MAX_LIVES);
    setScore(0);
    setLevel(1);
    setIsGameOver(false);
    setIsStarted(true);
    setPlayerPattern([]);
    setSuccessCells([]);
    setMissedCells([]);
    setErrorCell(null);
    const pat = generatePattern(1);
    setPattern(pat);
    setTimeout(() => showPattern(pat), 500);
  };

  const handleCellClick = (idx: number) => {
    if (!isPlayerTurn || isGameOver) return;

    const expected = pattern[playerPattern.length];
    if (idx !== expected) {
      setIsPlayerTurn(false);
      setErrorCell(idx);
      const resumeFrom = playerPattern.length;
      setMissedCells(pattern.slice(resumeFrom));
      const newLives = lives - 1;
      setLives(newLives);

      setTimeout(() => {
        if (newLives <= 0) {
          setIsGameOver(true);
          if (user) {
            saveGameResult({
              uid: user.uid,
              displayName: user.displayName || "Player",
              gameType: "pattern-memory",
              mode: "single",
              difficulty: "4x4",
              score,
              moves: level,
              timeSeconds: 0,
              completedAt: Date.now(),
              isWin: false,
            });
          }
          return;
        }

        showPattern(pattern, resumeFrom, false);
      }, 900);
      return;
    }

    const newPlayerPattern = [...playerPattern, idx];
    setSuccessCells((prev) => [...prev, idx]);
    setPlayerPattern(newPlayerPattern);

    if (newPlayerPattern.length === pattern.length) {
      // Level complete
      const newScore = score + level * 15;
      setScore(newScore);
      setLives((prev) => Math.min(MAX_LIVES, prev + 1));
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setIsPlayerTurn(false);
      timeoutRef.current = setTimeout(() => {
        setSuccessCells([]);
        setMissedCells([]);
        const nextPat = generatePattern(nextLevel);
        setPattern(nextPat);
        showPattern(nextPat);
      }, 900);
    }
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
        <h1 className="text-xl font-bold text-white">Pattern Memory</h1>
        <div
          className="bg-slate-600 text-shadow-accent text-shadow-2xs rounded-xl px-2 py-1 text-sm">
          { "❤️".repeat(lives) }{ "🖤".repeat(MAX_LIVES - lives) }
        </div>
      </div>

      <div className="flex gap-6">
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Level</div>
          <div className="text-2xl font-bold text-white">{ level }</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Score</div>
          <div className="text-2xl font-bold text-amber-400">{ score }</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Target</div>
          <div className="text-2xl font-bold text-indigo-400">{ pattern.length } cells</div>
        </div>
      </div>

      <div className={ `px-4 py-2 rounded-xl text-sm font-medium ${
        isShowingPattern ? "bg-amber-900/30 text-amber-400 border border-amber-700" :
          errorCell !== null && !isGameOver ? "bg-red-900/30 text-red-300 border border-red-700" :
          isPlayerTurn ? "bg-indigo-900/30 text-indigo-400 border border-indigo-700" :
            "bg-slate-800 text-slate-400 border border-slate-700"
      }` }>
        { isShowingPattern ? "👁️ Memorize the pattern..." :
          errorCell !== null && !isGameOver ? "💔 Wrong cell! Watch the missed cells, then try again." :
          isPlayerTurn ? `🎯 Tap the remaining ${ pattern.length - playerPattern.length } cells` :
            isGameOver ? "💀 Wrong cell!" : "Press Start to play" }
      </div>

      {/* Pattern Grid */ }
      <div className="grid grid-cols-4 gap-2">
        { Array.from({ length: TOTAL_CELLS }, (_, i) => (
          <motion.button
            key={ i }
            onClick={ () => handleCellClick(i) }
            disabled={ !isPlayerTurn }
            className={ `w-16 h-16 rounded-lg transition-all border-2 ${
              errorCell === i
                ? "bg-red-600 border-red-400"
                : highlightedCells.includes(i)
                  ? "bg-amber-400 border-amber-300 scale-105"
                  : missedCells.includes(i)
                    ? "bg-cyan-900/70 border-cyan-500"
                    : successCells.includes(i)
                      ? "bg-emerald-600 border-emerald-400"
                      : "bg-slate-800 border-slate-600 hover:bg-slate-700 hover:border-slate-500 disabled:cursor-not-allowed"
            }` }
            whileTap={ { scale: isPlayerTurn ? 0.92 : 1 } }
          />
        )) }
      </div>

      <AnimatePresence>
        { isGameOver && (
          <motion.div
            className="text-center p-6 bg-slate-800 border border-slate-700 rounded-2xl w-full"
            initial={ { opacity: 0, y: 10 } }
            animate={ { opacity: 1, y: 0 } }
          >
            <div className="text-4xl mb-2">💀</div>
            <p className="text-white font-bold text-xl">Wrong Pattern!</p>
            <p className="text-slate-400 mt-1">Level { level } · Score: { score }</p>
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
