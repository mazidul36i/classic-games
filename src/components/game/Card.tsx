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

/** One card from the house deck: crosshatch back, parchment face. */
export default function Card({ card, onClick, size = "md", disabled = false }: CardProps) {
  const sizeClass = sizeMap[size];
  const valueTextClass = size === "fluid" ? "text-[length:calc(var(--card-size)*0.45)]" : "";
  const isRevealed = card.isFlipped || card.isMatched;
  const isInteractive = !disabled && !isRevealed;

  const handleClick = () => {
    if (!disabled && !card.isFlipped && !card.isMatched) {
      onClick(card.id);
    }
  };

  return (
    <div
      className={ `card-scene ${ sizeClass } select-none ${ isInteractive ? "cursor-pointer" : "cursor-default" }` }
      onClick={ handleClick }
    >
      <motion.div
        className="card-inner w-full h-full"
        initial={ false }
        animate={ { rotateY: isRevealed ? 180 : 0, scale: card.isMatched ? 1.02 : 1 } }
        whileHover={ isInteractive ? { y: -5 } : undefined }
        whileTap={ isInteractive ? { scale: 0.97 } : undefined }
        transition={ { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
        style={ { transformStyle: "preserve-3d" } }
      >
        {/* Face down — the vermilion crosshatch every deck in the house wears */ }
        <div className="p-pc-face p-pc-down" />

        {/* Face up — parchment, and felt-green once the pair is claimed */ }
        <div className={ `p-pc-face p-pc-up ${ card.isMatched ? "p-pc-matched" : "" }` }>
          { card.color ? (
            <span
              className="h-[52%] w-[52%] rounded-full border border-ink-deep/45"
              style={ { backgroundColor: card.color } }
            />
          ) : (
            <span className={ `${ valueTextClass } leading-none` }>{ card.value }</span>
          ) }
        </div>
      </motion.div>
    </div>
  );
}
