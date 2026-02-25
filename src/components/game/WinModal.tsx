import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

interface WinModalProps {
  isOpen: boolean;
  moves: number;
  time: number;
  score: number;
  onPlayAgain: () => void;
}

const formatTime = (secs: number): string => {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function WinModal({ isOpen, moves, time, score, onPlayAgain }: WinModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 text-center shadow-2xl"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-white mb-2">You Won!</h2>
            <p className="text-slate-400 mb-6">Excellent memory skills!</p>

            {/* Score breakdown */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { label: 'Score', value: score, color: 'text-amber-400' },
                { label: 'Moves', value: moves, color: 'text-white' },
                { label: 'Time', value: formatTime(time), color: 'text-indigo-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-900 rounded-xl p-3">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</div>
                  <div className={`text-xl font-bold ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onPlayAgain}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
              >
                Play Again
              </button>
              <Link
                to="/lobby"
                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors text-center"
              >
                Game Lobby
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
