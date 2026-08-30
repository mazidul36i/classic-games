import { useState, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, Copy, DoorOpen } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { startGame, cleanupRoom, seatedOrder } from "../firebase/realtime";
import { generateCards } from "../utils/cardUtils";
import { generateWordCards } from "../utils/wordUtils";
import Card from "../components/game/Card";
import type { RoomPlayer } from "../types/multiplayer.types";
import type { CardTheme, Difficulty, GameType } from "../types/game.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GAME_CARD: Record<string, { rank: string; suit: string; red: boolean; label: string }> = {
  "card-flip": { rank: "A", suit: "♠", red: false, label: "Card Flip Match" },
  "word-match": { rank: "J", suit: "♥", red: true, label: "Word Match" },
};

const NEXT_GAME_OPTIONS: { id: GameType; label: string }[] = [
  { id: "card-flip", label: "Card Flip" },
  { id: "word-match", label: "Word Match" },
];
const NEXT_DIFFICULTIES: Difficulty[] = ["4x4", "6x6", "8x8"];
const NEXT_THEMES: CardTheme[] = ["colors", "emojis", "numbers", "animals", "symbols"];

export default function MultiplayerRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const {
    room,
    loading,
    myPlayer,
    isMyTurn,
    players,
    secondsLeft,
    handleFlipCard,
    handleReady,
    handleLeave,
    handleProposeNextRound,
    handleNextRoundReady,
  } = useMultiplayer(roomId ?? null, user?.uid ?? null);

  const roundOver = room?.status === "round-finished";

  const handleStart = async () => {
    if (!room || !roomId) return;
    const cards =
      room.gameType === "word-match"
        ? generateWordCards(room.difficulty)
        : generateCards(room.difficulty, room.theme);
    const firstPlayer = seatedOrder(room.players)[0];
    await startGame(roomId, cards, firstPlayer, room);
  };

  const handleLeaveRoom = async () => {
    await handleLeave();
    navigate("/lobby");
  };

  const handleCleanup = async () => {
    if (roomId) await cleanupRoom(roomId);
    navigate("/lobby");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(roomId || "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="relative z-10 flex items-center justify-center min-h-[60vh]">
        <p className="p-tick text-ink-soft">Finding the room…</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[60vh] gap-7 px-6 text-center">
        <div>
          <span className="p-tick text-vermilion">Nothing here</span>
          <h1 className="p-display text-[2rem] mt-4">That room has closed.</h1>
        </div>
        <button onClick={() => navigate("/lobby")} className="p-btn p-btn-solid">
          Back to the table
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const isHost = room.hostId === user?.uid;
  const allReady = players.length >= 2 && players.every((p) => p.isReady);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  const maxPlayers = room.maxPlayers ?? 4;
  const winner = roundOver ? sortedPlayers[0] : null;
  const game = GAME_CARD[room.gameType] ?? { rank: "?", suit: "✦", red: false, label: room.gameType };

  const proposal = room.nextRound;
  const nextGameType = proposal?.gameType ?? room.gameType;
  const nextDifficulty = proposal?.difficulty ?? room.difficulty;
  const nextTheme = proposal?.theme ?? room.theme;
  const myNextReady = Boolean(user?.uid && proposal?.readyPlayers?.[user.uid]);
  const readyCount = players.filter((p) => proposal?.readyPlayers?.[p.uid]).length;

  const proposeNext = (gameType: GameType, difficulty: Difficulty, theme: CardTheme) =>
    handleProposeNextRound(gameType, difficulty, theme);

  const boardCols = room.difficulty === "4x4" ? 4 : room.difficulty === "6x6" ? 6 : 8;
  const boardStyle: CSSProperties = {
    "--board-cols": boardCols,
    "--card-size":
      "clamp(2.5rem, calc((100vw - 5rem - (var(--board-cols) - 1) * 0.5rem) / var(--board-cols)), 5.5rem)",
  } as CSSProperties;
  const cardSize = room.difficulty === "8x8" ? "sm" : "fluid";
  const turnHolder = players.find((p) => p.uid === room.gameState?.currentTurn)?.displayName;

  return (
    <div className="relative z-10 max-w-[58rem] mx-auto px-5 sm:px-10 pt-6 pb-20">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="p-masthead">
          <button onClick={handleLeaveRoom} className="p-icon-btn" aria-label="Leave the room">
            <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <span className="p-engrave flex-1 text-center text-ink-deep text-[0.85rem] sm:text-[0.95rem] tracking-[0.14em] uppercase">
            <span className="hidden sm:inline">The Memory Parlour</span>
            <span className="text-vermilion mx-2 hidden sm:inline">✦</span>
            {room.isPrivate ? "Private Room" : "Quick Match"}
          </span>
          <div className="flex items-center gap-2">
            {isHost && !roundOver && (
              <button onClick={handleCleanup} className="p-icon-btn" aria-label="Close the room">
                <DoorOpen className="w-4.5 h-4.5" strokeWidth={1.75} />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-icon-btn"
              aria-label={copied ? "Room code copied" : "Copy the room code"}
            >
              {copied ? <Check className="w-4.5 h-4.5" strokeWidth={1.75} /> : <Copy className="w-4 h-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {/* ── The room's number, printed large ── */}
        <div className="pt-10 sm:pt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <span className="p-tick text-vermilion">Room code</span>
            <p className="p-display text-[clamp(2.2rem,7vw,3.4rem)] mt-3 leading-none">
              {roomId}
            </p>
          </div>
          <div className="sm:text-right">
            <span
              className={`p-pip ${game.red ? "p-pip-red" : "p-pip-black"} p-pip-lg inline-block mb-2`}
              aria-hidden="true"
            >
              {game.rank}
              {game.suit}
            </span>
            <p className="p-engrave text-[1.1rem] text-ink-deep">{game.label}</p>
            <p className="p-tick text-ink-soft mt-1.5">
              Round {room.round} · {room.difficulty.replace("x", "×")} · {room.theme} deck
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Seats ── */}
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.1, ease: EASE }}
        className="p-rule pt-7 mt-10"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {sortedPlayers.map((p: RoomPlayer) => (
            <div
              key={p.uid}
              className={`p-seat ${room.gameState?.currentTurn === p.uid ? "p-seat-active" : ""}`}
            >
              <span className="p-avatar w-9 h-9 text-[0.85rem]">
                {p.photoURL ? <img src={p.photoURL} alt="" /> : p.displayName[0].toUpperCase()}
              </span>
              <div className="overflow-hidden flex-1">
                <p className="p-engrave text-[1rem] text-ink-deep truncate">
                  {p.displayName}
                  {p.uid === room.hostId && <span className="text-brass ml-1.5">✦</span>}
                </p>
                <p className="p-tick text-ink-soft mt-0.5">
                  {p.score} pts
                  {room.round > 1 && ` · ${p.roundsWon} rounds`}
                  {room.status === "waiting" && (
                    <span className={p.isReady ? "text-felt" : "text-ink-soft"}>
                      {" · "}
                      {p.isReady ? "Ready" : "Waiting"}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}

          {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="p-seat p-seat-empty">
              <span className="p-tick text-ink-soft">Seat open</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Before the deal ── */}
      {room.status === "waiting" && (
        <div className="p-panel mt-8 px-6 sm:px-8 py-8 text-center">
          <p className="text-[0.98rem] leading-[1.7] text-ink-soft max-w-[46ch] mx-auto mb-7">
            {players.length < 2
              ? room.isPrivate
                ? "Send the code above to whoever you want across the table — the game starts once two of you are seated."
                : "Your opponent has stepped away from the table. Wait a moment, or head back and look for another."
              : allReady
                ? "Everyone is ready. The host may deal."
                : "Every player marks themselves ready before the first card turns."}
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button
              onClick={() => handleReady(!myPlayer?.isReady)}
              className={`p-btn ${myPlayer?.isReady ? "p-btn-outline" : "p-btn-solid"}`}
            >
              {myPlayer?.isReady ? "Not ready after all" : "I'm ready"}
            </button>
            {isHost && allReady && (
              <button onClick={handleStart} className="p-btn p-btn-solid">
                Deal the hand
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── The table in play ── */}
      {room.status === "playing" && room.gameState && (
        <motion.div
          className="p-felt rounded-sm mt-8 p-6 sm:p-8"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <div className="relative z-10 flex flex-col items-center gap-7">
            <div className="flex flex-col items-center gap-2.5">
              <span
                className={`p-status ${isMyTurn ? "p-status-turn" : "p-status-live"}`}
                aria-live="polite"
              >
                {isMyTurn ? "Your turn — take a card" : `${turnHolder ?? "…"} is thinking`}
              </span>
              {/* The house does not wait forever: when this runs out, anyone at
                  the table may move the turn on. */}
              {secondsLeft !== null && (
                <span
                  className={`p-tick tabular-nums ${
                    secondsLeft <= 10 ? "text-vermilion" : "text-paper/60"
                  }`}
                  aria-hidden="true"
                >
                  {secondsLeft > 0 ? `${secondsLeft}s on the clock` : "Clock out — passing"}
                </span>
              )}
            </div>

            <div
              className={`grid w-fit mx-auto gap-2 sm:gap-3 place-items-center ${
                room.difficulty === "4x4"
                  ? "grid-cols-4"
                  : room.difficulty === "6x6"
                    ? "grid-cols-6"
                    : "grid-cols-8"
              }`}
              style={boardStyle}
            >
              {room.gameState.cards.map((card) => {
                const isFlipped = room.gameState?.flippedCards?.includes(card.id) ?? false;
                const renderCard = isFlipped ? { ...card, isFlipped: true } : card;
                return (
                  <Card
                    key={card.id}
                    card={renderCard}
                    onClick={handleFlipCard}
                    size={cardSize}
                    disabled={!isMyTurn}
                  />
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Between rounds: the table stays seated ── */}
      <AnimatePresence>
        {roundOver && winner && (
          <motion.div
            className="p-panel mt-8 px-6 sm:px-8 py-8"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            <div className="text-center">
              <span className="p-tick text-vermilion">Round {room.round}</span>
              <h2 className="p-display text-[1.7rem] leading-[1.15] mt-3 mb-6">
                {winner.uid === user?.uid ? "You took that round." : `${winner.displayName} took that round.`}
              </h2>
            </div>

            <ol className="text-left mb-8 max-w-[26rem] mx-auto">
              {sortedPlayers.map((p, i) => (
                <li key={p.uid} className="flex items-center justify-between gap-4 py-3 p-rule">
                  <span className="flex items-center gap-3">
                    <span className={`p-rank ${i === 0 ? "p-rank-top" : ""}`}>{i + 1}</span>
                    <span className="p-engrave text-[1.05rem] text-ink-deep">{p.displayName}</span>
                  </span>
                  <span className="p-tick text-ink-soft">
                    {p.score} pts this round
                    <span className="p-figure text-[1.1rem] text-ink-deep ml-3">{p.roundsWon} won</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="p-rule pt-7 max-w-[30rem] mx-auto">
              <p className="p-tick text-ink-soft mb-4 text-center">What's next</p>

              <div className="grid grid-cols-2 gap-2.5 mb-4">
                {NEXT_GAME_OPTIONS.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => proposeNext(g.id, nextDifficulty, nextTheme)}
                    aria-pressed={nextGameType === g.id}
                    className={`p-opt ${nextGameType === g.id ? "p-opt-on" : ""}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2.5 mb-4">
                {NEXT_DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => proposeNext(nextGameType, d, nextTheme)}
                    aria-pressed={nextDifficulty === d}
                    className={`p-opt flex-1 ${nextDifficulty === d ? "p-opt-on" : ""}`}
                  >
                    {d.replace("x", "×")}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5 mb-7">
                {NEXT_THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => proposeNext(nextGameType, nextDifficulty, t)}
                    aria-pressed={nextTheme === t}
                    className={`p-opt ${nextTheme === t ? "p-opt-on" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <p className="text-[0.92rem] text-ink-soft text-center mb-5">
                {readyCount >= players.length && players.length >= 2
                  ? "Everyone's agreed — dealing the next round…"
                  : `${readyCount}/${players.length} agreed to play this next.`}
              </p>

              <div className="flex flex-wrap gap-4 justify-center">
                <button
                  onClick={() => handleNextRoundReady(!myNextReady)}
                  className={`p-btn ${myNextReady ? "p-btn-outline" : "p-btn-solid"}`}
                >
                  {myNextReady ? "Not so fast" : "Agree — deal me in"}
                </button>
                <button onClick={handleCleanup} className="p-btn p-btn-outline">
                  End the session
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
