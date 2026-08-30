import { useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Users, KeyRound } from "lucide-react";
import PageHead from "../components/layout/PageHead";
import { useAuth } from "../hooks/useAuth";
import { createRoom, joinRoom, quickMatch } from "../firebase/realtime";
import type { CardTheme, Difficulty, GameType } from "../types/game.types";
import type { RoomPlayer } from "../types/multiplayer.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* The four games keep the card identities the front page gave them. */
const GAME_OPTIONS: {
  id: GameType;
  label: string;
  rank: string;
  suit: string;
  red: boolean;
  supportsMulti: boolean;
  supportDifficulty: boolean;
}[] = [
  { id: "card-flip", label: "Card Flip", rank: "A", suit: "♠", red: false, supportsMulti: true, supportDifficulty: true },
  { id: "number-sequence", label: "Sequence", rank: "K", suit: "♦", red: true, supportsMulti: false, supportDifficulty: false },
  { id: "pattern-memory", label: "Pattern", rank: "Q", suit: "♣", red: false, supportsMulti: false, supportDifficulty: true },
  { id: "word-match", label: "Word Match", rank: "J", suit: "♥", red: true, supportsMulti: true, supportDifficulty: true },
];

const DIFFICULTIES: Difficulty[] = ["4x4", "6x6", "8x8"];
const THEMES: CardTheme[] = ["colors", "emojis", "numbers", "animals", "symbols"];
const VALID_GAME_TYPES: GameType[] = ["card-flip", "number-sequence", "pattern-memory", "word-match"];

const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  "4x4": "Eight pairs — a short hand.",
  "6x6": "Eighteen pairs — the standard game.",
  "8x8": "Thirty-two pairs — the long night.",
};

