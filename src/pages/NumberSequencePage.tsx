import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import GameHead from "../components/game/GameHead";
import { useAuth } from "../hooks/useAuth";
import { saveGameResult } from "../firebase/firestore";
import { play, type Cue, type CueOptions } from "../audio/cues";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const GRID_SIZE = 9; // 3x3, numbers 1-9
const MAX_LIVES = 3;

export default function NumberSequencePage() {
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [sequence, setSequence] = useState<number[]>([]);
  const [playerSequence, setPlayerSequence] = useState<number[]>([]);
  const [level, setLevel] = useState(0);
  const [isShowingSequence, setIsShowingSequence] = useState(false);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [lives, setLives] = useState(MAX_LIVES);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isClickHandling, setIsClickHandling] = useState(false);
  const clickHandlingRef = useRef(false);

  /* This page schedules several timeouts it does not keep a handle on, so
     leaving mid-round leaves a few still armed. They have always been harmless
     — a setState on a gone component is a no-op — but a *cue* fired from one
     would be an audible ghost on whatever page you moved to. */
  const onPageRef = useRef(true);
  const cue = useCallback((name: Cue, options?: CueOptions) => {
    if (onPageRef.current) play(name, options);
  }, []);

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
        // Pitched by the cell itself, so the figure reads as a phrase and the
        // ear has something to hold on to alongside the eye.
        cue("cue", { pitch: seq[i] - 1 });
        i++;
        timeoutRef.current = setTimeout(showNext, 600);
      }, 300);
    };
    showNext();
  }, [cue]);

  const startNextLevel = useCallback((currentSeq: number[], lvl: number) => {
    const next = Math.floor(Math.random() * GRID_SIZE) + 1;
    const newSeq = [...currentSeq, next];
    setSequence(newSeq);
    setLevel(lvl + 1);
    setTimeout(() => showSequence(newSeq), 700);
  }, [showSequence]);

  const startGame = () => {
    cue("deal");
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLives(MAX_LIVES);
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
      cue("wrong");
      cue("life", { delay: 0.13 });
      const newLives = lives - 1;
      setLives(newLives);
      setTimeout(() => setError(null), 500);
      if (newLives <= 0) {
        cue("bust", { delay: 0.45 });
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

    // Right cell: the player's own, lighter echo of the pip they were shown.
    cue("cue", { pitch: num - 1, soft: true });

    if (newPlayerSeq.length === sequence.length) {
      setTimeout(() => {
        // Completed level
        cue("level");
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
    onPageRef.current = true;
    return () => {
      onPageRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const status = isShowingSequence
    ? { text: "Watch the order", tone: "p-status-live" }
    : isPlayerTurn
      ? { text: "Repeat it back", tone: "p-status-turn" }
      : isGameOver
        ? { text: "The hand is out", tone: "p-status-miss" }
        : { text: "Press start to deal", tone: "" };

  return (
    <div className="relative z-10 max-w-[36rem] mx-auto px-5 sm:px-10 pt-6 pb-20 flex flex-col items-center">
      <GameHead
        rank="K"
        suit="♦"
        red
        title="Number Sequence"
        meta="Nine cells · one longer each round"
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

      <div className="p-gauges w-full max-w-xs">
        <div className="p-gauge">
          <div className="p-figure text-[1.7rem] mb-1.5">{level}</div>
          <div className="p-tick text-ink-soft">Round</div>
        </div>
        <div className="p-gauge">
          <div className="p-figure text-[1.7rem] mb-1.5">{score}</div>
          <div className="p-tick text-ink-soft">Score</div>
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

          <div className="grid grid-cols-3 gap-3 w-full max-w-[19rem]">
            {Array.from({ length: GRID_SIZE }, (_, i) => i + 1).map((num) => {
              const tone =
                activeCell === num
                  ? "p-pad-lit"
                  : error === num
                    ? "p-pad-miss"
                    : playerSequence[playerSequence.length - 1] === num && isPlayerTurn
                      ? "p-pad-hit"
                      : "";
              return (
                <motion.button
                  key={num}
                  onClick={() => handleCellClick(num)}
                  disabled={!isPlayerTurn || isClickHandling}
                  className={`p-pad aspect-square text-[1.7rem] ${tone}`}
                  whileTap={reduce ? undefined : { scale: 0.93 }}
                >
                  {num}
                </motion.button>
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
            <h2 className="p-display text-[1.7rem] mt-4 mb-6">The run ends here.</h2>
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
