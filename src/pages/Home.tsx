import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const GAMES = [
  {
    id: 'card-flip',
    title: 'Card Flip Match',
    emoji: '🃏',
    description: 'Find matching pairs in the classic concentration game. Single & Multiplayer.',
    tags: ['Single Player', 'Multiplayer'],
    color: 'from-indigo-600 to-purple-600',
    href: '/lobby',
  },
  {
    id: 'number-sequence',
    title: 'Number Sequence',
    emoji: '🔢',
    description: 'Watch the number sequence flash and repeat it from memory. How far can you go?',
    tags: ['Single Player'],
    color: 'from-emerald-600 to-cyan-600',
    href: '/play/number-sequence',
  },
  {
    id: 'pattern-memory',
    title: 'Pattern Memory',
    emoji: '🔲',
    description: 'Observe the highlighted grid pattern and recreate it. Levels get harder!',
    tags: ['Single Player'],
    color: 'from-amber-600 to-orange-600',
    href: '/play/pattern-memory',
  },
  {
    id: 'word-match',
    title: 'Word Match',
    emoji: '🔤',
    description: 'Match words with their pairs hidden under cards. Great for vocabulary!',
    tags: ['Single Player', 'Multiplayer'],
    color: 'from-rose-600 to-pink-600',
    href: '/lobby',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/30 via-slate-900 to-purple-900/20" />
        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-7xl mb-6">🧠</div>
            <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4">
              Memory{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                Games
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-8">
              Challenge your memory with classic games. Play solo, beat your high score, or compete
              with friends in real-time multiplayer.
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <Link
                to="/lobby"
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-lg"
              >
                🎮 Play Now
              </Link>
              <Link
                to="/leaderboard"
                className="px-8 py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all border border-slate-700 text-lg"
              >
                🏆 Leaderboard
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Games Grid */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Classic Memory Games</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {GAMES.map((game, i) => (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
            >
              <Link to={game.href} className="block group">
                <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all duration-200 hover:-translate-y-1 shadow-lg">
                  <div className={`h-24 bg-gradient-to-br ${game.color} flex items-center justify-center text-5xl`}>
                    {game.emoji}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-white text-lg mb-1">{game.title}</h3>
                    <p className="text-slate-400 text-sm mb-3 leading-relaxed">{game.description}</p>
                    <div className="flex gap-2 flex-wrap">
                      {game.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: '🎭', title: 'Multiple Themes', desc: 'Colors, emojis, numbers, animals & symbols' },
            { icon: '👥', title: 'Real-time Multiplayer', desc: 'Create rooms and play with friends live' },
            { icon: '🏆', title: 'Global Leaderboard', desc: 'Compete for top scores on every game' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">{icon}</div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-slate-400 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
