import { useEffect, useRef, useState } from "react";
import {
  subscribeToRoom,
  subscribeToServerTimeOffset,
  flipCard,
  resolveFlip,
  passTurn,
  nextPlayerUid,
  incrementPlayerScore,
  setPlayerReady,
  leaveRoom,
  armLastSeatDisconnect,
  disarmLastSeatDisconnect,
  creditRoundWin,
  resetOwnScoreForNewRound,
  seedNextRoundProposal,
  proposeNextRound,
  setNextRoundReady,
  startNextRound,
  TURN_LIMIT_MS,
  TURN_GRACE_MS,
} from "../firebase/realtime";
import { generateCards } from "../utils/cardUtils";
import { generateWordCards } from "../utils/wordUtils";
import type { Room, RoomPlayer } from "../types/multiplayer.types";
import type { CardItem, CardTheme, Difficulty, GameType } from "../types/game.types";

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
      disarmLastSeatDisconnect(roomId, currentUid).catch(() => {});
    }
  }, [roomId, activeRoom, currentUid]);

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
     their own seat (see startNextRound), so every other seat notices `round`
     has moved on and clears its own score to match. */
  const lastSeenRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!roomId || !currentUid || !activeRoom) return;
    if (activeRoom.status !== "playing") return;
    if (lastSeenRoundRef.current === activeRoom.round) return;
    lastSeenRoundRef.current = activeRoom.round;

    const mine = activeRoom.players[currentUid];
    if (mine && mine.score !== 0) {
      resetOwnScoreForNewRound(roomId, currentUid).catch(() => {});
    }
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

    const seated = Object.keys(activeRoom.players ?? {});
    const allReady = seated.length >= 2 && seated.every((uid) => proposal.readyPlayers?.[uid]);
    if (!allReady) return;

    dealtRoundRef.current = activeRoom.round;
    const cards = dealCards(proposal.gameType, proposal.difficulty, proposal.theme);
    const firstPlayer = nextPlayerUid(activeRoom.players, currentUid);
    startNextRound(roomId, currentUid, activeRoom.round, proposal, cards, firstPlayer).catch(() => {
      dealtRoundRef.current = null;
    });
  }, [roomId, currentUid, activeRoom]);

  const handleFlipCard = async (cardId: string) => {
    if (!roomId || !activeRoom || !currentUid) return;
    const gs = activeRoom.gameState;
    if (!gs) return;
    if (gs.currentTurn !== currentUid) return;
    if (gs.flippedCards?.length >= 2) return;

    const card = gs.cards.find((c) => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched) return;

    await flipCard(roomId, cardId);

    // After flipping, check if 2 cards are now flipped
    const newFlipped = [...gs.flippedCards || [], cardId];
    if (newFlipped.length === 2) {
      const [firstId, secondId] = newFlipped;
      const first = gs.cards.find((c) => c.id === firstId)!;
      const second = gs.cards.find((c) => c.id === secondId) ?? card;

      setTimeout(async () => {
        const matched = first.pairId === second.pairId;
        const updatedCards: CardItem[] = gs.cards.map((c) => {
          if (c.id === firstId || c.id === secondId) {
            return matched
              ? { ...c, isFlipped: true, isMatched: true, flippedBy: currentUid }
              : { ...c, isFlipped: false };
          }
          return c;
        });

        const nextUid = nextPlayerUid(activeRoom.players, currentUid);
        const newMatchedPairs = gs.matchedPairs + (matched ? 1 : 0);
        const isComplete = newMatchedPairs >= gs.totalPairs;

        if (matched) {
          await incrementPlayerScore(roomId, currentUid);
        }

        await resolveFlip(
          roomId,
          updatedCards,
          matched ? currentUid : nextUid, // on match, the same player gets another turn
          newMatchedPairs,
          isComplete
        );

        if (isComplete) {
          // Put the current settings on the table so there's something to
          // agree to (or change) right away — nobody is agreed yet.
          await seedNextRoundProposal(
            roomId,
            activeRoom.gameType,
            activeRoom.difficulty,
            activeRoom.theme,
            Object.keys(activeRoom.players ?? {})
          );
        }
      }, 900);
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
