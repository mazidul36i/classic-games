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
  TURN_LIMIT_MS,
  TURN_GRACE_MS,
} from "../firebase/realtime";
import type { Room, RoomPlayer } from "../types/multiplayer.types";
import type { CardItem } from "../types/game.types";

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
      disarmLastSeatDisconnect(roomId).catch(() => {});
    }
  }, [roomId, activeRoom, currentUid]);

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
      }, 900);
    }
  };

  const handleReady = async (isReady: boolean) => {
    if (!roomId || !currentUid) return;
    await setPlayerReady(roomId, currentUid, isReady);
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
  };
};
