import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getLeaderboard } from "../firebase/firestore";
import type { GameType, Difficulty } from "../types/game.types";
import { ChevronLeft } from "lucide-react";

const GAMES: { id: GameType; label: string; badge: string }[] = [
  { id: "card-flip", label: "Card Flip", badge: "CF" },
  { id: "number-sequence", label: "Number Sequence", badge: "NS" },
  { id: "pattern-memory", label: "Pattern Memory", badge: "PM" },
  { id: "word-match", label: "Word Match", badge: "WM" },
];

const DIFFICULTIES: { id: Difficulty | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "4x4", label: "4x4" },
  { id: "6x6", label: "6x6" },
  { id: "8x8", label: "8x8" },
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

export default function Leaderboard() {
  const navigate = useNavigate();
  const [selectedGame, setSelectedGame] = useState<GameType>("card-flip");
  const [selectedDiff, setSelectedDiff] = useState<Difficulty | "all">("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const diff = selectedDiff === "all" ? undefined : selectedDiff;
        const data = await getLeaderboard(selectedGame, diff, 20);
        setEntries(data as LeaderboardEntry[]);
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData()
      .then(() => {
      });
  }, [selectedGame, selectedDiff]);

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 md:pt-7 lg:py-10 pb-10">
      <motion.div
        initial={ { opacity: 0, y: 20 } }
        animate={ { opacity: 1, y: 0 } }
        transition={ { duration: 0.4 } }
      >
        <div className="flex items-center mb-2 gap-4">
          <button
            onClick={ () => navigate(-1) }
            className="flex items-center justify-center w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full transition-colors"
          >
            <ChevronLeft className="text-xl font-bold text-white mr-1" />
          </button>
          <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
        </div>
        <p className="text-text-muted mb-8">Top players across all games</p>

        <div className="flex gap-2 flex-wrap mb-4">
          { GAMES.map((game) => (
            <button
              key={ game.id }
              onClick={ () => setSelectedGame(game.id) }
              className={ `option-btn flex items-center gap-2 p-1.5 sm:p-2 md:p-3 pr-3 sm:pr-3.5 md:pr-4 text-left ${
                selectedGame === game.id ? "option-btn-active" : ""
              }` }
            >
              <span className="logo-mark text-xs sm:text-sm aspect-square">{ game.badge }</span>
              <span className="text-xs sm:text-sm font-medium">{ game.label }</span>
            </button>
          )) }
        </div>

        <div className="flex gap-2 mb-6">
          { DIFFICULTIES.map((d) => (
            <button
              key={ d.id }
              onClick={ () => setSelectedDiff(d.id) }
              className={ `option-btn px-3 py-1.5 text-xs font-medium ${
                selectedDiff === d.id ? "option-btn-active" : ""
              }` }
            >
              { d.label }
            </button>
          )) }
        </div>

        <div className="surface overflow-hidden">
          { loading ? (
            <div className="flex items-center justify-center py-16 text-text-muted">
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="badge mono">NO SCORES YET</span>
              <p className="text-text-muted">Be the first to play!</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
              <tr className="border-b border-slate-800/60">
                <th
                  className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wide font-medium w-16">
                  Rank
                </th>
                <th
                  className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wide font-medium">
                  Player
                </th>
                <th
                  className="text-right px-4 py-3 text-text-muted text-xs uppercase tracking-wide font-medium">
                  Score
                </th>
                <th
                  className="text-right px-4 py-3 text-text-muted text-xs uppercase tracking-wide font-medium hidden sm:table-cell">
                  Difficulty
                </th>
                <th
                  className="text-right px-4 py-3 text-text-muted text-xs uppercase tracking-wide font-medium hidden sm:table-cell">
                  Moves
                </th>
              </tr>
              </thead>
              <tbody>
              { entries.map((entry, i) => (
                <motion.tr
                  key={ entry.id }
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                  initial={ { opacity: 0, x: -10 } }
                  animate={ { opacity: 1, x: 0 } }
                  transition={ { delay: i * 0.03 } }
                >
                  <td className="px-4 py-3 text-center">
                    { i < 3 ? (
                      <span className="badge mono">{ i + 1 }</span>
                    ) : (
                      <span className="text-text-muted text-sm font-medium">#{ i + 1 }</span>
                    ) }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[#072225] text-xs font-bold">
                        { entry.displayName?.[0]?.toUpperCase() || "P" }
                      </div>
                      <span className="text-white text-sm font-medium">{ entry.displayName || "Anonymous" }</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-accent-2 font-bold">{ entry.score }</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-text-muted text-sm">{ entry.difficulty || "-" }</span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-text-muted text-sm">{ entry.moves ?? "-" }</span>
                  </td>
                </motion.tr>
              )) }
              </tbody>
            </table>
          ) }
        </div>
      </motion.div>
    </div>
  );
}
