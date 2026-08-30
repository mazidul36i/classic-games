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
import type { Room, RoomPlayer, MultiplayerGameState, NextRoundProposal } from '../types/multiplayer.types';
import type { CardItem, GameType, Difficulty, CardTheme } from '../types/game.types';
import { pickOpponentRooms } from '../utils/matchUtils';

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

/** How many open-room pointers a quick match will consider in one sweep. */
const QUICK_MATCH_CANDIDATES = 8;

/** How long "find an opponent" keeps looking before it gives up and clears the
 *  table it was holding. */
export const MATCH_TIMEOUT_MS = 120_000;

/** How often the search re-reads the index while it waits. Two players who
 *  press the button in the same second cannot see each other's table yet — this
 *  is how long until they can. */
export const MATCH_POLL_MS = 2_500;

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
    round: 1,
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

  const maxPlayers = room.maxPlayers ?? 4;
  if (Object.keys(room.players || {}).length >= maxPlayers) return 'full';

  await update(ref(rtdb, `rooms/${roomId}/players`), {
    [player.uid]: player,
  });
  await armPlayerDisconnect(roomId, player.uid);

  // Two players can clear the capacity check above in the same instant: the
  // rules cap nothing (they can only see one seat at a time), and a transaction
  // cannot span seats without giving every player write access to the whole
  // `players` node. So take the seat first and check afterwards whether it was
  // ours to take — `seatedOrder` ranks the table identically on every client,
  // so the one who arrived last is the one who stands back up.
  const seated = (await get(ref(rtdb, `rooms/${roomId}/players`))).val() as
    | Record<string, RoomPlayer>
    | null;
  if (seatedOrder(seated ?? {}).indexOf(player.uid) >= maxPlayers) {
    const seatRef = ref(rtdb, `rooms/${roomId}/players/${player.uid}`);
    await onDisconnect(seatRef).cancel();
    await remove(seatRef);
    return 'full';
  }

  return 'joined';
};

/** Open a table nobody has to know a code to find. */
export const openQuickMatchRoom = (
  player: RoomPlayer,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
): Promise<string> =>
  createRoom(player, gameType, difficulty, theme, { isPrivate: false, maxPlayers: 2 });

/** Put our table back in the index. A sweep retracts any pointer it could not
 *  sit down at, and it can be wrong about that (a room it read as full may have
 *  emptied a moment later), so a table still waiting re-asserts its own. */
export const publishOpenRoom = (
  roomId: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
) => set(openRoomRef(bucketKey(gameType, difficulty, theme), roomId), true);

/**
 * One pass over the matchmaking index: sit down at the first open table we can,
 * clearing the pointers of any we cannot. Returns the room we joined, or null.
 *
 * `ownRoomId` is the table we are already holding open, if any; which of two
 * tables that opened at the same moment gets abandoned is decided by
 * `pickOpponentRooms`, which is where that reasoning lives.
 */
export const sweepForOpponent = async (
  player: RoomPlayer,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme,
  ownRoomId: string | null
): Promise<string | null> => {
  const bucket = bucketKey(gameType, difficulty, theme);
  const snap = await get(
    query(ref(rtdb, `openRooms/${bucket}`), limitToFirst(QUICK_MATCH_CANDIDATES))
  );
  if (!snap.exists()) return null;

  const candidates = pickOpponentRooms(
    Object.keys(snap.val() as Record<string, boolean>),
    ownRoomId
  );

  for (const roomId of candidates) {
    const result = await joinRoom(roomId, player);
    if (result === 'joined') return roomId;
    // Dealt, gone, or full — whatever it is, it is not an open seat, and the
    // pointer saying otherwise is only litter.
    await remove(openRoomRef(bucket, roomId)).catch(() => {});
  }

  return null;
};

/**
 * A quick match holding a table on its own should take the whole thing with it
 * if the tab closes — room and index pointer both. Otherwise the next searcher
 * finds a pointer to a table nobody is sitting at and waits out its two minutes
 * for a player who left.
 */
export const armSearchDisconnect = async (
  roomId: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
) => {
  await onDisconnect(ref(rtdb, `rooms/${roomId}`)).remove();
  await onDisconnect(openRoomRef(bucketKey(gameType, difficulty, theme), roomId)).remove();
};

/** Drop the standing instructions armed above. Used on the way to taking the
 *  room down by hand, where re-arming the host's seat would be pointless. */
export const cancelSearchDisconnect = async (
  roomId: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
) => {
  await onDisconnect(ref(rtdb, `rooms/${roomId}`)).cancel();
  await onDisconnect(openRoomRef(bucketKey(gameType, difficulty, theme), roomId)).cancel();
};

/** Stand the room back up once someone has joined it — it is a real table now.
 *  `cancel()` reaches every onDisconnect at or below the path it is called on,
 *  which includes the host's own seat, so that one has to be re-armed after. */
