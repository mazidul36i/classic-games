import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Users, KeyRound, X } from "lucide-react";
import PageHead from "../components/layout/PageHead";
import { useAuth } from "../hooks/useAuth";
import { play } from "../audio/cues";
import { useQuickMatch } from "../hooks/useQuickMatch";
import { createRoom, joinRoom } from "../firebase/realtime";
import type { CardTheme, Difficulty, GameType } from "../types/game.types";
import type { RoomPlayer } from "../types/multiplayer.types";

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* The games keep the card identities the front page gave them. Dots and Boxes
   is the one that cannot be played alone — it is a game against someone. */
const GAME_OPTIONS: {
  id: GameType;
  label: string;
  rank: string;
  suit: string;
  red: boolean;
  supportsSolo: boolean;
  supportsMulti: boolean;
  supportDifficulty: boolean;
  usesDeck: boolean;
  /** Whether the host chooses how many seats the table has. Games without it
   *  are duels, and start as soon as two players are ready. */
  supportsSeats: boolean;
}[] = [
  { id: "dots-and-boxes", label: "Dots & Boxes", rank: "10", suit: "♦", red: true, supportsSolo: false, supportsMulti: true, supportDifficulty: true, usesDeck: false, supportsSeats: true },
  { id: "card-flip", label: "Card Flip", rank: "A", suit: "♠", red: false, supportsSolo: true, supportsMulti: true, supportDifficulty: true, usesDeck: true, supportsSeats: false },
  { id: "number-sequence", label: "Sequence", rank: "K", suit: "♦", red: true, supportsSolo: true, supportsMulti: false, supportDifficulty: false, usesDeck: false, supportsSeats: false },
  { id: "pattern-memory", label: "Pattern", rank: "Q", suit: "♣", red: false, supportsSolo: true, supportsMulti: false, supportDifficulty: true, usesDeck: false, supportsSeats: false },
  { id: "word-match", label: "Word Match", rank: "J", suit: "♥", red: true, supportsSolo: true, supportsMulti: true, supportDifficulty: true, usesDeck: true, supportsSeats: false },
];

const DIFFICULTIES: Difficulty[] = ["4x4", "6x6", "8x8"];
const THEMES: CardTheme[] = ["colors", "emojis", "numbers", "animals", "symbols"];
const VALID_GAME_TYPES: GameType[] = [
  "dots-and-boxes",
  "card-flip",
  "number-sequence",
  "pattern-memory",
  "word-match",
];

/** Elapsed time, as a table clock reads it. */
const asClock = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  "4x4": "Eight pairs — a short hand.",
  "6x6": "Eighteen pairs — the standard game.",
  "8x8": "Thirty-two pairs — the long night.",
};

/* The same setting, spent on a board instead of a deck. */
const BOARD_NOTE: Record<Difficulty, string> = {
  "4x4": "Sixteen boxes — a short game.",
  "6x6": "Thirty-six boxes — the standard board.",
  "8x8": "Sixty-four boxes — the long night.",
};

/* A table of four is the house limit, and the rules agree — see `maxPlayers`
   in database.rules.json. Each seat draws in its own ink under its own suit. */
const SEAT_COUNTS = [2, 3, 4] as const;

