import { useEffect, useRef, useState } from 'react';
import { subscribeToRoom, flipCard, resolveFlip, incrementPlayerScore, setPlayerReady, leaveRoom } from '../firebase/realtime';
import type { Room, RoomPlayer } from '../types/multiplayer.types';
import type { CardItem } from '../types/game.types';

export const useMultiplayer = (roomId: string | null, currentUid: string | null) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToRoom(roomId, (r) => {
      setRoom(r);
      setLoading(false);
    });
    unsubRef.current = unsub;
    return () => {
      unsub();
    };
  }, [roomId]);

  const handleFlipCard = async (cardId: string) => {
    if (!roomId || !room || !currentUid) return;
    const gs = room.gameState;
    if (!gs) return;
    if (gs.currentTurn !== currentUid) return;
    if (gs.flippedCards.length >= 2) return;

    const card = gs.cards.find((c) => c.id === cardId);
    if (!card || card.isFlipped || card.isMatched) return;

    await flipCard(roomId, cardId);

    // After flipping, check if 2 cards are now flipped
    const newFlipped = [...gs.flippedCards, cardId];
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
        const playerUids = Object.keys(room.players);
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
          matched ? currentUid : nextUid, // on match, same player gets another turn
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
    room && currentUid ? room.players?.[currentUid] ?? null : null;

  const isMyTurn =
    room?.gameState?.currentTurn === currentUid;

  const players = room ? Object.values(room.players ?? {}) : [];

  return {
    room,
    loading,
    myPlayer,
    isMyTurn,
    players,
    handleFlipCard,
    handleReady,
    handleLeave,
  };
};
