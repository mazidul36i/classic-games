import { useState, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronLeft, Copy } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { startGame, cleanupRoom } from "../firebase/realtime";
import { generateCards } from "../utils/cardUtils";
import Card from "../components/game/Card";
import type { RoomPlayer } from "../types/multiplayer.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const GAME_CARD: Record<string, { rank: string; suit: string; red: boolean; label: string }> = {
  "card-flip": { rank: "A", suit: "♠", red: false, label: "Card Flip Match" },
  "word-match": { rank: "J", suit: "♥", red: true, label: "Word Match" },
};

export default function MultiplayerRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const { room, loading, myPlayer, isMyTurn, players, handleFlipCard, handleReady, handleLeave } =
    useMultiplayer(roomId ?? null, user?.uid ?? null);

  const showResult = room?.status === "finished";

  const handleStart = async () => {
    if (!room || !roomId) return;
    const cards = generateCards(room.difficulty, room.theme);
    const firstPlayer = Object.keys(room.players)[0];
    await startGame(roomId, cards, firstPlayer);
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
  const winner = showResult ? sortedPlayers[0] : null;
  const game = GAME_CARD[room.gameType] ?? { rank: "?", suit: "✦", red: false, label: room.gameType };

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
            Private Room
          </span>
          <button
            onClick={handleCopy}
            className="p-icon-btn"
            aria-label={copied ? "Room code copied" : "Copy the room code"}
          >
            {copied ? <Check className="w-4.5 h-4.5" strokeWidth={1.75} /> : <Copy className="w-4 h-4" strokeWidth={1.75} />}
          </button>
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
              {room.difficulty.replace("x", "×")} · {room.theme} deck
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
              ? "Send the code above to whoever you want across the table — the game starts once two of you are seated."
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
            <span
              className={`p-status ${isMyTurn ? "p-status-turn" : "p-status-live"}`}
              aria-live="polite"
            >
              {isMyTurn ? "Your turn — take a card" : `${turnHolder ?? "…"} is thinking`}
            </span>

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

      {/* ── The result ── */}
      <AnimatePresence>
        {showResult && winner && (
          <motion.div
            className="p-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Result"
              className="p-panel w-full max-w-[26rem] px-7 sm:px-9 pt-8 pb-9 text-center"
              initial={{ scale: 0.9, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: "spring", damping: 24, stiffness: 300 }}
            >
              <div className="p-rule-double pt-3 pb-6">
                <span className="p-suits flex items-center justify-center gap-3 text-[1.3rem]" aria-hidden="true">
                  <span className="text-ink-deep">♠</span>
                  <span className="text-vermilion">♥</span>
                  <span className="text-vermilion">♦</span>
                  <span className="text-ink-deep">♣</span>
                </span>
              </div>

              <span className="p-tick text-vermilion">The house declares</span>
              <h2 className="p-display text-[1.9rem] leading-[1.1] mt-4 mb-7">
                {winner.uid === user?.uid ? "The hand is yours." : `${winner.displayName} takes it.`}
              </h2>

              <ol className="text-left mb-8">
                {sortedPlayers.map((p, i) => (
                  <li
                    key={p.uid}
                    className="flex items-center justify-between gap-4 py-3 p-rule"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`p-rank ${i === 0 ? "p-rank-top" : ""}`}>{i + 1}</span>
                      <span className="p-engrave text-[1.05rem] text-ink-deep">{p.displayName}</span>
                    </span>
                    <span className="p-figure text-[1.1rem]">{p.score}</span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-col gap-3">
                <button onClick={() => navigate("/lobby")} className="p-btn p-btn-solid p-btn-block">
                  Back to the table
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {isHost && (
                  <button onClick={handleCleanup} className="p-btn p-btn-outline p-btn-block">
                    Close the room
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
