import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const GAMES = [
  {
    id: "card-flip",
    title: "Card Flip Match",
    badge: "CF",
    description: "Find matching pairs in a polished concentration game. Single and multiplayer.",
    tags: ["Single Player", "Multiplayer"],
    tone: "from-teal-500/30 to-cyan-500/10",
    href: "/lobby",
  },
  {
    id: "number-sequence",
    title: "Number Sequence",
    badge: "NS",
    description: "Memorize the flashing sequence and repeat it. Push your streak higher.",
    tags: ["Single Player"],
    tone: "from-sky-500/30 to-blue-500/10",
    href: "/play/number-sequence",
  },
  {
    id: "pattern-memory",
    title: "Pattern Memory",
    badge: "PM",
    description: "Study the grid pattern and recreate it. Levels scale fast.",
    tags: ["Single Player"],
    tone: "from-amber-500/35 to-orange-500/10",
    href: "/play/pattern-memory",
  },
  {
    id: "word-match",
    title: "Word Match",
    badge: "WM",
    description: "Match word pairs hidden under cards. Great for vocabulary practice.",
    tags: ["Single Player", "Multiplayer"],
    tone: "from-rose-500/30 to-red-500/10",
    href: "/lobby",
  },
];

const FEATURES = [
  {
    tag: "THEMES",
    title: "Multiple Themes",
    desc: "Colors, emojis, numbers, animals, and symbols with fresh layouts.",
  },
  {
    tag: "REALTIME",
    title: "Live Multiplayer",
    desc: "Create rooms and compete with friends using instant updates.",
  },
  {
    tag: "RANKED",
    title: "Global Leaderboard",
    desc: "Track high scores and climb the rankings per game and difficulty.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */ }
      <section className="relative overflow-hidden pt-10 pb-12 sm:pt-16 md:pt-20 sm:pb-16">
        <div className="relative w-full max-w-5xl mx-auto px-6 sm:px-8 text-center">
          <motion.div
            initial={ { opacity: 0, y: 30 } }
            animate={ { opacity: 1, y: 0 } }
            transition={ { duration: 0.6 } }
          >
            <div className="flex items-center justify-center mb-6">
              <span className="badge mono">MEMORY LAB</span>
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-5 leading-tight">
              Memory{ " " }
              <span className="text-transparent bg-clip-text bg-linear-to-r from-teal-300 to-cyan-300">
                Games
              </span>
            </h1>
            <p
              className="text-base sm:text-lg text-text-muted max-w-xl mx-auto mb-10 leading-relaxed">
              Train focus and recall with refined classics. Play solo, beat your best
              time, or go head-to-head in multiplayer rooms.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                to="/lobby"
                className="btn btn-primary px-8 py-3.5 text-base"
              >
                Play Now
              </Link>
              <Link
                to="/leaderboard"
                className="btn btn-ghost px-8 py-3.5 text-base"
              >
                View Leaderboard
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Games Grid Section */ }
      <section className="w-full max-w-5xl mx-auto px-6 sm:px-8 py-12 sm:py-16">
        <h2 className="text-2xl font-bold text-white mb-10 text-center">
          Classic Memory Games, Refined
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          { GAMES.map((game, i) => (
            <motion.div
              key={ game.id }
              className="flex"
              initial={ { opacity: 0, y: 20 } }
              animate={ { opacity: 1, y: 0 } }
              transition={ { delay: i * 0.1, duration: 0.5 } }
            >
              <Link to={ game.href } className="flex flex-1">
                <div className="card overflow-hidden flex flex-col flex-1">
                  <div className={ `h-24 bg-linear-to-br ${ game.tone } flex items-center justify-center shrink-0` }>
                    <span className="logo-mark">{ game.badge }</span>
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="font-bold text-white text-base mb-2">{ game.title }</h3>
                    <p className="text-text-muted text-sm leading-relaxed flex-1 mb-4">
                      { game.description }
                    </p>
                    <div className="flex gap-2 flex-wrap mt-auto">
                      { game.tags.map((tag) => (
                        <span
                          key={ tag }
                          className="chip"
                        >
                          { tag }
                        </span>
                      )) }
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          )) }
        </div>
      </section>

      {/* Features Section */ }
      <section className="w-full max-w-5xl mx-auto px-6 sm:px-8 pt-4 pb-16 sm:pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          { FEATURES.map(({ tag, title, desc }, i) => (
            <motion.div
              key={ title }
              initial={ { opacity: 0, y: 15 } }
              animate={ { opacity: 1, y: 0 } }
              transition={ { delay: 0.4 + i * 0.1, duration: 0.5 } }
            >
              <div className="surface-soft p-6 text-center rounded-2xl h-full">
                <div className="flex items-center justify-center mb-4">
                  <span className="badge mono">{ tag }</span>
                </div>
                <h3 className="font-semibold text-white mb-2">{ title }</h3>
                <p className="text-text-muted text-sm leading-relaxed">{ desc }</p>
              </div>
            </motion.div>
          )) }
        </div>
      </section>
    </div>
  );
}
