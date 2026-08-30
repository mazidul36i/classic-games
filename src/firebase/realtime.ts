import {
  ref,
  set,
  get,
  update,
  onValue,
  off,
  remove,
  query,
  limitToFirst,
  onDisconnect,
  runTransaction,
  serverTimestamp,
  type DatabaseReference,
  type DataSnapshot,
} from 'firebase/database';
import { rtdb } from './config';
import type { Room, RoomPlayer, MultiplayerGameState } from '../types/multiplayer.types';
import type { CardItem, GameType, Difficulty, CardTheme } from '../types/game.types';

// ─── House limits ─────────────────────────────────────────────────────────────
//
// Both numbers are mirrored in `database.rules.json`. Change them together, or
// the rules will refuse writes the client believes are legal.

/** How long a player may sit on a turn before anyone at the table may pass it. */
export const TURN_LIMIT_MS = 45_000;

/** Wait this much past the limit before passing, so a slow-but-legal resolve
 *  lands first and clients do not all race the same write. */
export const TURN_GRACE_MS = 2_000;

/** A waiting room older than this is abandoned; any signed-in client may sweep it. */
export const ROOM_STALE_MS = 6 * 60 * 60 * 1000;

/** How many open-room pointers a quick match will consider before opening its own. */
const QUICK_MATCH_CANDIDATES = 8;

// ─── Room Management ──────────────────────────────────────────────────────────

export const generateRoomCode = (): string => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/** The matchmaking index: open public rooms, bucketed by what they are playing.
 *  Quick match reads one bucket instead of the whole `rooms` tree. */
const bucketKey = (gameType: GameType, difficulty: Difficulty, theme: CardTheme) =>
  `${gameType}_${difficulty}_${theme}`;

const openRoomRef = (bucket: string, roomId: string) =>
  ref(rtdb, `openRooms/${bucket}/${roomId}`);

const roomBucket = (room: Pick<Room, 'gameType' | 'difficulty' | 'theme'>) =>
  bucketKey(room.gameType, room.difficulty, room.theme);

/** Take the player's seat down with them if their tab closes. */
const armPlayerDisconnect = (roomId: string, uid: string) =>
  onDisconnect(ref(rtdb, `rooms/${roomId}/players/${uid}`)).remove();

/** Turn order has to be identical on every client, and object key order is not
 *  a promise anyone made. Seat the table by when people sat down. */
export const seatedOrder = (players: Record<string, RoomPlayer>): string[] =>
  Object.values(players ?? {})
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.uid.localeCompare(b.uid))
    .map(p => p.uid);

/** The uid to the left of `currentUid`, skipping anyone who has left the table. */
export const nextPlayerUid = (
  players: Record<string, RoomPlayer>,
  currentUid: string
): string => {
  const order = seatedOrder(players);
  if (order.length === 0) return currentUid;
  const idx = order.indexOf(currentUid);
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
};

export const createRoom = async (
  hostPlayer: RoomPlayer,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme,
  options?: {
    isPrivate?: boolean;
    maxPlayers?: number;
  }
): Promise<string> => {
  const isPrivate = options?.isPrivate ?? true;
  const room = {
    hostId: hostPlayer.uid,
    isPrivate,
    maxPlayers: options?.maxPlayers ?? 4,
    status: 'waiting',
    gameType,
    difficulty,
    theme,
    players: {
      [hostPlayer.uid]: hostPlayer,
    },
    // The rules pin this to server time — the staleness sweep is only as
    // trustworthy as the clock that stamped it.
    createdAt: serverTimestamp(),
  };

  // Codes are six random characters, so collisions are rare but not impossible,
  // and the rules now refuse to overwrite a room that exists. Deal again.
  let roomId = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await get(ref(rtdb, `rooms/${roomId}`));
    if (!snap.exists()) break;
    roomId = generateRoomCode();
  }

  await set(ref(rtdb, `rooms/${roomId}`), room);
  await armPlayerDisconnect(roomId, hostPlayer.uid);
  if (!isPrivate) {
    await set(openRoomRef(bucketKey(gameType, difficulty, theme), roomId), true);
  }
  return roomId;
};

/** Why a join did or did not happen — quick match needs to tell "full" (try
 *  again later) apart from "gone" (retract the pointer). */
export type JoinResult = 'joined' | 'full' | 'in-play' | 'missing';

export const joinRoom = async (roomId: string, player: RoomPlayer): Promise<JoinResult> => {
  const roomRef = ref(rtdb, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) return 'missing';
  const room = snap.val() as Omit<Room, 'id'>;

  // Nobody came back to this one. Clearing it is free and keeps the tree small.
  if (room.status === 'waiting' && Date.now() - (room.createdAt ?? 0) > ROOM_STALE_MS) {
    await closeRoom(roomId, room);
    return 'missing';
  }

  if (room.players?.[player.uid]) {
    await armPlayerDisconnect(roomId, player.uid);
    return 'joined';
  }
  if (room.status !== 'waiting') return 'in-play';
  if (Object.keys(room.players || {}).length >= (room.maxPlayers ?? 4)) return 'full';

  await update(ref(rtdb, `rooms/${roomId}/players`), {
    [player.uid]: player,
  });
  await armPlayerDisconnect(roomId, player.uid);
  return 'joined';
};

export const quickMatch = async (
  player: RoomPlayer,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
): Promise<string> => {
  const bucket = bucketKey(gameType, difficulty, theme);
  const snap = await get(
    query(ref(rtdb, `openRooms/${bucket}`), limitToFirst(QUICK_MATCH_CANDIDATES))
  );

  if (snap.exists()) {
    for (const roomId of Object.keys(snap.val() as Record<string, boolean>)) {
      const result = await joinRoom(roomId, player);
      if (result === 'joined') return roomId;
      // The room is gone or already dealt — the pointer has outlived it.
      if (result === 'missing' || result === 'in-play') {
        await remove(openRoomRef(bucket, roomId));
      }
    }
  }

  return createRoom(player, gameType, difficulty, theme, {
    isPrivate: false,
    maxPlayers: 2,
  });
};

