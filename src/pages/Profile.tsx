import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getUserGameHistory } from '../firebase/firestore';
import type { GameResult } from '../types/game.types';

const GAME_EMOJI: Record<string, string> = {
  'card-flip': '🃏',
  'number-sequence': '🔢',
  'pattern-memory': '🔲',
  'word-match': '🔤',
};

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function Profile() {
  const { user, profile } = useAuth();
  const [history, setHistory] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getUserGameHistory(user.uid)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400">Loading profile...</p>
      </div>
    );
  }

  const winRate =
    profile.totalGamesPlayed > 0
      ? Math.round((profile.totalWins / profile.totalGamesPlayed) * 100)
      : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Profile Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="avatar"
                className="w-16 h-16 rounded-full border-4 border-indigo-500"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-700 flex items-center justify-center text-2xl font-bold text-white border-4 border-indigo-500">
                {profile.displayName[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
              <p className="text-slate-400 text-sm">{profile.email}</p>
              <p className="text-slate-500 text-xs mt-1">
                Member since {new Date(profile.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Games Played', value: profile.totalGamesPlayed, color: 'text-white', icon: '🎮' },
            { label: 'Wins', value: profile.totalWins, color: 'text-emerald-400', icon: '🏆' },
            { label: 'Win Rate', value: `${winRate}%`, color: 'text-indigo-400', icon: '📈' },
            { label: 'Losses', value: profile.totalGamesPlayed - profile.totalWins, color: 'text-red-400', icon: '💀' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-slate-500 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* High Scores */}
        {profile.highScores && Object.keys(profile.highScores).length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">🏅 Best Scores</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {Object.entries(profile.highScores).map(([game, score]) => (
                <div
                  key={game}
                  className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{GAME_EMOJI[game] || '🎮'}</span>
                    <span className="text-slate-300 text-sm capitalize">
                      {game.replace('-', ' ')}
                    </span>
                  </div>
                  <span className="text-amber-400 font-bold">{score}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Game History */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4">📋 Recent Games</h2>
          {loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500">No games played yet.</p>
              <Link
                to="/lobby"
                className="inline-block mt-3 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-500 transition-colors"
              >
                Play Now
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((game, i) => (
                <motion.div
                  key={game.id || i}
                  className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{GAME_EMOJI[game.gameType] || '🎮'}</span>
                    <div>
                      <p className="text-white text-sm font-medium capitalize">
                        {game.gameType.replace('-', ' ')}
                        <span className="ml-1 text-xs text-slate-500">· {game.difficulty}</span>
                      </p>
                      <p className="text-slate-500 text-xs">
                        {game.moves} moves · {formatTime(game.timeSeconds)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${game.isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                      {game.isWin ? '✓ Win' : '✗ Loss'}
                    </div>
                    <div className="text-amber-400 text-sm font-semibold">{game.score} pts</div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
