import {
  ref,
  set,
  get,
  update,
  onValue,
  off,
  remove,
  type DatabaseReference,
  type DataSnapshot,
} from 'firebase/database';
import { rtdb } from './config';
import type { Room, RoomPlayer, MultiplayerGameState } from '../types/multiplayer.types';
import type { CardItem, GameType, Difficulty, CardTheme } from '../types/game.types';

// ─── Room Management ──────────────────────────────────────────────────────────

export const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const createRoom = async (
  hostPlayer: RoomPlayer,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
): Promise<string> => {
  const roomId = generateRoomCode();
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const room: Omit<Room, 'id'> = {
    hostId: hostPlayer.uid,
    status: 'waiting',
    gameType,
    difficulty,
    theme,
    players: {
      [hostPlayer.uid]: hostPlayer,
    },
    createdAt: Date.now(),
  };
  await set(roomRef, room);
  return roomId;
};

export const joinRoom = async (roomId: string, player: RoomPlayer): Promise<boolean> => {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return false;
  const room = snap.val() as Room;
  if (room.status !== 'waiting') return false;
  if (Object.keys(room.players || {}).length >= 4) return false;
  await update(ref(rtdb, `rooms/${roomId}/players`), {
    [player.uid]: player,
  });
  return true;
};

export const leaveRoom = async (roomId: string, uid: string) => {
  await remove(ref(rtdb, `rooms/${roomId}/players/${uid}`));
};

export const setPlayerReady = async (roomId: string, uid: string, isReady: boolean) => {
  await update(ref(rtdb, `rooms/${roomId}/players/${uid}`), { isReady });
};

export const startGame = async (
  roomId: string,
  cards: CardItem[],
  firstPlayerUid: string
) => {
  const gameState: MultiplayerGameState = {
    cards,
    currentTurn: firstPlayerUid,
    flippedCards: [],
    matchedPairs: 0,
    totalPairs: cards.length / 2,
    turnStartedAt: Date.now(),
  };
  await update(ref(rtdb, `rooms/${roomId}`), {
    status: 'playing',
    startedAt: Date.now(),
    gameState,
  });
  // set all players' isCurrentTurn
  const playersSnap = await get(ref(rtdb, `rooms/${roomId}/players`));
  if (playersSnap.exists()) {
    const players = playersSnap.val() as Record<string, RoomPlayer>;
    const updates: Record<string, boolean> = {};
    Object.keys(players).forEach(uid => {
      updates[`rooms/${roomId}/players/${uid}/isCurrentTurn`] = uid === firstPlayerUid;
    });
    await update(ref(rtdb), updates);
  }
};

export const flipCard = async (roomId: string, cardId: string) => {
  const gsRef = ref(rtdb, `rooms/${roomId}/gameState`);
  const snap = await get(gsRef);
  if (!snap.exists()) return;
  const gs = snap.val() as MultiplayerGameState;
  const flipped = [...(gs.flippedCards || []), cardId];
  await update(gsRef, { flippedCards: flipped });
};

export const resolveFlip = async (
  roomId: string,
  cards: CardItem[],
  nextTurnUid: string,
  newMatchedPairs: number,
  isComplete: boolean
) => {
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/gameState/cards`]: cards,
    [`rooms/${roomId}/gameState/flippedCards`]: [],
    [`rooms/${roomId}/gameState/currentTurn`]: nextTurnUid,
    [`rooms/${roomId}/gameState/matchedPairs`]: newMatchedPairs,
    [`rooms/${roomId}/gameState/turnStartedAt`]: Date.now(),
  };
  if (isComplete) {
    updates[`rooms/${roomId}/status`] = 'finished';
    updates[`rooms/${roomId}/finishedAt`] = Date.now();
  }
  await update(ref(rtdb), updates);
};

export const incrementPlayerScore = async (roomId: string, uid: string) => {
  const scoreRef = ref(rtdb, `rooms/${roomId}/players/${uid}/score`);
  const snap = await get(scoreRef);
  const current = snap.exists() ? (snap.val() as number) : 0;
  await set(scoreRef, current + 1);
};

export const cleanupRoom = async (roomId: string) => {
  await remove(ref(rtdb, `rooms/${roomId}`));
};

// ─── Real-time Subscriptions ──────────────────────────────────────────────────

export const subscribeToRoom = (
  roomId: string,
  callback: (room: Room | null) => void
): (() => void) => {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const handler = (snap: DataSnapshot) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback({ id: roomId, ...snap.val() } as Room);
  };
  onValue(roomRef, handler);
  return () => off(roomRef, 'value', handler);
};

export { type DatabaseReference };