/**
 * Leave, without freezing the table behind you: hand on the turn if it was
 * yours, then take the room down if you were the last one at it.
 */
export const leaveRoom = async (roomId: string, uid: string) => {
  const roomSnap = await get(ref(rtdb, `rooms/${roomId}`));
  const room = roomSnap.exists() ? (roomSnap.val() as Omit<Room, 'id'>) : null;

  // Pass the turn while still seated — the rules only let the turn holder do it.
  if (room?.status === 'playing' && room.gameState?.currentTurn === uid) {
    const remaining = { ...(room.players ?? {}) };
    delete remaining[uid];
    if (Object.keys(remaining).length > 0) {
      await passTurn(roomId, nextPlayerUid(remaining, uid));
    }
  }

  const playerRef = ref(rtdb, `rooms/${roomId}/players/${uid}`);
  await onDisconnect(playerRef).cancel();
  await remove(playerRef);

  if (!room) return;
  const remainingCount = Object.keys(room.players ?? {}).filter(id => id !== uid).length;
  if (remainingCount === 0) {
    await closeRoom(roomId, room);
  }
};

/**
 * The last player in a *private* room takes it with them when their tab closes —
 * nothing indexes private rooms, so nobody else could ever find it to sweep it.
 * Public rooms are left standing: an empty open room is a fine room to join, and
 * the matchmaking index keeps it reachable until it goes stale.
 */
export const armLastSeatDisconnect = (roomId: string) =>
  onDisconnect(ref(rtdb, `rooms/${roomId}`)).remove();

export const disarmLastSeatDisconnect = (roomId: string) =>
  onDisconnect(ref(rtdb, `rooms/${roomId}`)).cancel();

export const setPlayerReady = async (roomId: string, uid: string, isReady: boolean) => {
  await update(ref(rtdb, `rooms/${roomId}/players/${uid}`), { isReady });
};

export const startGame = async (
  roomId: string,
  cards: CardItem[],
  firstPlayerUid: string,
  room?: Pick<Room, 'gameType' | 'difficulty' | 'theme' | 'isPrivate'> | null
) => {
  const gameState = {
    cards,
    currentTurn: firstPlayerUid,
    matchedPairs: 0,
    totalPairs: cards.length / 2,
    turnStartedAt: serverTimestamp(),
  };
  await update(ref(rtdb, `rooms/${roomId}`), {
    status: 'playing',
    startedAt: serverTimestamp(),
    gameState,
  });

  // Dealt — stop offering the seat to quick match.
  const meta =
    room ?? ((await get(ref(rtdb, `rooms/${roomId}`))).val() as Omit<Room, 'id'> | null);
  if (meta && !meta.isPrivate) {
    await remove(openRoomRef(roomBucket(meta), roomId));
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
    [`rooms/${roomId}/gameState/flippedCards`]: null,
    [`rooms/${roomId}/gameState/currentTurn`]: nextTurnUid,
    [`rooms/${roomId}/gameState/matchedPairs`]: newMatchedPairs,
    [`rooms/${roomId}/gameState/turnStartedAt`]: serverTimestamp(),
  };
  if (isComplete) {
    updates[`rooms/${roomId}/status`] = 'finished';
    updates[`rooms/${roomId}/finishedAt`] = serverTimestamp();
  }
  await update(ref(rtdb), updates);
};

/**
 * Move the turn on without resolving a flip. Used when the holder leaves, and
 * when their clock runs out — the rules allow anyone at the table to make this
 * write once `turnStartedAt` is older than the limit.
 */
export const passTurn = async (roomId: string, nextTurnUid: string) => {
  await update(ref(rtdb, `rooms/${roomId}/gameState`), {
    currentTurn: nextTurnUid,
    flippedCards: null,
    turnStartedAt: serverTimestamp(),
  });
};

/** A point, counted so that two flips landing together cannot lose one. */
export const incrementPlayerScore = async (roomId: string, uid: string) => {
  await runTransaction(
    ref(rtdb, `rooms/${roomId}/players/${uid}/score`),
    current => (current ?? 0) + 1
  );
};

export const closeRoom = async (
  roomId: string,
  room?: Pick<Room, 'gameType' | 'difficulty' | 'theme' | 'isPrivate'> | null
) => {
  const meta =
    room ?? ((await get(ref(rtdb, `rooms/${roomId}`))).val() as Omit<Room, 'id'> | null);
  if (meta && !meta.isPrivate) {
    await remove(openRoomRef(roomBucket(meta), roomId));
  }
  await remove(ref(rtdb, `rooms/${roomId}`));
};

/** Kept for the host's "close the room" control. */
export const cleanupRoom = (roomId: string) => closeRoom(roomId);

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

/**
 * Milliseconds to add to this device's clock to get the server's. Turn deadlines
 * are stamped by the server, so a countdown drawn against `Date.now()` alone is
 * wrong by however far the player's clock has drifted.
 */
export const subscribeToServerTimeOffset = (
  callback: (offsetMs: number) => void
): (() => void) => {
  const offsetRef = ref(rtdb, '.info/serverTimeOffset');
  const handler = (snap: DataSnapshot) => callback((snap.val() as number) ?? 0);
  onValue(offsetRef, handler);
  return () => off(offsetRef, 'value', handler);
};

export { type DatabaseReference };
