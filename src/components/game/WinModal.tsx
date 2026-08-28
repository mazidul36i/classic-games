import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";

interface WinModalProps {
  isOpen: boolean;
  moves: number;
  time: number;
  score: number;
  onPlayAgain: () => void;
}

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

/** The house's written acknowledgement that a hand was seen out. */
export default function WinModal({ isOpen, moves, time, score, onPlayAgain }: WinModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="p-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Hand complete"
            className="p-panel w-full max-w-[26rem] px-7 sm:px-9 pt-8 pb-9 text-center"
            initial={{ scale: 0.9, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
          >
            <div className="p-rule-double pt-3 pb-6">
              <span className="p-suits flex items-center justify-center gap-3 text-[1.3rem]" aria-hidden="true">
                <span className="text-ink-deep">♠</span>
                <span className="text-vermilion">♥</span>
                <span className="text-vermilion">♦</span>
                <span className="text-ink-deep">♣</span>
              </span>
            </div>

            <span className="p-tick text-vermilion">The house certifies</span>
            <h2 className="p-display text-[2rem] leading-[1.08] mt-4 mb-8">
              The hand
              <br />
              is yours.
            </h2>

            <div className="p-gauges mb-9">
              <div className="p-gauge">
                <div className="p-figure text-[1.5rem] mb-1.5">{score}</div>
                <div className="p-tick text-ink-soft">Score</div>
              </div>
              <div className="p-gauge">
                <div className="p-figure text-[1.5rem] mb-1.5">{moves}</div>
                <div className="p-tick text-ink-soft">Moves</div>
              </div>
              <div className="p-gauge">
                <div className="p-figure text-[1.5rem] mb-1.5">{formatTime(time)}</div>
                <div className="p-tick text-ink-soft">Time</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={onPlayAgain} className="p-btn p-btn-solid p-btn-block">
                <RotateCcw className="w-3.5 h-3.5" />
                Deal another
              </button>
              <Link to="/lobby/card-flip" className="p-btn p-btn-outline p-btn-block">
                Back to the table
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
