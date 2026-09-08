import { useEffect, useRef, useState } from "react";
import {
  subscribeToRoom,
  subscribeToServerTimeOffset,
  flipCard,
  resolvePair,
  passTurn,
  nextPlayerUid,
  setPlayerReady,
  leaveRoom,
  armLastSeatDisconnect,
  disarmLastSeatDisconnect,
  armSeatDisconnect,
  takeSeatBack,
  creditRoundWin,
  resetOwnScoreForNewRound,
  seedNextRoundProposal,
  proposeNextRound,
  setNextRoundReady,
  startNextRound,
  TURN_LIMIT_MS,
  TURN_GRACE_MS,
} from "../firebase/realtime";
import {
  isFlipAllowed,
  resolvePairOutcome,
  activeOrder,
  claimedPairs,
  REVEAL_MS,
} from "../utils/flipUtils";
import { generateCards } from "../utils/cardUtils";
import { generateWordCards } from "../utils/wordUtils";
import type { Room, RoomPlayer } from "../types/multiplayer.types";
import type { CardItem, CardTheme, Difficulty, GameType } from "../types/game.types";

/** How long to wait before trying a refused resolve again, and how many times.
 *  A pair nobody clears is a dead board, so this does not give up quietly — but
 *  the turn clock is the real backstop, so it does not need to try forever. */
const RESOLVE_RETRY_MS = 1_500;
const RESOLVE_ATTEMPTS = 4;

/** Highest score first, ties broken by uid so every client agrees on an order
 *  without needing to compare notes. */
const rankByScore = (players: Record<string, RoomPlayer>): RoomPlayer[] =>
  Object.values(players ?? {}).sort(
    (a, b) => b.score - a.score || a.uid.localeCompare(b.uid)
  );

const dealCards = (gameType: string, difficulty: Difficulty, theme: CardTheme): CardItem[] =>
  gameType === "word-match" ? generateWordCards(difficulty) : generateCards(difficulty, theme);

