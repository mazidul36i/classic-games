import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { saveGameResult } from '../firebase/firestore';

const GRID_SIZE = 4; // 4x4 = 16 cells
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

export default function PatternMemoryPage() {
  const { user } = useAuth();
  const [pattern, setPattern] = useState<number[]>([]);
  const [playerPattern, setPlayerPattern] = useState<number[]>([]);
  const [level, setLevel] = useState(1);
  const [isShowingPattern, setIsShowingPattern] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);
  const [successCells, setSuccessCells] = useState<number[]>([]);
  const [errorCell, setErrorCell] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generatePattern = (lvl: number): number[] => {
    const count = Math.min(3 + lvl, 12);
    const cells = new Set<number>();
    while (cells.size < count) {
      cells.add(Math.floor(Math.random() * TOTAL_CELLS));
    }
    return Array.from(cells);
  };

  const showPattern = useCallback((pat: number[]) => {
    setIsPlayerTurn(false);
    setIsShowingPattern(true);
    setPlayerPattern([]);
    setSuccessCells([]);
    setErrorCell(null);

    // Flash all pattern cells at once
    timeoutRef.current = setTimeout(() => {
      setHighlightedCells(pat);
      timeoutRef.current = setTimeout(() => {
        setHighlightedCells([]);
        setIsShowingPattern(false);
        setIsPlayerTurn(true);
      }, 1200 + pat.length * 80);
    }, 600);
  }, []);

  const startGame = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setScore(0);
    setLevel(1);
    setIsGameOver(false);
    setIsStarted(true);
    setPlayerPattern([]);
    setSuccessCells([]);
    setErrorCell(null);
    const pat = generatePattern(1);
    setPattern(pat);
    setTimeout(() => showPattern(pat), 500);
  };

  const handleCellClick = (idx: number) => {
    if (!isPlayerTurn || isGameOver) return;

    const expected = pattern[playerPattern.length];
    if (idx !== expected) {
      setErrorCell(idx);
      setTimeout(() => {
        setErrorCell(null);
        setIsGameOver(true);
        setIsPlayerTurn(false);
        if (user) {
          saveGameResult({
            uid: user.uid,
            displayName: user.displayName || 'Player',
            gameType: 'pattern-memory',
            mode: 'single',
            difficulty: '4x4',
            score,
            moves: level,
            timeSeconds: 0,
            completedAt: Date.now(),
            isWin: false,
          });
        }
      }, 500);
      return;
    }

    const newPlayerPattern = [...playerPattern, idx];
    setSuccessCells((prev) => [...prev, idx]);
    setPlayerPattern(newPlayerPattern);

    if (newPlayerPattern.length === pattern.length) {
      // Level complete
      const newScore = score + level * 15;
      setScore(newScore);
      const nextLevel = level + 1;
      setLevel(nextLevel);
      setIsPlayerTurn(false);
      timeoutRef.current = setTimeout(() => {
        setSuccessCells([]);
        const nextPat = generatePattern(nextLevel);
        setPattern(nextPat);
        showPattern(nextPat);
      }, 900);
    }
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return (
    <div className="max-w-lg mx-auto px-4 py-10 flex flex-col items-center gap-6">
      <div className="flex items-center justify-between w-full">
        <Link to="/lobby" className="text-slate-400 hover:text-white transition-colors">← Lobby</Link>
        <h1 className="text-xl font-bold text-white">🔲 Pattern Memory</h1>
        <div className="text-slate-400 text-sm">Lv {level}</div>
      </div>

      <div className="flex gap-6">
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Level</div>
          <div className="text-2xl font-bold text-white">{level}</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Score</div>
          <div className="text-2xl font-bold text-amber-400">{score}</div>
        </div>
        <div className="text-center">
          <div className="text-slate-400 text-xs uppercase">Target</div>
          <div className="text-2xl font-bold text-indigo-400">{pattern.length} cells</div>
        </div>
      </div>

      <div className={`px-4 py-2 rounded-xl text-sm font-medium ${
        isShowingPattern ? 'bg-amber-900/30 text-amber-400 border border-amber-700' :
        isPlayerTurn ? 'bg-indigo-900/30 text-indigo-400 border border-indigo-700' :
        'bg-slate-800 text-slate-400 border border-slate-700'
      }`}>
        {isShowingPattern ? '👁️ Memorize the pattern...' :
         isPlayerTurn ? `🎯 Tap the ${pattern.length} highlighted cells` :
         isGameOver ? '💀 Wrong cell!' : 'Press Start to play'}
      </div>

      {/* Pattern Grid */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: TOTAL_CELLS }, (_, i) => (
          <motion.button
            key={i}
            onClick={() => handleCellClick(i)}
            disabled={!isPlayerTurn}
            className={`w-16 h-16 rounded-lg transition-all border-2 ${
              errorCell === i
                ? 'bg-red-600 border-red-400'
                : highlightedCells.includes(i)
                ? 'bg-amber-400 border-amber-300 scale-105'
                : successCells.includes(i)
                ? 'bg-emerald-600 border-emerald-400'
                : 'bg-slate-800 border-slate-600 hover:bg-slate-700 hover:border-slate-500 disabled:cursor-not-allowed'
            }`}
            whileTap={{ scale: isPlayerTurn ? 0.92 : 1 }}
          />
        ))}
      </div>

      <AnimatePresence>
        {isGameOver && (
          <motion.div
            className="text-center p-6 bg-slate-800 border border-slate-700 rounded-2xl w-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="text-4xl mb-2">💀</div>
            <p className="text-white font-bold text-xl">Wrong Pattern!</p>
            <p className="text-slate-400 mt-1">Level {level} · Score: {score}</p>
            <button
              onClick={startGame}
              className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
            >
              Play Again
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isStarted && !isGameOver && (
        <button
          onClick={startGame}
          className="px-10 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-lg"
        >
          Start Game
        </button>
      )}
    </div>
  );
}
