import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface GameHeadProps {
  /** Corner index of the card this game was dealt, e.g. "A" and "♠" */
  rank: string;
  suit: string;
  red?: boolean;
  title: string;
  /** Settings line under the title — difficulty, deck, level */
  meta?: ReactNode;
  /** Sits at the right of the running head: restart, lives, a room code */
  action?: ReactNode;
}

/**
 * The running head for a table in play: back, house name, and whatever
 * control the game needs, over a corner index and the game's name.
 */
export default function GameHead({ rank, suit, red = false, title, meta, action }: GameHeadProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <motion.header
      className="w-full"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <div className="p-masthead">
        <button onClick={() => navigate(-1)} className="p-icon-btn" aria-label="Leave the table">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
        </button>

        <span className="p-engrave flex-1 text-center text-ink-deep text-[0.85rem] sm:text-[0.95rem] tracking-[0.14em] uppercase">
          <span className="hidden sm:inline">The Memory Parlour</span>
          <span className="text-vermilion mx-2 hidden sm:inline">✦</span>
          In play
        </span>

        {action}
      </div>

      <div className="text-center pt-8 pb-8">
        <span
          className={`p-pip ${red ? "p-pip-red" : "p-pip-black"} p-pip-lg inline-block mb-3`}
          aria-hidden="true"
        >
          {rank}
          {suit}
        </span>
        <h1 className="p-display text-[clamp(1.6rem,4.5vw,2.4rem)]">{title}</h1>
        {meta && <p className="p-tick text-ink-soft mt-3">{meta}</p>}
      </div>
    </motion.header>
  );
}