export const useMultiplayer = (roomId: string | null, currentUid: string | null) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [loadedRoomId, setLoadedRoomId] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const unsubRef = useRef<(() => void) | null>(null);
  const passedTurnRef = useRef<number | null>(null);
  const lastSeatArmedRef = useRef(false);
  /* The room as of the last snapshot, for callbacks that fire on a timer and
     must not act on the table as it looked when they were scheduled. */
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeToRoom(roomId, (r) => {
      setRoom(r);
      setLoadedRoomId(roomId);
    });
    unsubRef.current = unsub;
    return () => {
      unsub();
    };
  }, [roomId]);

  // Turn deadlines are stamped by the server; this is how far off this device is.
  useEffect(() => subscribeToServerTimeOffset(setServerOffset), []);

  const loading = Boolean(roomId) && loadedRoomId !== roomId;
  const activeRoom = loadedRoomId === roomId ? room : null;

  useEffect(() => {
    roomRef.current = activeRoom;
  }, [activeRoom]);

  const isPlaying = activeRoom?.status === "playing";
  const gameState = activeRoom?.gameState ?? null;
  const turnStartedAt = gameState?.turnStartedAt ?? 0;

  // Only tick while there is a clock to draw.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const turnElapsed = turnStartedAt ? nowMs + serverOffset - turnStartedAt : 0;
  const secondsLeft =
    isPlaying && turnStartedAt
      ? Math.max(0, Math.ceil((TURN_LIMIT_MS - turnElapsed) / 1000))
      : null;

  /* Nobody is going to come back to a turn that ran out. Anyone still at the
     table may move it on — the rules permit this write only once the clock has
     actually expired, so it cannot be used to jump a live turn. Every client
     tries; the first one wins and the rest are refused, which is fine. */
  useEffect(() => {
    if (!roomId || !currentUid || !isPlaying || !gameState || !activeRoom) return;
    if (!activeRoom.players?.[currentUid]) return;
    if (turnElapsed <= TURN_LIMIT_MS + TURN_GRACE_MS) return;
    if (passedTurnRef.current === turnStartedAt) return;

    const next = nextPlayerUid(activeRoom.players, gameState.currentTurn);
    if (next === gameState.currentTurn) return; // last player standing keeps it

    passedTurnRef.current = turnStartedAt;
    passTurn(roomId, next).catch(() => {
      /* someone else's pass landed first */
    });
  }, [roomId, currentUid, isPlaying, gameState, activeRoom, turnElapsed, turnStartedAt]);

  /* A private room is indexed nowhere, so if the last player's tab closes there
     is no one left who could ever find it to clear it. Have them take it with
     them. Public rooms stay: an empty open room is still a joinable one. */
  useEffect(() => {
    if (!roomId || !activeRoom || !currentUid) return;
    const seated = Object.keys(activeRoom.players ?? {});
    const alone = seated.length === 1 && seated[0] === currentUid;
    const shouldArm = alone && activeRoom.isPrivate;

    if (shouldArm && !lastSeatArmedRef.current) {
      lastSeatArmedRef.current = true;
      armLastSeatDisconnect(roomId).catch(() => {});
    } else if (!shouldArm && lastSeatArmedRef.current) {
      lastSeatArmedRef.current = false;
      disarmLastSeatDisconnect(roomId, currentUid, activeRoom.status !== "waiting").catch(
        () => {}
      );
    }
  }, [roomId, activeRoom, currentUid]);

  /* ── Holding our seat ──────────────────────────────────────────────────────
     Say we are here, and leave standing instructions for what should become of
     the seat if this tab goes away.

     Both have to be re-stated when the room changes phase, because what should
     happen to a seat depends on it: a waiting room gives the seat up, a hand in
     play keeps it and marks it away. And both have to be re-stated on mount,
     which is the case this exists for — a reload arrives here holding a seat
     the table kept for it, marked away, with a dead onDisconnect belonging to a
     websocket that no longer exists. */
  const armedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    const mine = activeRoom.players?.[currentUid];
    if (!mine) return; // watching a table we are not sitting at

    const keepSeat = activeRoom.status !== "waiting";
    const armed = `${roomId}:${keepSeat}`;
    if (armedRef.current !== armed) {
      armedRef.current = armed;
      armSeatDisconnect(roomId, currentUid, keepSeat).catch(() => {});
    }
    if (mine.connected !== true) {
      takeSeatBack(roomId, currentUid).catch(() => {});
    }
  }, [roomId, currentUid, activeRoom]);

  /* ── Finishing a turn ──────────────────────────────────────────────────────
     A pair is resolved by whoever holds the turn, off the room as it syncs —
     not off the click that completed it.

     It used to be a `setTimeout` inside the flip handler, which made that one
     tab the only thing in the world that knew the turn was unfinished. Reload
     it, or let a phone discard it in the background, and the pair stayed face
     up with the turn still assigned: every later tap hit the "two cards are
     already down" guard, and the table was dead until the 45s clock passed the
     turn. Reading the pending pair back off the room is what makes that
     recoverable — the same player's *next* tab picks the turn up and finishes
     it, because the pair was never anywhere but the database.

     The timer is held in a ref rather than returned as effect cleanup on
     purpose: this effect re-runs on every room update (a chat line will do it),
     and cleanup that cancelled the countdown on a run which then early-returns
     would leave nothing to finish the turn — the very bug being fixed. */
  const resolveKeyRef = useRef<string | null>(null);
  const resolveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clear = () => {
      if (resolveTimerRef.current !== null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };

    if (!roomId || !currentUid || !activeRoom) return;
    const gs = activeRoom.gameState;
    const flipped = gs?.flippedCards ?? [];
    const pending =
      activeRoom.status === "playing" &&
      Boolean(gs) &&
      gs!.currentTurn === currentUid &&
      flipped.length >= 2;

    if (!pending) {
      resolveKeyRef.current = null;
      clear();
      return;
    }

    // One countdown per pair. `turnStartedAt` is in the key so a pair that looks
    // identical on a later turn is still treated as new.
    const key = `${activeRoom.round}:${gs!.turnStartedAt}:${flipped.join("|")}`;
    if (resolveKeyRef.current === key) return;
    resolveKeyRef.current = key;
    clear();

    const attempt = (tries: number) => {
      resolveTimerRef.current = null;
      const outcome = resolvePairOutcome(roomRef.current, currentUid);
      if (!outcome) {
        // Someone else moved the turn on, or the pair is already gone.
        resolveKeyRef.current = null;
        return;
      }
      resolvePair(roomId, outcome)
        .then(() => {
          if (!outcome.isComplete) return;
          // Only once the round is *stored* as finished will the rules accept a
          // proposal for the next one, so this cannot ride along in the write
          // above. If it does not land, the effect below seeds it instead.
          return seedNextRoundProposal(
            roomId,
            activeRoom.gameType,
            activeRoom.difficulty,
            activeRoom.theme,
            activeOrder(roomRef.current?.players ?? {})
          ).catch(() => {});
        })
        .catch(() => {
          if (tries <= 1) {
            resolveKeyRef.current = null; // let the next snapshot try again
            return;
          }
          resolveTimerRef.current = window.setTimeout(
            () => attempt(tries - 1),
            RESOLVE_RETRY_MS
          );
        });
    };

    resolveTimerRef.current = window.setTimeout(
      () => attempt(RESOLVE_ATTEMPTS),
      REVEAL_MS
    );
  }, [roomId, currentUid, activeRoom]);

  // Nothing should be left counting down over a room we have left.
  useEffect(
    () => () => {
      if (resolveTimerRef.current !== null) window.clearTimeout(resolveTimerRef.current);
    },
    []
  );

  /* A round that ended with nothing to play next is a dead end: the rules refuse
     a bare readiness flag, so "Agree — deal me in" would have nothing to attach
     to. The seed normally rides just behind the resolve; if that tab went away
     in between, any seated player may put it back. */
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    if (activeRoom.status !== "round-finished") return;
    if (activeRoom.nextRound) return;

    seedNextRoundProposal(
      roomId,
      activeRoom.gameType,
      activeRoom.difficulty,
      activeRoom.theme,
      activeOrder(activeRoom.players ?? {})
    ).catch(() => {});
  }, [roomId, currentUid, activeRoom]);

  /* The round is over — whoever comes out ahead credits themselves the win.
     Every client computes the same ranking from the same synced scores, so
     only the one client sitting in first actually writes anything. */
  const creditedRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    if (activeRoom.status !== "round-finished") return;
    if (creditedRoundRef.current === activeRoom.round) return;

    const ranked = rankByScore(activeRoom.players);
    if (ranked[0]?.uid !== currentUid) return;

    creditedRoundRef.current = activeRoom.round;
    const mine = activeRoom.players[currentUid];
    creditRoundWin(roomId, currentUid, mine?.roundsWon ?? 0).catch(() => {
      creditedRoundRef.current = null; // let a retry happen on the next tick
    });
  }, [roomId, currentUid, activeRoom]);

  /* A fresh round starts everyone back at zero. The dealer can only ever zero
     their own seat (see startNextRound), so every other seat has to notice and
     clear itself.

     It used to notice by watching `round` change, which quietly meant "the
     first round number this hook ever saw is a new round" — true for a tab that
     was here when the round turned, wrong for one that has just started up.
     That cost nothing while a reload also cost you your seat; now that the seat
     survives, it would have zeroed your score every time you refreshed.

     So ask the board instead. Every matched card records who turned it, so the
     pairs standing to our name in the round *currently dealt* are a fact we can
     read rather than something to remember. Nothing of ours on the board means
     nothing of ours on the scoreboard — which is exactly a round we did not
     play. Mid-round, our pairs are still sitting there, and the score stands. */
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    if (activeRoom.status !== "playing") return;

    const mine = activeRoom.players?.[currentUid];
    if (!mine || mine.score === 0) return;
    if (claimedPairs(activeRoom.gameState, currentUid) > 0) return;

    resetOwnScoreForNewRound(roomId, currentUid).catch(() => {});
  }, [roomId, currentUid, activeRoom]);

  /* Once everyone seated has agreed to the same proposal, the seat that held
     the last turn deals it — the rules only trust that seat to open the next
     round, the same way only the host may deal the first one. */
  const dealtRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    if (activeRoom.status !== "round-finished") return;
    const proposal = activeRoom.nextRound;
    if (!proposal) return;
    if (activeRoom.gameState?.currentTurn !== currentUid) return;
    if (dealtRoundRef.current === activeRoom.round) return;

    // Only the players actually here have to agree — a seat whose player is
    // away is being kept for them, not waited on.
    const seated = activeOrder(activeRoom.players ?? {});
    const allReady = seated.length >= 2 && seated.every((uid) => proposal.readyPlayers?.[uid]);
    if (!allReady) return;

    dealtRoundRef.current = activeRoom.round;
    const cards = dealCards(proposal.gameType, proposal.difficulty, proposal.theme);
    const firstPlayer = nextPlayerUid(activeRoom.players, currentUid);
    startNextRound(roomId, currentUid, activeRoom.round, proposal, cards, firstPlayer).catch(() => {
      dealtRoundRef.current = null;
    });
  }, [roomId, currentUid, activeRoom]);

  /* Cards this tab has sent but not yet seen come back. The snapshot is what
     normally stops a card being tapped twice, and on a phone that round trip is
     long enough to get a second tap in — so hold them here too. `flipCard` is
     a compare-and-set and would refuse the duplicate anyway; this just saves
     the trip. */
  const inFlightRef = useRef<Set<string>>(new Set());

  /** Turn a card, and nothing else. What a completed pair *means* is the resolve
   *  effect's business — it has to be, or a turn only ends if the tab that
   *  started it is still around to end it. */
  const handleFlipCard = async (cardId: string) => {
    if (!roomId || !activeRoom || !currentUid) return;
    if (activeRoom.status !== "playing") return;
    if (inFlightRef.current.has(cardId)) return;
    if (!isFlipAllowed(activeRoom.gameState, currentUid, cardId).allowed) return;

    inFlightRef.current.add(cardId);
    try {
      await flipCard(roomId, cardId);
    } catch {
      /* refused, or the write never left — the card stays face down */
    } finally {
      inFlightRef.current.delete(cardId);
    }
  };

  const handleReady = async (isReady: boolean) => {
    if (!roomId || !currentUid) return;
    await setPlayerReady(roomId, currentUid, isReady);
  };

  /** Put up (or replace) a proposal for the next round. Proposing counts as
   *  agreeing to your own proposal; everyone else's agreement resets. */
  const handleProposeNextRound = async (
    gameType: GameType,
    difficulty: Difficulty,
    theme: CardTheme
  ) => {
    if (!roomId || !currentUid) return;
    await proposeNextRound(roomId, currentUid, gameType, difficulty, theme);
  };

  const handleNextRoundReady = async (ready: boolean) => {
    if (!roomId || !currentUid) return;
    await setNextRoundReady(roomId, currentUid, ready);
  };

  const handleLeave = async () => {
    if (!roomId || !currentUid) return;
    await leaveRoom(roomId, currentUid);
    if (unsubRef.current) unsubRef.current();
  };

  const myPlayer: RoomPlayer | null =
    activeRoom && currentUid ? activeRoom.players?.[currentUid] ?? null : null;

  const isMyTurn =
    activeRoom?.gameState?.currentTurn === currentUid;

  const players = activeRoom ? Object.values(activeRoom.players ?? {}) : [];

  return {
    room: activeRoom,
    loading,
    myPlayer,
    isMyTurn,
    players,
    secondsLeft,
    turnLimitSeconds: Math.round(TURN_LIMIT_MS / 1000),
    handleFlipCard,
    handleReady,
    handleLeave,
    handleProposeNextRound,
    handleNextRoundReady,
  };
};
