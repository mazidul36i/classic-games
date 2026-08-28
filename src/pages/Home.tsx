import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  Layers,
  Hash,
  Grid3X3,
  Type as WordIcon,
  Trophy,
  Users,
  Palette,
  ArrowRight,
  ArrowUpRight,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
   THE MEMORY PARLOUR
   A letterpress broadsheet for a house of four diversions.
   ───────────────────────────────────────────────────────── */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GAMES = [
  {
    id: "card-flip",
    rank: "A",
    suit: "♠",
    red: false,
    no: "No. 01",
    title: "Card Flip Match",
    discipline: "Concentration",
    description:
      "Turn two, hold the picture, turn again. The oldest test of a steady memory — alone or against a rival.",
    tags: ["Solo", "Table for two"],
    icon: Layers,
    href: "/lobby/card-flip",
  },
  {
    id: "number-sequence",
    rank: "K",
    suit: "♦",
    red: true,
    no: "No. 02",
    title: "Number Sequence",
    discipline: "Order",
    description:
      "Digits arrive, then vanish. Return them in the order they were dealt, one longer with every round survived.",
    tags: ["Solo"],
    icon: Hash,
    href: "/lobby/number-sequence",
  },
  {
    id: "pattern-memory",
    rank: "Q",
    suit: "♣",
    red: false,
    no: "No. 03",
    title: "Pattern Memory",
    discipline: "Place",
    description:
      "A grid lights up and goes dark. Where it fell is the whole question — a study in spatial recall.",
    tags: ["Solo"],
    icon: Grid3X3,
    href: "/lobby/pattern-memory",
  },
  {
    id: "word-match",
    rank: "J",
    suit: "♥",
    red: true,
    no: "No. 04",
    title: "Word Match",
    discipline: "Lexicon",
    description:
      "Pair the words before the words pair you. A quiet duel of vocabulary and nerve.",
    tags: ["Solo", "Table for two"],
    icon: WordIcon,
    href: "/lobby/word-match",
  },
] as const;

const HOUSE_RULES = [
  {
    numeral: "01",
    icon: Users,
    kicker: "The Table",
    title: "Two seats, one deck",
    body: "Open a private room, pass the link, and both hands stay in step. Every flip lands on the other screen the moment it happens.",
  },
  {
    numeral: "02",
    icon: Trophy,
    kicker: "The Ledger",
    title: "Every score recorded",
    body: "Runs are written down and ranked across all four games. The standings keep an honest account of who is sharpest this week.",
  },
  {
    numeral: "03",
    icon: Palette,
    kicker: "The House",
    title: "Dressed to your taste",
    body: "Choose the deck you play with — plain colours, bold symbols, or something louder. The rules never change; the face of them does.",
  },
];

const DECK = [
  { label: "Concentration", suit: "♠", red: false, icon: Layers },
  { label: "Sequence", suit: "♦", red: true, icon: Hash },
  { label: "Pattern", suit: "♣", red: false, icon: Grid3X3 },
];

const DECK_LAYOUT = [
  { rotate: -14, x: "-88%", y: "-44%", z: 1 },
  { rotate: -1, x: "-50%", y: "-56%", z: 3 },
  { rotate: 13, x: "-12%", y: "-42%", z: 2 },
];

const MARQUEE_WORDS = [
  "Concentration",
  "Sequence",
  "Pattern",
  "Lexicon",
  "Solo Play",
  "Live Rooms",
  "Standings",
];

/* ─── Hero deck: three fanned cards, each taking its turn face-up ─── */
function HeroDeck() {
  const [faceUp, setFaceUp] = useState(1);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setFaceUp((prev) => (prev + 1) % DECK.length);
    }, 3400);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="p-deck relative w-full aspect-[7/6] max-w-[520px] mx-auto">
      {/* Halftone medallion sitting behind the hand */}
      <div
        className="p-halftone absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] aspect-square rounded-full text-vermilion opacity-[0.22]"
        style={{ maskImage: "radial-gradient(circle, #000 38%, transparent 71%)", WebkitMaskImage: "radial-gradient(circle, #000 38%, transparent 71%)" }}
        aria-hidden="true"
      />
      <span
        className="p-display absolute -top-6 -right-2 text-[11rem] leading-none text-ink-deep/[0.06] select-none pointer-events-none"
        aria-hidden="true"
      >
        ♠
      </span>

      {DECK.map((card, i) => {
        const layout = DECK_LAYOUT[i];
        const Icon = card.icon;
        const up = faceUp === i;
        return (
          /* Placement is plain CSS (framer-motion can't tween calc()); the
             motion layer only handles the lift, the fan and the turn. */
          <div
            key={card.label}
            className="absolute left-1/2 top-1/2 w-[46%] aspect-[5/7]"
            style={{
              transform: `translate(${layout.x}, ${layout.y})`,
              zIndex: up ? 10 : layout.z,
            }}
          >
            <motion.button
              type="button"
              onClick={() => setFaceUp(i)}
              aria-label={`Turn over the ${card.label} card`}
              className="absolute inset-0 cursor-pointer rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vermilion"
              style={{ transformStyle: "preserve-3d" }}
              initial={reduce ? false : { opacity: 0, y: 70, rotate: 0 }}
              animate={{
                opacity: 1,
                y: 0,
                rotate: layout.rotate + (up ? -layout.rotate * 0.45 : 0),
                scale: up ? 1.06 : 1,
                rotateY: up ? 180 : 0,
              }}
              transition={{
                opacity: { duration: 0.7, delay: 0.35 + i * 0.12, ease: EASE },
                y: { duration: 0.9, delay: 0.35 + i * 0.12, ease: EASE },
                rotateY: { duration: 0.85, ease: EASE },
                default: { duration: 0.75, ease: EASE },
              }}
            >
              <div className="p-deck-face p-deck-back" />
              <div className="p-deck-face p-deck-front">
                <span
                  className={`p-engrave text-4xl ${card.red ? "text-vermilion" : "text-ink-deep"}`}
                >
                  {card.suit}
                </span>
                <Icon className="w-9 h-9 text-ink-deep" strokeWidth={1.25} />
                <span className="p-tick text-ink-soft">{card.label}</span>
              </div>
            </motion.button>
          </div>
        );
      })}
    </div>
  );
}

