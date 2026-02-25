import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { createRoom, joinRoom } from '../firebase/realtime';
import type { GameType, Difficulty, CardTheme } from '../types/game.types';
import type { RoomPlayer } from '../types/multiplayer.types';

const GAME_OPTIONS: { id: GameType; label: string; emoji: string; supportsMulti: boolean }[] = [
  { id: 'card-flip', label: 'Card Flip Match', emoji: '🃏', supportsMulti: true },
  { id: 'number-sequence', label: 'Number Sequence', emoji: '🔢', supportsMulti: false },
  { id: 'pattern-memory', label: 'Pattern Memory', emoji: '🔲', supportsMulti: false },
  { id: 'word-match', label: 'Word Match', emoji: '🔤', supportsMulti: true },
];

const DIFFICULTIES: Difficulty[] = ['4x4', '6x6', '8x8'];
const THEMES: CardTheme[] = ['colors', 'emojis', 'numbers', 'animals', 'symbols'];

export default function GameLobby() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [gameType, setGameType] = useState<GameType>('card-flip');
  const [difficulty, setDifficulty] = useState<Difficulty>('4x4');
  const [theme, setTheme] = useState<CardTheme>('emojis');
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const selectedGame = GAME_OPTIONS.find((g) => g.id === gameType)!;

  const handleSinglePlay = () => {
    navigate(`/play/${gameType}?difficulty=${difficulty}&theme=${theme}`);
  };

  const handleCreateRoom = async () => {
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const hostPlayer: RoomPlayer = {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        photoURL: user.photoURL || '',
        score: 0,
        isReady: false,
        isCurrentTurn: false,
        joinedAt: Date.now(),
      };
      const roomId = await createRoom(hostPlayer, gameType, difficulty, theme);
      navigate(`/room/${roomId}`);
    } catch {
      setError('Failed to create room. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!isAuthenticated || !user) {
      navigate('/login');
      return;
    }
    if (!roomCode.trim()) {
      setError('Enter a room code');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const player: RoomPlayer = {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        photoURL: user.photoURL || '',
        score: 0,
        isReady: false,
        isCurrentTurn: false,
        joinedAt: Date.now(),
      };
      const ok = await joinRoom(roomCode.toUpperCase(), player);
      if (ok) {
        navigate(`/room/${roomCode.toUpperCase()}`);
      } else {
        setError('Room not found or is full/in progress.');
      }
    } catch {
      setError('Failed to join room. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-white mb-2">Game Lobby</h1>
        <p className="text-slate-400 mb-8">Configure your game and start playing</p>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Game Config */}
          <div className="space-y-6">
            {/* Game Type */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Select Game
              </h2>
              <div className="grid grid-cols-2 gap-2">
                {GAME_OPTIONS.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => {
                      setGameType(game.id);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                      gameType === game.id
                        ? 'border-indigo-500 bg-indigo-600/20 text-white'
                        : 'border-slate-600 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="text-xl">{game.emoji}</span>
                    <span className="text-sm font-medium">{game.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
                Difficulty
              </h2>
              <div className="flex gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                      difficulty === d
                        ? 'border-indigo-500 bg-indigo-600/20 text-white'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {difficulty === '4x4' ? '8 pairs · Easy' : difficulty === '6x6' ? '18 pairs · Medium' : '32 pairs · Hard'}
              </p>
            </div>

            {/* Theme (only for card-flip and word-match) */}
            {(gameType === 'card-flip' || gameType === 'word-match') && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">
                  Card Theme
                </h2>
                <div className="flex flex-wrap gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                        theme === t
                          ? 'border-indigo-500 bg-indigo-600/20 text-white'
                          : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Mode selection */}
          <div className="space-y-4">
            {/* Single Player */}
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
                🎮 Single Player
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Play alone, beat your time and score, and climb the leaderboard.
              </p>
              <button
                onClick={handleSinglePlay}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
              >
                Play Solo
              </button>
            </div>

            {/* Multiplayer */}
            {selectedGame.supportsMulti && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-4">
                  👥 Multiplayer
                </h2>
                {!isAuthenticated && (
                  <p className="text-amber-400 text-sm mb-3">
                    ⚠️ Sign in required for multiplayer
                  </p>
                )}
                {error && (
                  <p className="text-red-400 text-sm mb-3">{error}</p>
                )}
                <div className="space-y-3">
                  <button
                    onClick={handleCreateRoom}
                    disabled={creating}
                    className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-900 text-white font-semibold rounded-xl transition-colors"
                  >
                    {creating ? 'Creating...' : '+ Create Room'}
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="Room Code"
                      maxLength={6}
                      className="flex-1 px-3 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 uppercase font-mono text-sm"
                    />
                    <button
                      onClick={handleJoinRoom}
                      disabled={joining}
                      className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white font-medium rounded-xl transition-colors text-sm"
                    >
                      {joining ? '...' : 'Join'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
