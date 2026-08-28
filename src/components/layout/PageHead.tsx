import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft } from "lucide-react";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface PageHeadProps {
  /** Small vermilion tick above the title, e.g. "Section Two" */
  kicker?: string;
  /** Name of the page, printed in the running head */
  section: string;
  /** The page title, set in the display face */
  title: ReactNode;
  /** One or two sentences under the title */
  lede?: ReactNode;
  /** Anything that belongs at the right of the running head — a restart button, a code */
  action?: ReactNode;
  /** Hide the back control on pages reached straight from the nav */
  hideBack?: boolean;
}

/**
 * The running head every interior page carries: a double rule, the house
 * name and the page's own name — the same strip the front page uses for
 * its masthead, cut down to page size.
 */
export default function PageHead({
  kicker,
  section,
  title,
  lede,
  action,
  hideBack = false,
}: PageHeadProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className="p-masthead">
        {!hideBack && (
          <button onClick={() => navigate(-1)} className="p-icon-btn" aria-label="Go back">
            <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
          </button>
        )}

        <span className="p-engrave flex-1 text-center text-ink-deep text-[0.85rem] sm:text-[0.95rem] tracking-[0.14em] uppercase">
          <span className="hidden sm:inline">The Memory Parlour</span>
          <span className="text-vermilion mx-2 hidden sm:inline">✦</span>
          {section}
        </span>

        {action}
      </div>

      <div className="pt-10 sm:pt-14">
        {kicker && <span className="p-tick text-vermilion">{kicker}</span>}
        <h1 className="p-display text-[clamp(2rem,5vw,3.4rem)] mt-4">{title}</h1>
        {lede && <p className="p-lede mt-6 max-w-[46ch]">{lede}</p>}
      </div>
    </motion.header>
  );
}