const SEATS_NOTE: Record<number, string> = {
  2: "Two players — hearts and diamonds.",
  3: "Three players — hearts, diamonds and spades.",
  4: "Four players — the full deck of suits.",
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
  const rawSeats = Number(searchParams.get("seats"));
  const chosenSeats: number = SEAT_COUNTS.includes(rawSeats as 2 | 3 | 4) ? rawSeats : 2;

  const [roomCode, setRoomCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const onMatched = useCallback(
    (matchedRoomId: string) => navigate(`/room/${matchedRoomId}`),
    [navigate]
  );
  const match = useQuickMatch(onMatched);

  const selectedGame = GAME_OPTIONS.find((g) => g.id === gameType)!;
  const busy = creating || joining || match.searching;

  /* A game with no deck still has to sit in some matchmaking bucket — and the
     bucket is keyed by the deck. Two players who never saw the deck picker must
     not be sorted into different buckets by whatever `?theme` they happened to
     arrive carrying, so those games all queue under one. */
  const tableTheme: CardTheme = selectedGame.usesDeck ? theme : "emojis";
  const isDots = gameType === "dots-and-boxes";
  /* A game without a seats control is a duel, and always has been. */
  const seats = selectedGame.supportsSeats ? chosenSeats : 2;
  const table = { gameType, difficulty, theme: tableTheme, seats };

  const asPlayer = (): RoomPlayer => ({
    uid: user!.uid,
    displayName: user!.displayName || "Player",
    photoURL: user!.photoURL || "",
    score: 0,
    roundsWon: 0,
    isReady: false,
    joinedAt: Date.now(),
    connected: true,
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

  const handleSeatsChange = (n: number) => {
    setSearchParams((prev) => {
      prev.set("seats", String(n));
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

  /** A refusal the player should notice: the message, and a cue with it.
   *  Rare enough to be feedback rather than noise — which is why the option
   *  rows and the dialogs stay silent. */
  const refuse = (message: string) => {
    setError(message);
    play("wrong");
  };

  const handleCreateRoom = async () => {
    if (!isAuthenticated || !user) {
      sendToLogin(location.pathname + location.search);
      return;
    }
    setCreating(true);
    setError("");
    try {
      const roomId = await createRoom(asPlayer(), gameType, difficulty, tableTheme, {
        maxPlayers: seats,
      });
      navigate(`/room/${roomId}`);
    } catch (err) {
      // A bare `catch {}` here once hid a PERMISSION_DENIED for days: the room
      // never appeared and the UI only ever said "try again". Keep the reason.
      console.error("[lobby] createRoom failed", err);
      refuse("Failed to open a room. Try again.");
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
      refuse("Enter a room code");
      return;
    }
    setJoining(true);
    setError("");
    try {
      const result = await joinRoom(roomCode.toUpperCase(), asPlayer());
      if (result === "joined") {
        navigate(`/room/${roomCode.toUpperCase()}`);
      } else if (result === "full") {
        refuse("Every seat at that table is taken.");
      } else if (result === "in-play") {
        refuse("That hand is already under way.");
      } else {
        refuse("No room answers to that code.");
      }
    } catch (err) {
      console.error("[lobby] joinRoom failed", err);
      refuse("Failed to join the room. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  /* This does not resolve in one shot any more — the search runs for up to two
     minutes and reports back through `match`. See useQuickMatch. */
  const handleQuickMatch = () => {
    if (!isAuthenticated || !user) {
      sendToLogin(location.pathname + location.search);
      return;
    }
    setError("");
    void match.start(asPlayer(), table);
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
              <span className="p-tick">Five on offer</span>
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
                <span className="p-tick">{isDots ? "Size of board" : "Length of hand"}</span>
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
                {(isDots ? BOARD_NOTE : DIFFICULTY_NOTE)[difficulty]}
              </p>
            </section>
          )}

          {selectedGame.supportsSeats && (
            <section className="p-panel px-6 sm:px-7 pt-6 pb-7">
              <div className="p-panel-head">
                <span className="p-tick">Seats at the table</span>
              </div>
              <div className="flex gap-2.5">
                {SEAT_COUNTS.map((n) => (
                  <button
                    key={n}
                    onClick={() => handleSeatsChange(n)}
                    aria-pressed={seats === n}
                    className={`p-opt flex-1 ${seats === n ? "p-opt-on" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-[0.92rem] leading-[1.7] text-ink-soft mt-4">
                {SEATS_NOTE[seats]} The hand is dealt once every seat is taken.
              </p>
            </section>
          )}

          {selectedGame.usesDeck && (
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
          {/* Not every game can be played alone — one of them is a game
              against someone, and there is nothing here to offer a solo player. */}
          {selectedGame.supportsSolo && (
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
          )}

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
                {(error || match.error) && (
                  <div className="p-alert mb-5" role="alert">
                    {error || match.error}
                  </div>
                )}

                {/* ── The search, while it runs ──
                    A seat is genuinely open at a real table for as long as this
                    clock is ticking, so the other half of the room can find it. */}
                {match.searching ? (
                  <div className="p-search" role="status" aria-live="polite">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="p-tick">Dealing you in…</span>
                      <span className="p-figure text-[1.4rem] text-paper">
                        {asClock(match.elapsedMs)}
                      </span>
                    </div>

                    <div className="p-search-track" aria-hidden="true">
                      <span className="p-search-sweep" />
                    </div>

                    <p className="text-[0.92rem] leading-[1.7] text-paper/70 mb-5">
                      {match.seated > 1 ? (
                        <>
                          {match.seated} of {seats} seated at your table —{" "}
                          {selectedGame.label}, {difficulty.replace("x", "×")}. Holding it
                          open for the {seats - match.seated === 1 ? "last" : "rest"}; the
                          hand is dealt the moment every seat is taken.
                        </>
                      ) : (
                        <>
                          {seats === 2 ? "A seat is" : `${seats - 1} seats are`} open at your
                          table — {selectedGame.label}, {difficulty.replace("x", "×")}. We'll
                          keep looking for {Math.round(match.timeoutSeconds / 60)} minutes,
                          and you'll go straight to the table once{" "}
                          {seats === 2 ? "someone sits down" : "it fills"}.
                        </>
                      )}
                    </p>

                    <button
                      onClick={() => void match.cancel()}
                      className="p-btn p-btn-outline p-btn-block"
                    >
                      <X className="w-3.5 h-3.5" />
                      Stop looking
                    </button>
                  </div>
                ) : (
                  <>
                    {match.phase === "timed-out" && (
                      <div className="p-note mb-5">
                        Nobody came to the table in{" "}
                        {Math.round(match.timeoutSeconds / 60)} minutes. Try again, or
                        open a private room and send the code to someone.
                      </div>
                    )}
                    <button
                      onClick={handleQuickMatch}
                      disabled={busy}
                      className="p-btn p-btn-cream p-btn-block"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {match.phase === "timed-out" ? "Look again" : "Find an opponent"}
                    </button>
                  </>
                )}

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
