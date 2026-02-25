import { useEffect, useState, type CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { startGame, cleanupRoom } from "../firebase/realtime";
import { generateCards } from "../utils/cardUtils";
import Card from "../components/game/Card";
import type { RoomPlayer } from "../types/multiplayer.types";

export default function MultiplayerRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { room, loading, myPlayer, isMyTurn, players, handleFlipCard, handleReady, handleLeave } =
    useMultiplayer(roomId ?? null, user?.uid ?? null);

  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (room?.status === "finished") {
      setShowResult(true);
    }
  }, [room?.status]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-slate-400 text-lg">Loading room...</div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-slate-400 text-lg">Room not found or has ended.</p>
        <button
          onClick={ () => navigate("/lobby") }
          className="px-6 py-2 bg-indigo-600 text-white rounded-xl"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const isHost = room.hostId === user?.uid;
  const allReady = players.length >= 2 && players.every((p) => p.isReady);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const winner = showResult
    ? sortedPlayers[0]
    : null;
  const boardCols = room.difficulty === "4x4" ? 4 : room.difficulty === "6x6" ? 6 : 8;
  const boardStyle: CSSProperties = {
    "--board-cols": boardCols,
    "--card-size":
      "clamp(2.5rem, calc((100vw - 2rem - (var(--board-cols) - 1) * 0.5rem) / var(--board-cols)), 5.5rem)",
  } as CSSProperties;
  const cardSize = room.difficulty === "8x8" ? "sm" : "fluid";

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Room Header */ }
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">
            Room:{ " " }
            <span className="text-indigo-400 font-mono text-2xl">{ roomId }</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            { room.gameType === "card-flip" ? "🃏 Card Flip Match" : "🔤 Word Match" } ·{ " " }
            { room.difficulty } · { room.theme }
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={ () => navigator.clipboard.writeText(roomId || "") }
            className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors"
            title="Copy room code"
          >
            📋 Copy Code
          </button>
          <button
            onClick={ handleLeaveRoom }
            className="px-3 py-1.5 bg-red-900/30 text-red-400 text-sm rounded-lg hover:bg-red-900/50 transition-colors border border-red-800"
          >
            Leave
          </button>
        </div>
      </div>

      {/* Players */ }
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        { sortedPlayers.map((p: RoomPlayer) => (
          <div
            key={ p.uid }
            className={ `bg-slate-800 border rounded-xl p-3 flex items-center gap-3 ${
              room.gameState?.currentTurn === p.uid
                ? "border-indigo-500 shadow-lg shadow-indigo-500/10"
                : "border-slate-700"
            }` }
          >
            <div
              className="w-9 h-9 rounded-full bg-indigo-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              { p.photoURL ? (
                <img src={ p.photoURL } className="w-9 h-9 rounded-full" alt="" />
              ) : (
                p.displayName[0].toUpperCase()
              ) }
            </div>
            <div className="overflow-hidden">
              <p className="text-white text-sm font-medium truncate">
                { p.displayName }
                { p.uid === room.hostId && (
                  <span className="ml-1 text-amber-400 text-xs">👑</span>
                ) }
              </p>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs font-bold">{ p.score } pts</span>
                { room.status === "waiting" && (
                  <span
                    className={ `text-xs ${ p.isReady ? "text-emerald-400" : "text-slate-500" }` }
                  >
                    { p.isReady ? "✓ Ready" : "Not ready" }
                  </span>
                ) }
              </div>
            </div>
            { room.gameState?.currentTurn === p.uid && (
              <span className="ml-auto text-indigo-400 text-lg">▶</span>
            ) }
          </div>
        )) }
        {/* Empty slots */ }
        { Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
          <div
            key={ `empty-${ i }` }
            className="bg-slate-800/50 border border-dashed border-slate-700 rounded-xl p-3 flex items-center justify-center"
          >
            <span className="text-slate-600 text-sm">Waiting for player...</span>
          </div>
        )) }
      </div>

      {/* Waiting Room Controls */ }
      { room.status === "waiting" && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 mb-6 text-center">
          <p className="text-slate-400 mb-4">
            { players.length < 2
              ? "Waiting for at least 2 players to join..."
              : allReady
                ? "All players ready! Host can start the game."
                : "All players must be ready before starting." }
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={ () => handleReady(!myPlayer?.isReady) }
              className={ `px-6 py-2.5 font-semibold rounded-xl transition-colors ${
                myPlayer?.isReady
                  ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  : "bg-emerald-700 text-white hover:bg-emerald-600"
              }` }
            >
              { myPlayer?.isReady ? "✓ Ready (click to unready)" : "Mark as Ready" }
            </button>
            { isHost && allReady && (
              <button
                onClick={ handleStart }
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
              >
                🚀 Start Game
              </button>
            ) }
          </div>
        </div>
      ) }

      {/* Turn indicator */ }
      { room.status === "playing" && (
        <div
          className={ `text-center py-3 rounded-xl mb-4 font-semibold ${
            isMyTurn
              ? "bg-indigo-600/20 border border-indigo-500 text-indigo-300"
              : "bg-slate-800 border border-slate-700 text-slate-400"
          }` }
        >
          { isMyTurn ? "🟢 Your Turn — Pick a card!" : `⏳ Waiting for ${ room.gameState?.currentTurn ? players.find(p => p.uid === room.gameState?.currentTurn)?.displayName : "..." }'s turn` }
        </div>
      ) }

      {/* Game Board */ }
      { room.status === "playing" && room.gameState && (
        <motion.div
          className={ `grid w-fit mx-auto gap-2 sm:gap-3 place-items-center ${
            room.difficulty === "4x4" ? "grid-cols-4" :
              room.difficulty === "6x6" ? "grid-cols-6" : "grid-cols-8"
          }` }
          style={ boardStyle }
          initial={ { opacity: 0 } }
          animate={ { opacity: 1 } }
        >
          { room.gameState.cards.map((card) => {
            const isFlipped = room.gameState?.flippedCards?.includes(card.id) ?? false;
            const renderCard = isFlipped ? { ...card, isFlipped: true } : card;
            return (
            <Card
              key={ card.id }
              card={ renderCard }
              onClick={ handleFlipCard }
              size={ cardSize }
              disabled={ !isMyTurn }
            />
            );
          }) }
        </motion.div>
      ) }

      {/* Result Modal */ }
      <AnimatePresence>
        { showResult && winner && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            exit={ { opacity: 0 } }
          >
            <motion.div
              className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl"
              initial={ { scale: 0.7 } }
              animate={ { scale: 1 } }
            >
              <div className="text-6xl mb-4">{ winner.uid === user?.uid ? "🏆" : "😊" }</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                { winner.uid === user?.uid ? "You Won!" : `${ winner.displayName } Won!` }
              </h2>
              <div className="space-y-2 my-4">
                { sortedPlayers.map((p, i) => (
                  <div
                    key={ p.uid }
                    className="flex items-center justify-between bg-slate-900 rounded-lg px-4 py-2"
                  >
                    <span className="text-slate-300">
                      { i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉" } { p.displayName }
                    </span>
                    <span className="text-amber-400 font-bold">{ p.score } pts</span>
                  </div>
                )) }
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={ () => navigate("/lobby") }
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
                >
                  Back to Lobby
                </button>
                { isHost && (
                  <button
                    onClick={ handleCleanup }
                    className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl transition-colors"
                  >
                    Close Room
                  </button>
                ) }
              </div>
            </motion.div>
          </motion.div>
        ) }
      </AnimatePresence>
    </div>
  );
}