/* ─── One game, printed as a playing card ─── */
function GameCard({ game, index }: { game: (typeof GAMES)[number]; index: number }) {
  const Icon = game.icon;
  const reduce = useReducedMotion();
  const pipTone = game.red ? "p-pip-red" : "p-pip-black";

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 34 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: index * 0.09, ease: EASE }}
      className="h-full"
    >
      <Link to={game.href} className="p-card-link block h-full rounded-xl group">
        <article className="p-card h-full px-7 pt-7 pb-8">
          {/* Corner index — top-left upright, bottom-right inverted, as printed */}
          <div className={`p-pip ${pipTone} absolute top-4 left-4 z-10`}>
            <div>{game.rank}</div>
            <div className="text-[0.8em]">{game.suit}</div>
          </div>
          <div className={`p-pip ${pipTone} absolute bottom-4 right-4 rotate-180 z-10`}>
            <div>{game.rank}</div>
            <div className="text-[0.8em]">{game.suit}</div>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center h-full pt-6">
            <span className="p-tick text-ink-soft mb-6">{game.no}</span>

            <div className="p-medallion mb-7">
              <Icon className="w-8 h-8 text-ink-deep" strokeWidth={1.25} />
            </div>

            <h3 className="p-card-title p-display text-[1.3rem] leading-tight mb-2 group-hover:text-vermilion transition-colors duration-300">
              {game.title}
            </h3>
            <p className="p-tick text-vermilion mb-5">{game.discipline}</p>

            <p className="text-[0.95rem] leading-[1.7] text-ink-soft mb-7 max-w-[260px]">
              {game.description}
            </p>

            <div className="mt-auto flex flex-wrap gap-2 justify-center">
              {game.tags.map((tag) => (
                <span key={tag} className="p-tag">
                  {tag}
                </span>
              ))}
            </div>

            <span className="p-tick mt-7 inline-flex items-center gap-2 text-ink-deep opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              Deal <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}

