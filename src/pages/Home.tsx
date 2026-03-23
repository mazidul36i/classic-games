import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Gamepad2,
  Palette,
  Users,
  Trophy,
  Zap,
  Sparkles,
  ArrowRight,
  Layers,
  Hash,
  Grid3X3 as GridIcon,
  Type as WordIcon,
} from "lucide-react";

/* ─── DATA ─── */
const GAMES = [
  {
    id: "card-flip",
    title: "Card Flip Match",
    icon: Layers,
    description:
      "Find matching pairs in a polished concentration game. Single and multiplayer.",
    tags: ["Single Player", "Multiplayer"],
    gradient: "from-teal-500/25 to-cyan-600/10",
    glowColor: "rgba(0, 194, 168, 0.15)",
    href: "/lobby/card-flip",
  },
  {
    id: "number-sequence",
    title: "Number Sequence",
    icon: Hash,
    description:
      "Memorize the flashing sequence and repeat it. Push your streak higher.",
    tags: ["Single Player"],
    gradient: "from-sky-500/25 to-blue-600/10",
    glowColor: "rgba(56, 189, 248, 0.15)",
    href: "/lobby/number-sequence",
  },
  {
    id: "pattern-memory",
    title: "Pattern Memory",
    icon: GridIcon,
    description: "Study the grid pattern and recreate it. Levels scale fast.",
    tags: ["Single Player"],
    gradient: "from-amber-500/30 to-orange-600/10",
    glowColor: "rgba(245, 165, 36, 0.15)",
    href: "/lobby/pattern-memory",
  },
  {
    id: "word-match",
    title: "Word Match",
    icon: WordIcon,
    description:
      "Match word pairs hidden under cards. Great for vocabulary practice.",
    tags: ["Single Player", "Multiplayer"],
    gradient: "from-rose-500/25 to-pink-600/10",
    glowColor: "rgba(244, 63, 94, 0.15)",
    href: "/lobby/word-match",
  },
];

const STATS = [
  { icon: Gamepad2, label: "Games", value: "4" },
  { icon: Palette, label: "Themes", value: "5+" },
  { icon: Users, label: "Multiplayer", value: "Real-time" },
  { icon: Trophy, label: "Leaderboard", value: "Global" },
];

const FEATURES = [
  {
    icon: Palette,
    tag: "THEMES",
    title: "Multiple Themes",
    desc: "Colors, emojis, numbers, animals, and symbols with fresh layouts every round.",
  },
  {
    icon: Users,
    tag: "REALTIME",
    title: "Live Multiplayer",
    desc: "Create private rooms and compete with friends using instant real-time updates.",
  },
  {
    icon: Trophy,
    tag: "RANKED",
    title: "Global Leaderboard",
    desc: "Track high scores and climb the rankings across every game and difficulty.",
  },
];



/* ─── ANIMATION VARIANTS ─── */
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};



const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.2, 0.8, 0.2, 1] as any }
  },
};

