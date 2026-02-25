import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { createRoom, joinRoom } from "../firebase/realtime";
import type { CardTheme, Difficulty, GameType } from "../types/game.types";
import type { RoomPlayer } from "../types/multiplayer.types";
import { ChevronLeft } from "lucide-react";

const GAME_OPTIONS: {
  id: GameType;
  label: string;
  badge: string;
  supportsMulti: boolean,
  supportDifficulty: boolean
}[] = [
  { id: "card-flip", label: "Card Flip Match", badge: "CF", supportsMulti: true, supportDifficulty: true },
  { id: "number-sequence", label: "Number Sequence", badge: "NS", supportsMulti: false, supportDifficulty: false },
  { id: "pattern-memory", label: "Pattern Memory", badge: "PM", supportsMulti: false, supportDifficulty: true },
  { id: "word-match", label: "Word Match", badge: "WM", supportsMulti: true, supportDifficulty: true },
];

const DIFFICULTIES: Difficulty[] = ["4x4", "6x6", "8x8"];
const THEMES: CardTheme[] = ["colors", "emojis", "numbers", "animals", "symbols"];

export default function GameLobby() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [gameType, setGameType] = useState<GameType>("card-flip");
  const [difficulty, setDifficulty] = useState<Difficulty>("4x4");
  const [theme, setTheme] = useState<CardTheme>("emojis");
  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const selectedGame = GAME_OPTIONS.find((g) => g.id === gameType)!;

  const handleSinglePlay = () => {
    navigate(`/play/${ gameType }?difficulty=${ difficulty }&theme=${ theme }`);
  };

  const handleCreateRoom = async () => {
    if (!isAuthenticated || !user) {
      navigate("/login");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const hostPlayer: RoomPlayer = {
        uid: user.uid,
        displayName: user.displayName || "Player",
        photoURL: user.photoURL || "",
        score: 0,
        isReady: false,
        isCurrentTurn: false,
        joinedAt: Date.now(),
      };
      const roomId = await createRoom(hostPlayer, gameType, difficulty, theme);
      navigate(`/room/${ roomId }`);
    } catch {
      setError("Failed to create room. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!isAuthenticated || !user) {
      navigate("/login");
      return;
    }
    if (!roomCode.trim()) {
      setError("Enter a room code");
      return;
    }
    setJoining(true);
    setError("");
    try {
      const player: RoomPlayer = {
        uid: user.uid,
        displayName: user.displayName || "Player",
        photoURL: user.photoURL || "",
        score: 0,
        isReady: false,
        isCurrentTurn: false,
        joinedAt: Date.now(),
      };
      const ok = await joinRoom(roomCode.toUpperCase(), player);
      if (ok) {
        navigate(`/room/${ roomCode.toUpperCase() }`);
      } else {
        setError("Room not found or is full/in progress.");
      }
    } catch {
      setError("Failed to join room. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const difficultyLabel =
    difficulty === "4x4" ? "8 pairs - Easy" : difficulty === "6x6" ? "18 pairs - Medium" : "32 pairs - Hard";

  return (
    <div className="max-w-4xl mx-auto px-4 md:pt-7 lg:py-10 pb-10">
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
          <h1 className="text-3xl font-bold text-white">Game Lobby</h1>
        </div>
        <p className="text-text-muted mb-8">Configure your game and start playing</p>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="surface p-5">
              <h2
                className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em] mb-3">
                Select Game
              </h2>
              <div className="grid grid-cols-2 gap-2">
                { GAME_OPTIONS.map((game) => (
                  <button
                    key={ game.id }
                    onClick={ () => {
                      setGameType(game.id);
                    } }
                    className={ `option-btn flex items-center gap-2 p-1.5 sm:p-2 md:p-3 text-left ${
                      gameType === game.id ? "option-btn-active" : ""
                    }` }
                  >
                    <span className="logo-mark text-xs sm:text-sm aspect-square">{ game.badge }</span>
                    <span className="text-xs sm:text-sm font-medium">{ game.label }</span>
                  </button>
                )) }
              </div>
            </div>

            { selectedGame.supportDifficulty && <div className="surface p-5">
              <h2
                className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em] mb-3">
                Difficulty
              </h2>
              <div className="flex gap-2">
                { DIFFICULTIES.map((d) => (
                  <button
                    key={ d }
                    onClick={ () => setDifficulty(d) }
                    className={ `option-btn flex-1 py-2 text-sm font-medium ${ d === "8x8" ? "hidden md:inline" : "" }
                       ${ difficulty === d ? "option-btn-active" : "" }` }
                  >
                    { d }
                  </button>
                )) }
              </div>
              <p className="text-xs text-text-muted mt-2">{ difficultyLabel }</p>
            </div>
            }
            { (gameType === "card-flip" || gameType === "word-match") && (
              <div className="surface p-5">
                <h2
                  className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em] mb-3">
                  Card Theme
                </h2>
                <div className="flex flex-wrap gap-2">
                  { THEMES.map((t) => (
                    <button
                      key={ t }
                      onClick={ () => setTheme(t) }
                      className={ `option-btn px-3 py-1.5 text-sm font-medium capitalize ${
                        theme === t ? "option-btn-active" : ""
                      }` }
                    >
                      { t }
                    </button>
                  )) }
                </div>
              </div>
            ) }
          </div>

          <div className="space-y-4">
            <div className="surface p-5">
              <h2
                className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em] mb-4">
                Single Player
              </h2>
              <p className="text-text-muted text-sm mb-4">
                Play alone, beat your time and score, and climb the leaderboard.
              </p>
              <button
                onClick={ handleSinglePlay }
                className="btn btn-primary w-full py-3"
              >
                Play Solo
              </button>
            </div>

            { selectedGame.supportsMulti && (
              <div className="surface p-5">
                <h2
                  className="text-xs font-semibold text-text-muted uppercase tracking-[0.2em] mb-4">
                  Multiplayer
                </h2>
                { !isAuthenticated && (
                  <p className="text-amber-200 text-sm mb-3">
                    Sign in required for multiplayer
                  </p>
                ) }
                { error && (
                  <p className="text-red-300 text-sm mb-3">{ error }</p>
                ) }
                <div className="space-y-3">
                  <button
                    onClick={ handleCreateRoom }
                    disabled={ creating }
                    className="btn btn-secondary w-full py-3"
                  >
                    { creating ? "Creating..." : "Create Room" }
                  </button>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ roomCode }
                      onChange={ (e) => setRoomCode(e.target.value.toUpperCase()) }
                      placeholder="Room Code"
                      maxLength={ 6 }
                      className="input-field flex-1 uppercase mono text-sm"
                    />
                    <button
                      onClick={ handleJoinRoom }
                      disabled={ joining }
                      className="btn btn-ghost px-4 py-2.5 text-sm"
                    >
                      { joining ? "..." : "Join" }
                    </button>
                  </div>
                </div>
              </div>
            ) }
          </div>
        </div>
      </motion.div>
    </div>
  );
}
