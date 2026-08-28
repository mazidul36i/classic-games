import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import GameHead from "../components/game/GameHead";
import { useAuth } from "../hooks/useAuth";
import { saveGameResult } from "../firebase/firestore";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
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
  const reduce = useReducedMotion();
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

  const remaining = pattern.length - playerPattern.length;
  const status = isShowingPattern
    ? { text: "Mark where it falls", tone: "p-status-live" }
    : errorCell !== null && !isGameOver
      ? { text: "Missed — watch the rest", tone: "p-status-miss" }
      : isPlayerTurn
        ? { text: `${remaining} left to name`, tone: "p-status-turn" }
        : isGameOver
          ? { text: "The hand is out", tone: "p-status-miss" }
          : { text: "Press start to deal", tone: "" };

  return (
    <div className="relative z-10 max-w-[36rem] mx-auto px-5 sm:px-10 pt-6 pb-20 flex flex-col items-center">
      <GameHead
        rank="Q"
        suit="♣"
        title="Pattern Memory"
        meta="Sixteen cells · a longer figure each round"
        action={
          <span className="p-hearts" aria-label={`${lives} of ${MAX_LIVES} lives left`}>
            {Array.from({ length: MAX_LIVES }, (_, i) => (
              <span key={i} className={i < lives ? "p-heart-full" : "p-heart-spent"} aria-hidden="true">
                ♥
              </span>
            ))}
          </span>
        }
      />

      <div className="p-gauges w-full max-w-md">
        <div className="p-gauge">
          <div className="p-figure text-[1.7rem] mb-1.5">{level}</div>
          <div className="p-tick text-ink-soft">Round</div>
        </div>
        <div className="p-gauge">
          <div className="p-figure text-[1.7rem] mb-1.5">{score}</div>
          <div className="p-tick text-ink-soft">Score</div>
        </div>
        <div className="p-gauge">
          <div className="p-figure text-[1.7rem] mb-1.5">{pattern.length}</div>
          <div className="p-tick text-ink-soft">Marks</div>
        </div>
      </div>

      <motion.div
        className="p-felt rounded-sm w-full mt-9 px-6 py-8 sm:px-10 sm:py-10"
        initial={reduce ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className="relative z-10 flex flex-col items-center gap-8">
          <span className={`p-status ${status.tone}`} aria-live="polite">
            {status.text}
          </span>

          <div className="grid grid-cols-4 gap-2.5 w-full max-w-[20rem]">
            {Array.from({ length: TOTAL_CELLS }, (_, i) => {
              const tone =
                errorCell === i
                  ? "p-pad-miss"
                  : highlightedCells.includes(i)
                    ? "p-pad-lit"
                    : missedCells.includes(i)
                      ? "p-pad-shown"
                      : successCells.includes(i)
                        ? "p-pad-hit"
                        : "";
              return (
                <motion.button
                  key={i}
                  onClick={() => handleCellClick(i)}
                  disabled={!isPlayerTurn}
                  aria-label={`Cell ${i + 1}`}
                  className={`p-tile ${tone}`}
                  whileTap={reduce || !isPlayerTurn ? undefined : { scale: 0.92 }}
                />
              );
            })}
          </div>

          {!isStarted && !isGameOver && (
            <button onClick={startGame} className="p-btn p-btn-cream">
              Deal the first
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {isGameOver && (
          <motion.div
            className="p-panel w-full mt-8 px-7 py-8 text-center"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="p-tick text-vermilion">Out of lives</span>
            <h2 className="p-display text-[1.7rem] mt-4 mb-6">The figure got away.</h2>
            <div className="p-gauges mb-8">
              <div className="p-gauge">
                <div className="p-figure text-[1.5rem] mb-1.5">{level}</div>
                <div className="p-tick text-ink-soft">Round reached</div>
              </div>
              <div className="p-gauge">
                <div className="p-figure text-[1.5rem] mb-1.5">{score}</div>
                <div className="p-tick text-ink-soft">Score</div>
              </div>
            </div>
            <button onClick={startGame} className="p-btn p-btn-solid">
              Deal again
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