const GlassTile = ({ game }: { game: typeof GAMES[0] }) => {
  const Icon = game.icon;
  const cardRef = import.meta.env.SSR ? null : (el: HTMLDivElement | null) => {
    if (!el) return;
    el.addEventListener("mousemove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      el.style.setProperty("--mouse-x", `${x}px`);
      el.style.setProperty("--mouse-y", `${y}px`);
    });
  };

  return (
    <motion.div variants={cardVariants} className="flex h-full">
      <Link to={game.href} className="flex flex-1 group h-full">
        <div
          ref={cardRef as any}
          className="glass-tile flex-1"
        >
          {/* Background Glow Orb */}
          <div className={`bento-glow-orb ${game.id === 'card-flip' ? 'bento-glow-teal' : game.id === 'number-sequence' ? 'bento-glow-indigo' : game.id === 'pattern-memory' ? 'bento-glow-amber' : 'bento-glow-rose'} w-64 h-64 -bottom-20 -right-20 opacity-20 group-hover:opacity-40 transition-opacity duration-700`} />

          <div className="glow-ring relative z-10">
            <Icon className="w-10 h-10 text-white group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <h3 className="font-extrabold text-white text-2xl mb-4 group-hover:text-highlight transition-colors tracking-tight">
              {game.title}
            </h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-[240px]">
              {game.description}
            </p>
            <div className="flex gap-2 flex-wrap justify-center mt-auto">
              {game.tags.map((tag) => (
                <span key={tag} className="chip bg-white/5 border border-white/10 text-white/70 px-4 py-1.5 text-xs font-bold uppercase tracking-widest group-hover:border-highlight/40 group-hover:text-highlight transition-all">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

/* ─── COMPONENT ─── */
export default function Home() {
  return (
    <div className="relative min-h-screen bg-ink overflow-x-hidden">
      <div className="app-background" />

      {/* ━━━ HERO SECTION ━━━ */}
      <section className="relative pt-24 sm:pt-32 pb-12 sm:pb-20 z-10">
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

            {/* Main Featured Bento */}
            <motion.div
              className="lg:col-span-8 bento-card bento-noise bento-gradient-primary group p-10 sm:p-16 flex flex-col justify-center relative min-h-[500px]"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="bento-glow-orb bento-glow-teal w-[500px] h-[500px] -top-32 -left-32 opacity-30 group-hover:opacity-50 transition-all duration-1000" />

              <div className="relative z-10">
                <span className="badge mono text-xs mb-6 inline-flex bg-accent/10 border-accent/20 text-accent font-bold px-4 py-1.5 uppercase tracking-[0.2em]">
                  Memory Lab v2.0
                </span>
                <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-white mb-8 leading-[0.9] tracking-tighter">
                  Train Your <br />
                  <span className="bento-title-gradient">Memory</span>
                </h1>
                <p className="text-xl text-slate-400 mb-10 max-w-lg leading-relaxed font-medium">
                  A high-performance laboratory for cognitive training. Master focus through immersive minimalist games.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    to="/lobby/card-flip"
                    className="btn btn-primary btn-primary-pulse px-10 py-5 rounded-2xl text-lg font-bold flex items-center gap-3 shadow-[0_0_40px_rgba(0,194,168,0.3)]"
                  >
                    Start Training
                    <Zap className="w-5 h-5 fill-current" />
                  </Link>
                </div>
              </div>
            </motion.div>

            {/* Side Bento Column */}
            <div className="lg:col-span-4 flex flex-col gap-6">

              {/* Leaderboard Preview */}
              <motion.div
                className="flex-1 bento-card bento-noise group p-8 flex flex-col justify-between"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="bento-glow-orb bento-glow-amber w-64 h-64 -top-10 -right-10 group-hover:scale-125 transition-transform duration-700" />
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 shadow-lg">
                    <Trophy className="w-7 h-7 text-amber-500" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Global Rank</h3>
                  <p className="text-slate-400 text-sm font-medium leading-relaxed">Compete with thousands of players worldwide.</p>
                </div>
                <Link to="/leaderboard" className="relative z-10 mt-6 text-amber-500 font-bold text-sm inline-flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                  View Leaderboard <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.div>

              {/* Multiplayer Banner */}
              <motion.div
                className="flex-1 bento-card bento-noise group p-8 relative"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="bento-glow-orb bento-glow-indigo w-64 h-64 -top-10 -left-10 group-hover:scale-110 transition-transform duration-700" />

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div className="flex -space-x-4 mb-4">
                     <div className="w-12 h-12 rounded-full border-2 border-[#0f1630] bg-indigo-500 flex items-center justify-center text-xs font-black text-white shadow-xl z-30">P1</div>
                     <div className="w-12 h-12 rounded-full border-2 border-[#0f1630] bg-teal-500 flex items-center justify-center text-xs font-black text-white shadow-xl z-20">P2</div>
                     <div className="w-12 h-12 rounded-full border-2 border-[#0f1630] bg-cyan-500 flex items-center justify-center text-xs font-black text-white shadow-xl z-10">P3</div>
                  </div>

                  <div>
                    <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Multiplayer</h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">Challenge friends in real-time matches.</p>
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </div>
      </section>

      {/* ━━━ STATS BAR ━━━ */}
      <section className="w-full max-w-5xl mx-auto px-6 sm:px-8 -mt-2 mb-10 sm:mb-16">
        <motion.div
          className="bento-card bento-noise relative overflow-hidden px-6 py-5 sm:px-10 sm:py-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          {/* Subtle glow for the stats bar */}
          <div className="absolute inset-0 bg-linear-to-r from-transparent via-highlight/5 to-transparent pointer-events-none" />
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-4 relative z-10">
            {STATS.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex flex-col items-center text-center gap-1.5"
              >
                <Icon className="w-6 h-6 text-highlight mb-1 drop-shadow-[0_0_12px_rgba(0,194,168,0.4)]" />
                <span className="text-xl sm:text-2xl font-bold text-white">
                  {value}
                </span>
                <span className="text-xs text-text-muted mono uppercase tracking-wider font-semibold">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ━━━ GAMES BENTO GRID ━━━ */}
      <section className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-12 sm:py-24">
        <motion.div
          className="text-center mb-16 relative"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="badge mono text-xs mb-4 inline-block font-black tracking-[0.3em] text-highlight bg-highlight/5 border-highlight/20">
            SYSTEM CORE
          </span>
          <h2 className="text-4xl sm:text-6xl font-black text-white tracking-tighter relative z-10">
            Available <span className="text-highlight drop-shadow-[0_0_20px_rgba(110,231,255,0.3)]">Protocols</span>
          </h2>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {GAMES.map((game) => (
            <GlassTile key={game.id} game={game} />
          ))}
        </motion.div>
      </section>

      {/* ━━━ FEATURES BENTO ━━━ */}
      <section className="w-full max-w-7xl mx-auto px-6 sm:px-8 py-12 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {FEATURES.map(({ icon: Icon, tag, title, desc }) => (
            <motion.div 
              key={title} 
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="bento-card bento-noise p-10 flex flex-col items-center text-center group"
            >
              <div className="w-20 h-20 rounded-[2.5rem] bg-linear-to-br from-accent/20 to-highlight/10 flex items-center justify-center mb-8 border border-white/10 group-hover:scale-110 group-hover:border-accent/30 transition-all duration-500 shadow-2xl">
                <Icon className="w-10 h-10 text-accent" />
              </div>
              <span className="badge mono text-[10px] mb-4 font-black tracking-[0.2em]">{tag}</span>
              <h3 className="font-black text-white text-2xl mb-4 tracking-tight group-hover:text-accent transition-colors">
                {title}
              </h3>
              <p className="text-slate-400 text-base leading-relaxed font-medium">
                {desc}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━ BOTTOM CTA ━━━ */}
      <section className="w-full max-w-7xl mx-auto px-6 sm:px-8 pb-16 sm:pb-32">
        <motion.div
          className="bento-card bento-noise bento-gradient-primary border-t border-l border-white/20 p-16 sm:p-24 text-center relative overflow-hidden group shadow-[0_40px_100px_-15px_rgba(0,0,0,0.7)]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Background massive glow floating orb */}
          <div className="absolute inset-0 bento-glow-orb bento-glow-indigo w-full h-full scale-150 opacity-20 pointer-events-none group-hover:scale-[1.6] group-hover:opacity-40 transition-all duration-1000" />
          
          <div className="absolute top-0 right-0 w-96 h-96 bg-highlight/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent/10 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 shadow-2xl backdrop-blur-xl">
              <Sparkles className="w-10 h-10 text-highlight drop-shadow-[0_0_20px_rgba(110,231,255,0.6)]" />
            </div>
            
            <h2 className="text-4xl sm:text-7xl font-black text-white mb-8 tracking-tighter max-w-2xl leading-[0.9]">
              Elevate Your <span className="gradient-text">Cognitive</span> Baseline.
            </h2>
            <p className="text-slate-300 text-lg sm:text-2xl mb-12 max-w-2xl mx-auto leading-relaxed font-medium opacity-80">
              Start your journey today. No signup, no friction. Just peak performance.
            </p>
            <Link
              to="/lobby/card-flip"
              className="btn btn-primary btn-primary-pulse px-16 py-6 rounded-2xl text-xl font-black inline-flex items-center gap-4 shadow-[0_20px_50px_rgba(0,194,168,0.4)] hover:shadow-[0_20px_70px_rgba(0,194,168,0.6)] transition-all"
            >
              Initialize Training
              <ArrowRight className="w-7 h-7 transition-transform group-hover:translate-x-3" />
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
