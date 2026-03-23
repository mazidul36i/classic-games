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
        animate={ { rotateY: isRevealed ? 180 : 0, scale: card.isMatched ? 1.03 : 1 } }
        whileHover={ isInteractive ? { y: -4, scale: 1.025 } : undefined }
        whileTap={ isInteractive ? { scale: 0.97 } : undefined }
        transition={ { duration: 0.4, ease: "easeInOut" } }
        style={ { transformStyle: "preserve-3d" } }
      >
        {/* Front (hidden face) */ }
        <div
          className="card-face relative overflow-hidden w-full h-full flex items-center justify-center rounded-xl border border-fuchsia-100/30 bg-[linear-gradient(150deg,#5b2a9d_0%,#2a2f9f_46%,#0f7b8f_100%)] shadow-[0_14px_24px_rgba(4,8,28,0.58)]"
          style={ { backfaceVisibility: "hidden" } }
        >
          <div className="pointer-events-none absolute inset-1 rounded-lg border border-white/20" />
          <div
            className="pointer-events-none absolute inset-0 opacity-40 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.16)_0,rgba(255,255,255,0.16)_8px,transparent_8px,transparent_16px)]" />
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_10%,rgba(255,255,255,0.22)_30%,transparent_50%)]" />
          <div
            className="absolute grid h-[38%] w-[38%] place-items-center rounded-lg border border-white/35 bg-slate-900/25 shadow-[inset_0_1px_8px_rgba(255,255,255,0.2)]">
            <span className="text-[55%] font-bold text-white/90">?</span>
          </div>
        </div>

        {/* Back (revealed face) */ }
        <div
          className={ `card-back card-face relative overflow-hidden w-full h-full flex items-center justify-center rounded-xl border shadow-lg ${
            card.isMatched
              ? "border-cyan-200/75 bg-[linear-gradient(155deg,#152238_0%,#17365a_52%,#104d63_100%)] shadow-[0_0_0_1px_rgba(56,189,248,0.28),0_12px_24px_rgba(2,6,23,0.45)]"
              : "border-slate-300/25 bg-[linear-gradient(155deg,#111b33_0%,#1a2a49_52%,#22355c_100%)] shadow-[0_12px_20px_rgba(2,6,23,0.42)]"
          }` }
          style={ { backfaceVisibility: "hidden", transform: "rotateY(180deg)" } }
        >
          <div className="pointer-events-none absolute inset-0.75 rounded-[10px] border border-cyan-100/18" />
          <div
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.14),transparent_42%)]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-18 bg-[linear-gradient(rgba(148,163,184,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.5)_1px,transparent_1px)] bg-size-[9px_9px]" />
          { card.color ? (
            <div
              className="h-[58%] w-[58%] rounded-full border-2 border-white/55 shadow-[0_8px_16px_rgba(0,0,0,0.24)]"
              style={ {
                backgroundColor: card.color,
                boxShadow: `inset 0 0 0 3px rgba(255,255,255,0.2), 0 8px 16px rgba(2,6,23,0.35)`,
              } }
            />
          ) : (
            <span
              className={ `${ valueTextClass || (sizeClass.includes("text") ? "" : "text-3xl") } leading-none font-black ${ card.isMatched ? "text-cyan-200" : "text-slate-100" } drop-shadow-[0_2px_8px_rgba(2,6,23,0.6)]` }
            >
              { card.value }
            </span>
          ) }
        </div>
      </motion.div>
    </div>
  );
}