export const disarmSearchDisconnect = async (
  roomId: string,
  uid: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
) => {
  await cancelSearchDisconnect(roomId, gameType, difficulty, theme);
  await armPlayerDisconnect(roomId, uid);
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

/** `cancel()` clears every onDisconnect at or below the path it is given, and
 *  the player's own seat sits below the room — so put that one back. */
export const disarmLastSeatDisconnect = async (roomId: string, uid: string) => {
  await onDisconnect(ref(rtdb, `rooms/${roomId}`)).cancel();
  await armPlayerDisconnect(roomId, uid);
};

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
    // The board is clear, but the table stays seated — see endRound below.
    updates[`rooms/${roomId}/status`] = 'round-finished';
    updates[`rooms/${roomId}/finishedAt`] = serverTimestamp();
  }
  await update(ref(rtdb), updates);
};

/**
 * Credit a round to whoever came out ahead. The rules can only confirm this is
 * a player crediting *themselves*, once, while the room is between rounds —
 * working out who actually won is left to the caller (every client computes
 * the same ranking from the same synced scores, so this is only ever called
 * by the one client whose own uid is in front).
 */
export const creditRoundWin = async (roomId: string, uid: string, currentRoundsWon: number) => {
  await update(ref(rtdb, `rooms/${roomId}/players/${uid}`), {
    roundsWon: currentRoundsWon + 1,
  });
};

/** Each player zeroes their own card only — the rules won't let you touch a
 *  seatmate's. Called once per player whenever a fresh round starts under them. */
export const resetOwnScoreForNewRound = async (roomId: string, uid: string) => {
  await update(ref(rtdb, `rooms/${roomId}/players/${uid}`), { score: 0 });
};

/**
 * Called once, by whoever's move just ended the round, so there is something
 * on the table to look at right away: the room's current settings, with
 * nobody yet agreed to them (including the player who just dealt this in —
 * proposing isn't the same as agreeing, so this doesn't call proposeNextRound).
 */
export const seedNextRoundProposal = async (
  roomId: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme,
  seatedUids: string[]
) => {
  const proposal: NextRoundProposal = {
    gameType,
    difficulty,
    theme,
    readyPlayers: Object.fromEntries(seatedUids.map((uid) => [uid, false])),
  };
  await set(ref(rtdb, `rooms/${roomId}/nextRound`), proposal);
};

/**
 * Put a proposal on the table for what to play next: any seated player may
 * call this while the room sits at 'round-finished'. It replaces whatever was
 * proposed before and starts the agreement over — you can only vouch for
 * yourself, so proposing counts as agreeing to your own proposal.
 */
export const proposeNextRound = async (
  roomId: string,
  uid: string,
  gameType: GameType,
  difficulty: Difficulty,
  theme: CardTheme
) => {
  const proposal: NextRoundProposal = {
    gameType,
    difficulty,
    theme,
    readyPlayers: { [uid]: true },
  };
  await set(ref(rtdb, `rooms/${roomId}/nextRound`), proposal);
};

/** Agree (or withdraw agreement) to whatever is currently proposed. */
export const setNextRoundReady = async (roomId: string, uid: string, ready: boolean) => {
  await update(ref(rtdb, `rooms/${roomId}/nextRound/readyPlayers`), { [uid]: ready });
};

/**
 * Deal the agreed-on next round. The rules only let the player who held the
 * last turn make this write — same seat that closed out the round before it —
 * so only that one client should ever call this, once every seated player's
 * flag under `nextRound` is true.
 */
export const startNextRound = async (
  roomId: string,
  dealerUid: string,
  currentRound: number,
  proposal: Pick<NextRoundProposal, 'gameType' | 'difficulty' | 'theme'>,
  cards: CardItem[],
  firstPlayerUid: string
) => {
  const gameState = {
    cards,
    currentTurn: firstPlayerUid,
    matchedPairs: 0,
    totalPairs: cards.length / 2,
    turnStartedAt: serverTimestamp(),
  };
  // Two writes, not one: gameType/difficulty/theme/round only get to move once
  // status has *already* landed on 'playing' — the rules read that off the
  // stored room, and a value this same write is also busy changing doesn't
  // reliably show up yet to a sibling field's own check. Flip status first,
  // then lay everything else on top of the now-settled 'playing' room.
  await update(ref(rtdb, `rooms/${roomId}`), {
    status: 'playing',
    startedAt: serverTimestamp(),
  });
  await update(ref(rtdb), {
    [`rooms/${roomId}/round`]: currentRound + 1,
    [`rooms/${roomId}/gameType`]: proposal.gameType,
    [`rooms/${roomId}/difficulty`]: proposal.difficulty,
    [`rooms/${roomId}/theme`]: proposal.theme,
    [`rooms/${roomId}/gameState`]: gameState,
    [`rooms/${roomId}/nextRound`]: null,
    // Only the dealer's own score is ours to zero here — the other seat zeroes
    // itself the moment its client notices `round` has moved on.
    [`rooms/${roomId}/players/${dealerUid}/score`]: 0,
  });
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
