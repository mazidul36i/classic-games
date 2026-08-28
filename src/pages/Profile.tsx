import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { getUserGameHistory } from "../firebase/firestore";
import type { GameResult } from "../types/game.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* Each game keeps the card it was dealt on the front page. */
const GAME_CARD: Record<string, { rank: string; suit: string; red: boolean; label: string }> = {
  "card-flip": { rank: "A", suit: "♠", red: false, label: "Card Flip Match" },
  "number-sequence": { rank: "K", suit: "♦", red: true, label: "Number Sequence" },
  "pattern-memory": { rank: "Q", suit: "♣", red: false, label: "Pattern Memory" },
  "word-match": { rank: "J", suit: "♥", red: true, label: "Word Match" },
};

const cardFor = (game: string) =>
  GAME_CARD[game] ?? { rank: "?", suit: "✦", red: false, label: game.replace("-", " ") };

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

export default function Profile() {
  const { user, profile } = useAuth();
  const reduce = useReducedMotion();
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
      <div className="relative z-10 flex items-center justify-center min-h-[60vh]">
        <p className="p-tick text-ink-soft">Fetching your record…</p>
      </div>
    );
  }

  const winRate =
    profile.totalGamesPlayed > 0
      ? Math.round((profile.totalWins / profile.totalGamesPlayed) * 100)
      : 0;

  const record = [
    { label: "Hands played", value: profile.totalGamesPlayed },
    { label: "Won", value: profile.totalWins },
    { label: "Lost", value: profile.totalGamesPlayed - profile.totalWins },
    { label: "Rate", value: `${winRate}%` },
  ];

  const bestScores = Object.entries(profile.highScores ?? {});

  return (
    <div className="relative z-10 max-w-[54rem] mx-auto px-5 sm:px-10 pt-6 pb-20 sm:pb-28">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
      >
        <div className="p-masthead">
          <span className="p-engrave flex-1 text-center text-ink-deep text-[0.85rem] sm:text-[0.95rem] tracking-[0.14em] uppercase">
            <span className="hidden sm:inline">The Memory Parlour</span>
            <span className="text-vermilion mx-2 hidden sm:inline">✦</span>
            Member's Record
          </span>
        </div>

        {/* ── Nameplate ── */}
        <div className="pt-12 sm:pt-14 flex flex-col sm:flex-row sm:items-end gap-7">
          <span className="p-avatar w-24 h-24 text-[2.2rem] ring-1 ring-ink-deep/40 ring-offset-4 ring-offset-paper">
            {user.photoURL ? <img src={user.photoURL} alt="" /> : profile.displayName[0]?.toUpperCase()}
          </span>
          <div>
            <span className="p-tick text-vermilion">Seated since {new Date(profile.createdAt).toLocaleDateString()}</span>
            <h1 className="p-display text-[clamp(2rem,5vw,3.2rem)] mt-3 leading-[1.05]">
              {profile.displayName}
            </h1>
            <p className="p-tick p-tick-plain text-ink-soft mt-3">{profile.email}</p>
          </div>
        </div>
      </motion.div>

      {/* ── The record ── */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
        className="mt-12 sm:mt-14"
      >
        <div className="p-gauges">
          {record.map((item) => (
            <div key={item.label} className="p-gauge">
              <div className="p-figure text-[clamp(1.6rem,4vw,2.3rem)] mb-2">{item.value}</div>
              <div className="p-tick text-ink-soft">{item.label}</div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ── Best returns ── */}
      {bestScores.length > 0 && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
          className="mt-14 sm:mt-16"
        >
          <div className="p-rule pt-6 mb-7 flex items-baseline justify-between gap-4">
            <h2 className="p-display text-[1.5rem]">Best returns</h2>
            <span className="p-tick text-ink-soft">Per game</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {bestScores.map(([game, score]) => {
              const card = cardFor(game);
              return (
                <div
                  key={game}
                  className="p-panel flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`p-pip ${card.red ? "p-pip-red" : "p-pip-black"} p-pip-lg`}
                      aria-hidden="true"
                    >
                      {card.rank}
                      {card.suit}
                    </span>
                    <span className="p-engrave text-[1.05rem] text-ink-deep">{card.label}</span>
                  </div>
                  <span className="p-figure p-figure-accent text-[1.3rem]">{score}</span>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Recent hands ── */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.28, ease: EASE }}
        className="mt-14 sm:mt-16"
      >
        <div className="p-rule pt-6 mb-7 flex items-baseline justify-between gap-4">
          <h2 className="p-display text-[1.5rem]">Recent hands</h2>
          <span className="p-tick text-ink-soft">Newest first</span>
        </div>

        {loading ? (
          <p className="p-tick text-ink-soft py-10 text-center">Turning the pages…</p>
        ) : history.length === 0 ? (
          <div className="p-panel px-6 py-12 text-center">
            <p className="p-display text-[1.35rem] mb-3">No hands on record.</p>
            <p className="text-[0.95rem] text-ink-soft mb-8 max-w-[36ch] mx-auto">
              Play one and it will be written here, win or lose.
            </p>
            <Link to="/lobby/card-flip" className="p-btn p-btn-solid">
              Deal me in
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="p-panel p-panel-plain overflow-hidden">
            <div className="overflow-x-auto">
              <table className="p-ledger">
                <thead>
                  <tr>
                    <th className="w-14">Game</th>
                    <th>Hand</th>
                    <th className="p-num hidden xs:table-cell">Moves</th>
                    <th className="p-num hidden sm:table-cell">Time</th>
                    <th className="p-num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((game, i) => {
                    const card = cardFor(game.gameType);
                    return (
                      <motion.tr
                        key={game.id || i}
                        initial={reduce ? false : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.035, 0.4), duration: 0.4, ease: EASE }}
                      >
                        <td>
                          <span
                            className={`p-pip ${card.red ? "p-pip-red" : "p-pip-black"}`}
                            aria-hidden="true"
                          >
                            {card.rank}
                            {card.suit}
                          </span>
                        </td>
                        <td>
                          <span className="p-engrave text-[1.05rem] text-ink-deep">{card.label}</span>
                          <span className="p-tick text-ink-soft block mt-1">
                            {game.difficulty.replace("x", "×")} ·{" "}
                            <span className={game.isWin ? "text-felt" : "text-vermilion"}>
                              {game.isWin ? "Won" : "Lost"}
                            </span>
                          </span>
                        </td>
                        <td className="p-num hidden xs:table-cell text-ink-soft">{game.moves}</td>
                        <td className="p-num hidden sm:table-cell text-ink-soft">
                          {formatTime(game.timeSeconds)}
                        </td>
                        <td className="p-num">
                          <span className="p-figure text-[1.1rem]">{game.score}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </motion.section>
    </div>
  );
}
