import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import PageHead from "../components/layout/PageHead";
import { getLeaderboard } from "../firebase/firestore";
import type { GameType, Difficulty, LeaderboardEntry } from "../types/game.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GAMES: { id: GameType; label: string; rank: string; suit: string; red: boolean }[] = [
  { id: "card-flip", label: "Card Flip", rank: "A", suit: "♠", red: false },
  { id: "number-sequence", label: "Sequence", rank: "K", suit: "♦", red: true },
  { id: "pattern-memory", label: "Pattern", rank: "Q", suit: "♣", red: false },
  { id: "word-match", label: "Word Match", rank: "J", suit: "♥", red: true },
];

const DIFFICULTIES: { id: Difficulty | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "4x4", label: "4×4" },
  { id: "6x6", label: "6×6" },
  { id: "8x8", label: "8×8" },
];

export default function Leaderboard() {
  const reduce = useReducedMotion();
  const [selectedGame, setSelectedGame] = useState<GameType>("card-flip");
  const [selectedDiff, setSelectedDiff] = useState<Difficulty | "all">("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const diff = selectedDiff === "all" ? undefined : selectedDiff;
        setEntries(await getLeaderboard(selectedGame, diff, 20));
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };
    void fetchData();
  }, [selectedGame, selectedDiff]);

  const currentGame = GAMES.find((g) => g.id === selectedGame)!;

  return (
    <div className="relative z-10 max-w-[54rem] mx-auto px-5 sm:px-10 pt-6 pb-20 sm:pb-28">
      <PageHead
        section="The Standings"
        kicker="The record"
        title={
          <>
            An honest
            <br />
            account.
          </>
        }
        lede="Every finished hand is written down. These are the twenty sharpest returns on record."
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.12, ease: EASE }}
        className="mt-14 sm:mt-16"
      >
        <div className="p-rule pt-6 flex flex-wrap gap-2.5 mb-3">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              aria-pressed={selectedGame === game.id}
              className={`p-opt p-opt-card ${selectedGame === game.id ? "p-opt-on" : ""}`}
            >
              <span
                className={`p-opt-rank ${
                  selectedGame === game.id ? "" : game.red ? "text-vermilion" : "text-ink-deep"
                }`}
              >
                {game.rank}
                {game.suit}
              </span>
              <span>{game.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2.5 mb-9">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDiff(d.id)}
              aria-pressed={selectedDiff === d.id}
              className={`p-opt ${selectedDiff === d.id ? "p-opt-on" : ""}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="p-panel p-panel-plain overflow-hidden">
          <div className="p-panel-head p-panel-head-flush px-5 sm:px-6 pt-5">
            <span className="p-tick">{currentGame.label}</span>
            <span className="p-tick">
              {selectedDiff === "all" ? "All hands" : selectedDiff.replace("x", "×")}
            </span>
          </div>

          {loading ? (
            <div className="py-20 text-center p-tick text-ink-soft">Reading the ledger…</div>
          ) : entries.length === 0 ? (
            <div className="py-20 text-center px-6">
              <p className="p-display text-[1.35rem] mb-3">Nothing entered yet.</p>
              <p className="text-[0.95rem] text-ink-soft">
                The page is blank. Play a hand and put the first name on it.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="p-ledger">
                <thead>
                  <tr>
                    <th className="w-16">Rank</th>
                    <th>Player</th>
                    <th className="p-num">Score</th>
                    <th className="p-num hidden sm:table-cell">Hand</th>
                    <th className="p-num hidden sm:table-cell">Moves</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <motion.tr
                      key={entry.id}
                      initial={reduce ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.4), duration: 0.4, ease: EASE }}
                    >
                      <td>
                        {i < 3 ? (
                          <span className="p-rank p-rank-top">{i + 1}</span>
                        ) : (
                          <span className="p-figure p-figure-soft text-[1.05rem]">{i + 1}</span>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="p-avatar w-8 h-8 text-[0.8rem]">
                            {entry.displayName?.[0]?.toUpperCase() || "P"}
                          </span>
                          <span className="p-engrave text-[1.05rem] text-ink-deep">
                            {entry.displayName || "Anonymous"}
                          </span>
                        </div>
                      </td>
                      <td className="p-num">
                        <span className="p-figure text-[1.15rem]">{entry.score}</span>
                      </td>
                      <td className="p-num hidden sm:table-cell text-ink-soft">
                        {entry.difficulty ? entry.difficulty.replace("x", "×") : "—"}
                      </td>
                      <td className="p-num hidden sm:table-cell text-ink-soft">
                        {entry.moves ?? "—"}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
