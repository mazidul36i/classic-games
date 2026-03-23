import { useEffect, useRef, useState } from "react";
import {
  subscribeToRoom,
  flipCard,
  resolveFlip,
  incrementPlayerScore,
  setPlayerReady,
  leaveRoom
} from "../firebase/realtime";
import type { Room, RoomPlayer } from "../types/multiplayer.types";
import type { CardItem } from "../types/game.types";

export const useMultiplayer = (roomId: string | null, currentUid: string | null) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [loadedRoomId, setLoadedRoomId] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

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

  const loading = Boolean(roomId) && loadedRoomId !== roomId;
  const activeRoom = loadedRoomId === roomId ? room : null;

  const handleFlipCard = async (cardId: string) => {
    if (!roomId || !activeRoom || !currentUid) return;
    const gs = activeRoom.gameState;
    console.log("game state", gs);
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

        // Determine next turn
        const playerUids = Object.keys(activeRoom.players);
        const currentIdx = playerUids.indexOf(currentUid);
        const nextUid = playerUids[(currentIdx + 1) % playerUids.length];

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
    handleFlipCard,
    handleReady,
    handleLeave,
  };
};
