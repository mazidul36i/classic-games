import { motion } from "framer-motion";
import type { CardItem } from "../../types/game.types";

interface CardProps {
  card: CardItem;
  onClick: (id: string) => void;
  size?: "sm" | "md" | "lg" | "fluid";
  disabled?: boolean;
}

const sizeMap = {
  sm: "w-14 h-14 text-xl",
  md: "w-20 h-20 text-3xl",
  lg: "w-24 h-24 text-4xl",
  fluid: "card-fluid",
};

export default function Card({ card, onClick, size = "md", disabled = false }: CardProps) {
  const sizeClass = sizeMap[size];
  const valueTextClass =
    size === "fluid" ? "text-[length:calc(var(--card-size)*0.45)]" : "";
  const isRevealed = card.isFlipped || card.isMatched;

  const handleClick = () => {
    if (!disabled && !card.isFlipped && !card.isMatched) {
      onClick(card.id);
    }
  };

  return (
    <div
      className={ `card-scene ${ sizeClass } cursor-pointer select-none` }
      onClick={ handleClick }
    >
      <motion.div
        className="card-inner w-full h-full"
        initial={ false }
        animate={ { rotateY: isRevealed ? 180 : 0 } }
        transition={ { duration: 0.45, ease: "easeInOut" } }
        style={ { transformStyle: "preserve-3d" } }
      >
        {/* Front (hidden face) */ }
        <div
          className="card-face w-full h-full flex items-center justify-center rounded-xl border-2 border-slate-600 bg-linear-to-br from-indigo-800 to-slate-800 shadow-lg"
          style={ { backfaceVisibility: "hidden" } }
        >
          <span
            className={
              size === "fluid"
                ? "text-[length:calc(var(--card-size)*0.35)] opacity-40"
                : "text-2xl opacity-40"
            }
          >
            ❓
          </span>
        </div>

        {/* Back (revealed face) */ }
        <div
          className={ `card-back card-face w-full h-full flex items-center justify-center rounded-xl border-2 shadow-lg
            ${ card.isMatched
            ? "border-emerald-500 bg-emerald-900/60"
            : "border-indigo-400 bg-slate-800"
          }` }
          style={ { backfaceVisibility: "hidden", transform: "rotateY(180deg)" } }
        >
          { card.color ? (
            <div
              className="w-10 h-10 rounded-full shadow-md"
              style={ { backgroundColor: card.color } }
            />
          ) : (
            <span className={ `${ valueTextClass || (sizeClass.includes("text") ? "" : "text-3xl") } leading-none` }>
              { card.value }
            </span>
          ) }
        </div>
      </motion.div>
    </div>
  );
}


