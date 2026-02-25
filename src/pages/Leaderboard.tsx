import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getLeaderboard } from '../firebase/firestore';
import type { GameType, Difficulty } from '../types/game.types';

const GAMES: { id: GameType; label: string; emoji: string }[] = [
  { id: 'card-flip', label: 'Card Flip', emoji: '🃏' },
  { id: 'number-sequence', label: 'Number Sequence', emoji: '🔢' },
  { id: 'pattern-memory', label: 'Pattern Memory', emoji: '🔲' },
  { id: 'word-match', label: 'Word Match', emoji: '🔤' },
];

const DIFFICULTIES: { id: Difficulty | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '4x4', label: '4×4' },
  { id: '6x6', label: '6×6' },
  { id: '8x8', label: '8×8' },
];

interface LeaderboardEntry {
  id: string;
  uid: string;
  displayName: string;
  score: number;
  moves?: number;
  timeSeconds?: number;
  difficulty?: Difficulty;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const [selectedGame, setSelectedGame] = useState<GameType>('card-flip');
  const [selectedDiff, setSelectedDiff] = useState<Difficulty | 'all'>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const diff = selectedDiff === 'all' ? undefined : selectedDiff;
        const data = await getLeaderboard(selectedGame, diff, 20);
        setEntries(data as LeaderboardEntry[]);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedGame, selectedDiff]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">🏆 Leaderboard</h1>
        <p className="text-slate-400 mb-8">Top players across all games</p>

        {/* Game Selector */}
        <div className="flex gap-2 flex-wrap mb-4">
          {GAMES.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                selectedGame === g.id
                  ? 'border-indigo-500 bg-indigo-600/20 text-white'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>

        {/* Difficulty Filter */}
        <div className="flex gap-2 mb-6">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDiff(d.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                selectedDiff === d.id
                  ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                  : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-white'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="text-4xl">📋</span>
              <p className="text-slate-400">No scores yet. Be the first to play!</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium w-12">Rank</th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Player</th>
                  <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium">Score</th>
                  <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium hidden sm:table-cell">Difficulty</th>
                  <th className="text-right px-4 py-3 text-slate-400 text-xs uppercase tracking-wide font-medium hidden sm:table-cell">Moves</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <motion.tr
                    key={entry.id}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <td className="px-4 py-3 text-center">
                      {i < 3 ? (
                        <span className="text-xl">{MEDAL[i]}</span>
                      ) : (
                        <span className="text-slate-500 text-sm font-medium">#{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-white text-xs font-bold">
                          {entry.displayName?.[0]?.toUpperCase() || 'P'}
                        </div>
                        <span className="text-white text-sm font-medium">{entry.displayName || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-amber-400 font-bold">{entry.score}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className="text-slate-400 text-sm">{entry.difficulty || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className="text-slate-400 text-sm">{entry.moves ?? '—'}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}