export default function GameLobby() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { user, isAuthenticated } = useAuth();
  const { gameType: rawGameType } = useParams<{ gameType: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive state from URL
  const gameType: GameType = VALID_GAME_TYPES.includes(rawGameType as GameType)
    ? (rawGameType as GameType)
    : "card-flip";
  const rawDifficulty = searchParams.get("difficulty") as Difficulty;
  const difficulty: Difficulty = DIFFICULTIES.includes(rawDifficulty) ? rawDifficulty : "4x4";
  const rawTheme = searchParams.get("theme") as CardTheme;
  const theme: CardTheme = THEMES.includes(rawTheme) ? rawTheme : "emojis";

  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");

  const selectedGame = GAME_OPTIONS.find((g) => g.id === gameType)!;
  const busy = creating || joining || matching;

  const asPlayer = (): RoomPlayer => ({
    uid: user!.uid,
    displayName: user!.displayName || "Player",
    photoURL: user!.photoURL || "",
    score: 0,
    roundsWon: 0,
    isReady: false,
    joinedAt: Date.now(),
  });

  /* Guests can set the table but not sit at it — send them to the door and
     bring them back to whatever they were about to do. */
  const sendToLogin = (destination: string) => {
    navigate("/login", { state: { from: destination } });
  };

  const handleGameTypeChange = (newType: GameType) => {
    navigate(`/lobby/${newType}?${searchParams.toString()}`, { replace: true });
  };

  const handleDifficultyChange = (d: Difficulty) => {
    setSearchParams((prev) => {
      prev.set("difficulty", d);
      return prev;
    }, { replace: true });
  };

  const handleThemeChange = (t: CardTheme) => {
    setSearchParams((prev) => {
      prev.set("theme", t);
      return prev;
    }, { replace: true });
  };

  const handleSinglePlay = () => {
    const table = `/play/${gameType}?difficulty=${difficulty}&theme=${theme}`;
    if (!isAuthenticated || !user) {
      sendToLogin(table);
      return;
    }
    navigate(table);
  };

  const handleCreateRoom = async () => {
    if (!isAuthenticated || !user) {
      sendToLogin(location.pathname + location.search);
      return;
    }
    setCreating(true);
    setError("");
    try {
      const roomId = await createRoom(asPlayer(), gameType, difficulty, theme);
      navigate(`/room/${roomId}`);
    } catch {
      setError("Failed to open a room. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!isAuthenticated || !user) {
      sendToLogin(location.pathname + location.search);
      return;
    }
    if (!roomCode.trim()) {
      setError("Enter a room code");
      return;
    }
    setJoining(true);
    setError("");
    try {
      const result = await joinRoom(roomCode.toUpperCase(), asPlayer());
      if (result === "joined") {
        navigate(`/room/${roomCode.toUpperCase()}`);
      } else if (result === "full") {
        setError("Every seat at that table is taken.");
      } else if (result === "in-play") {
        setError("That hand is already under way.");
      } else {
        setError("No room answers to that code.");
      }
    } catch {
      setError("Failed to join the room. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  const handleQuickMatch = async () => {
    if (!isAuthenticated || !user) {
      sendToLogin(location.pathname + location.search);
      return;
    }
    setMatching(true);
    setError("");
    try {
      const roomId = await quickMatch(asPlayer(), gameType, difficulty, theme);
      navigate(`/room/${roomId}`);
    } catch {
      setError("Nobody at the table just now. Please try again.");
    } finally {
      setMatching(false);
    }
  };

  return (
    <div className="relative z-10 max-w-[1180px] mx-auto px-5 sm:px-10 pt-6 pb-20 sm:pb-28">
      <PageHead
        section="The Table"

        kicker="Before the deal"
        title={
          <>
            Set the table,
            <br />
            then play.
          </>
        }
        lede="Pick a game, choose how long a hand you want, and take a seat — on your own or with someone across from you."
      />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, delay: 0.12, ease: EASE }}
        className="grid lg:grid-cols-12 gap-7 lg:gap-8 mt-14 sm:mt-16 items-start"
      >
        {/* ── The settings sheet ── */}
        <div className="lg:col-span-7 space-y-7">
          <section className="p-panel px-6 sm:px-7 pt-6 pb-7">
            <div className="p-panel-head">
              <span className="p-tick">The game</span>
              <span className="p-tick">Four on offer</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {GAME_OPTIONS.map((game) => (
                <button
                  key={game.id}
                  onClick={() => handleGameTypeChange(game.id)}
                  aria-pressed={gameType === game.id}
                  className={`p-opt p-opt-card ${gameType === game.id ? "p-opt-on" : ""}`}
                >
                  <span
                    className={`p-opt-rank ${
                      gameType === game.id ? "" : game.red ? "text-vermilion" : "text-ink-deep"
                    }`}
                  >
                    {game.rank}
                    {game.suit}
                  </span>
                  <span>{game.label}</span>
                </button>
              ))}
            </div>
          </section>

          {selectedGame.supportDifficulty && (
            <section className="p-panel px-6 sm:px-7 pt-6 pb-7">
              <div className="p-panel-head">
                <span className="p-tick">Length of hand</span>
              </div>
              <div className="flex gap-2.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDifficultyChange(d)}
                    aria-pressed={difficulty === d}
                    className={`p-opt flex-1 ${d === "8x8" ? "p-opt-wide" : ""} ${
                      difficulty === d ? "p-opt-on" : ""
                    }`}
                  >
                    {d.replace("x", "×")}
                  </button>
                ))}
              </div>
              <p className="text-[0.92rem] leading-[1.7] text-ink-soft mt-4">
                {DIFFICULTY_NOTE[difficulty]}
              </p>
            </section>
          )}

          {(gameType === "card-flip" || gameType === "word-match") && (
            <section className="p-panel px-6 sm:px-7 pt-6 pb-7">
              <div className="p-panel-head">
                <span className="p-tick">The deck</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    aria-pressed={theme === t}
                    className={`p-opt ${theme === t ? "p-opt-on" : ""}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Taking a seat ── */}
        <div className="lg:col-span-5 space-y-7 lg:sticky lg:top-24">
          <section className="p-panel px-6 sm:px-7 pt-6 pb-7">
            <div className="p-panel-head">
              <span className="p-tick">Alone</span>
              <span className="p-suits text-[0.95rem] text-ink-deep" aria-hidden="true">♠</span>
            </div>
            <h2 className="p-display text-[1.4rem] leading-snug mb-3">Play a solo hand</h2>
            <p className="text-[0.95rem] leading-[1.72] text-ink-soft mb-7">
              Beat your own time, then put the score on the board. No one waiting, no turns to keep.
            </p>
            {!isAuthenticated && (
              <div className="p-note mb-5">Sign in first — every hand is played under your name.</div>
            )}
            <button onClick={handleSinglePlay} className="p-btn p-btn-solid p-btn-block">
              {isAuthenticated ? "Deal me in" : "Sign in to play"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </section>

          {selectedGame.supportsMulti && (
            <section className="p-felt rounded-sm px-6 sm:px-8 pt-7 pb-8">
              <div className="relative z-10">
                <div className="p-panel-head">
                  <span className="p-tick">Together</span>
                  <span className="p-suits text-[0.95rem] text-vermilion" aria-hidden="true">♥</span>
                </div>

                <h2 className="p-display text-[1.4rem] leading-snug text-paper mb-3">
                  Open a second seat
                </h2>
                <p className="text-[0.95rem] leading-[1.72] text-paper/75 mb-6">
                  Draw a stranger, or send a code to someone you know. Every flip lands on both screens at once.
                </p>

                {!isAuthenticated && (
                  <div className="p-note mb-5">Sign in first — rooms are kept under your name.</div>
                )}
                {error && (
                  <div className="p-alert mb-5" role="alert">
                    {error}
                  </div>
                )}

                <button
                  onClick={handleQuickMatch}
                  disabled={busy}
                  className="p-btn p-btn-cream p-btn-block"
                >
                  <Users className="w-3.5 h-3.5" />
                  {matching ? "Looking…" : "Find an opponent"}
                </button>

                <div className="flex items-center gap-4 my-7">
                  <span className="flex-1 p-rule" />
                  <span className="p-tick">Private room</span>
                  <span className="flex-1 p-rule" />
                </div>

                <button
                  onClick={handleCreateRoom}
                  disabled={busy}
                  className="p-btn p-btn-outline p-btn-block"
                >
                  {creating ? "Opening…" : "Open a room"}
                </button>

                <div className="flex items-end gap-3 mt-6">
                  <div className="flex-1">
                    <label className="p-label" htmlFor="room-code">
                      Have a code?
                    </label>
                    <input
                      id="room-code"
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="ABC123"
                      maxLength={6}
                      className="p-input p-code"
                    />
                  </div>
                  <button
                    onClick={handleJoinRoom}
                    disabled={busy}
                    className="p-btn p-btn-cream shrink-0"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {joining ? "…" : "Join"}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </div>
  );
}