export default function Home() {
  const reduce = useReducedMotion();

  return (
    <div className="parlour">
      <div className="parlour-paper" aria-hidden="true" />

      <div className="relative z-10">
        {/* ━━━ MASTHEAD ━━━ */}
        <div className="max-w-[1180px] mx-auto px-6 sm:px-10 pt-8">
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="p-rule-double pt-3 flex items-center justify-between gap-4 text-ink-soft"
          >
            <span className="p-tick hidden sm:block">Est. MMXXVI</span>
            <span className="p-engrave text-center flex-1 text-ink-deep text-[0.95rem] tracking-[0.14em] uppercase">
              The Memory Parlour
              <span className="hidden xs:inline">
                <span className="text-vermilion mx-2">✦</span>
                A House of Four Diversions
              </span>
            </span>
            <span className="p-tick hidden sm:block">Vol. I</span>
          </motion.div>
          <div className="p-rule mt-3" />
        </div>

        {/* ━━━ HERO ━━━ */}
        <section className="max-w-[1180px] mx-auto px-6 sm:px-10 pt-14 sm:pt-20 pb-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            <motion.div
              className="lg:col-span-7"
              initial={reduce ? false : { opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, ease: EASE }}
            >
              <div className="flex items-center gap-3 mb-8">
                <span className="w-2 h-2 bg-vermilion rotate-45" aria-hidden="true" />
                <span className="p-tick text-ink-soft">Games of Recollection</span>
              </div>

              <h1 className="p-display text-[clamp(2.5rem,6.6vw,5.1rem)] mb-8">
                Sharpen the mind,
                <br />
                one card
                <br />
                <span className="text-vermilion">at a time.</span>
              </h1>

              <div className="p-rule pt-7 max-w-[34rem]">
                <p className="p-lede p-dropcap">
                  Four small games, each built around a single question — how much can you hold?
                  Play a hand on your own, or open a room and put a friend across the table.
                  No download, no ceremony. The deck is already shuffled.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-9 gap-y-5 mt-10">
                <Link to="/lobby/card-flip" className="p-btn p-btn-solid">
                  Deal me in
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link to="/leaderboard" className="p-link text-ink-deep">
                  Read the standings
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Running heads */}
              <div className="p-rule mt-12 pt-6 grid grid-cols-3 max-w-[34rem]">
                {[
                  { n: "IV", l: "Diversions" },
                  { n: "II", l: "Ways to play" },
                  { n: "∞", l: "Rounds" },
                ].map((stat, i) => (
                  <div key={stat.l} className={i > 0 ? "p-hair-v pl-5" : "pr-5"}>
                    <div className="p-display text-[2.15rem] leading-none mb-2">{stat.n}</div>
                    <div className="p-tick text-ink-soft">{stat.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="lg:col-span-5">
              <HeroDeck />
            </div>
          </div>
        </section>

        {/* ━━━ MARQUEE BAND ━━━ */}
        <div className="bg-ink-deep text-paper py-4 overflow-hidden select-none" aria-hidden="true">
          <div className="p-marquee">
            {[0, 1].map((seg) => (
              <div className="p-marquee-seg" key={seg}>
                {MARQUEE_WORDS.map((word) => (
                  <span key={word} className="p-fair text-[0.95rem] uppercase flex items-center gap-11">
                    {word}
                    <span className="text-vermilion text-[1rem] leading-none">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ━━━ THE HAND ━━━ */}
        <section className="max-w-[1180px] mx-auto px-6 sm:px-10 pt-20 sm:pt-28 pb-16 sm:pb-24">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
            className="p-rule pt-6 mb-14 grid grid-cols-1 md:grid-cols-12 gap-6 items-end"
          >
            <div className="md:col-span-4">
              <span className="p-tick text-vermilion">Section One</span>
              <p className="p-tick text-ink-soft mt-3">The Hand</p>
            </div>
            <h2 className="md:col-span-8 p-display text-[clamp(1.9rem,3.7vw,2.9rem)]">
              Four games,
              <br />
              four disciplines.
            </h2>
          </motion.div>

          <div className="p-hand grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-5">
            {GAMES.map((game, i) => (
              <GameCard key={game.id} game={game} index={i} />
            ))}
          </div>
        </section>

        {/* ━━━ HOUSE RULES ━━━ */}
        <section className="max-w-[1180px] mx-auto px-6 sm:px-10 py-16 sm:py-24">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
            className="p-rule pt-6 mb-14 grid grid-cols-1 md:grid-cols-12 gap-6 items-end"
          >
            <div className="md:col-span-4">
              <span className="p-tick text-vermilion">Section Two</span>
              <p className="p-tick text-ink-soft mt-3">House Rules</p>
            </div>
            <h2 className="md:col-span-8 p-display text-[clamp(1.9rem,3.7vw,2.9rem)]">
              What the house
              <br />
              provides.
            </h2>
          </motion.div>

          <div className="p-rules-row grid grid-cols-1 md:grid-cols-3">
            {HOUSE_RULES.map((rule, i) => {
              const Icon = rule.icon;
              return (
                <motion.div
                  key={rule.numeral}
                  initial={reduce ? false : { opacity: 0, y: 28 }}
                  whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.7, delay: i * 0.12, ease: EASE }}
                  className="p-rule-item group"
                >
                  <div className="flex items-baseline justify-between mb-7">
                    <span className="p-numeral">{rule.numeral}</span>
                    <Icon
                      className="w-6 h-6 text-ink-soft group-hover:text-vermilion transition-colors duration-500"
                      strokeWidth={1.25}
                    />
                  </div>
                  <span className="p-tick text-vermilion">{rule.kicker}</span>
                  <h3 className="p-display text-[1.35rem] leading-snug mt-4 mb-4">{rule.title}</h3>
                  <p className="text-[0.95rem] leading-[1.75] text-ink-soft max-w-[24rem]">{rule.body}</p>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ━━━ THE TABLE (CTA) ━━━ */}
        <section className="max-w-[1180px] mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 32 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: EASE }}
            className="p-felt rounded-sm px-8 sm:px-16 py-16 sm:py-24 text-center"
          >
            <div className="relative z-10 flex flex-col items-center">
              <div className="p-suits flex items-center gap-4 mb-9 text-[1.35rem]" aria-hidden="true">
                <span className="text-paper/70">♠</span>
                <span className="text-vermilion">♥</span>
                <span className="text-vermilion">♦</span>
                <span className="text-paper/70">♣</span>
              </div>

              <h2 className="p-display text-[clamp(2rem,4.4vw,3.5rem)] mb-7 leading-[1.1]">
                The table is set.
                <br />
                Take a seat.
              </h2>

              <p className="text-paper/75 text-[1.0625rem] leading-[1.7] max-w-[42ch] mb-11">
                No account, no setup, no waiting. Pick a game and the first hand is dealt in seconds.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-5">
                <Link to="/lobby/card-flip" className="p-btn p-btn-cream">
                  Play a hand
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  to="/register"
                  className="p-link text-paper/80 hover:text-paper"
                  style={{ backgroundImage: "linear-gradient(#f2ece1, #f2ece1)" }}
                >
                  Keep your scores
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
