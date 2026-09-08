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
  push,
  runTransaction,
  serverTimestamp,
  type DatabaseReference,
  type DataSnapshot,
} from 'firebase/database';
import { rtdb } from './config';
import type {
  Room,
  RoomPlayer,
  NextRoundProposal,
  ChatMessage,
} from '../types/multiplayer.types';
import type { CardItem, GameType, Difficulty, CardTheme } from '../types/game.types';
import { pickOpponentRooms } from '../utils/matchUtils';
import { nextPlayerUid, seatedOrder, type PairOutcome } from '../utils/flipUtils';

// Seating and turn order are decided without touching the database, so they live
// with the rest of the turn logic in `utils/flipUtils`. Re-exported here because
// this is where callers have always reached for them.
export { nextPlayerUid, seatedOrder };

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

/** The most a single line of table talk may hold. Mirrored in the rules'
 *  `chat` clause — change them together. */
export const CHAT_MAX_LENGTH = 200;

/** How long the composer waits between sends. The rules cannot enforce this
 *  (see the `chat` clause in database.rules.json), so it is only manners. */
export const CHAT_COOLDOWN_MS = 1_000;

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

/**
 * Standing instructions for a seat whose tab goes away.
 *
 * Before the hand is dealt the seat is given up: someone who opens a waiting
 * room and closes it again should not hold a place the table cannot start
 * without. Once cards are down the seat is *kept* and only marked away.
 *
 * That distinction is the whole reason this function takes a flag. A refresh is
 * a two-second gap in a websocket, and it used to be indistinguishable from
 * leaving for good: the seat was deleted, and there was no way back — a room in
 * play refuses new seats (`joinRoom` answers 'in-play') and the rules refuse to
 * re-create one. The player came back to their own table as a spectator, with
 * every tap dead. Keeping the seat and marking it away costs the table nothing,
 * because `activeOrder` moves the turn straight past it.
 */
export const armSeatDisconnect = async (roomId: string, uid: string, keepSeat: boolean) => {
  const seat = onDisconnect(ref(rtdb, `rooms/${roomId}/players/${uid}`));
  // Clear whatever was armed before: the room changes phase under a seat that
  // was armed for the phase before it.
  await seat.cancel();
  await (keepSeat ? seat.update({ connected: false }) : seat.remove());
};

/** Say we are back. Only ever written for a seat that still exists, which after
 *  the change above is what a reload finds waiting for it. */
export const takeSeatBack = (roomId: string, uid: string) =>
  update(ref(rtdb, `rooms/${roomId}/players/${uid}`), { connected: true });

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
  await armSeatDisconnect(roomId, hostPlayer.uid, false); // still waiting
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

  // Already seated here — coming back to a seat the table kept. That is now the
  // ordinary case after a reload, and it is the one branch that may return to a
  // room already in play.
  if (room.players?.[player.uid]) {
    await armSeatDisconnect(roomId, player.uid, room.status !== 'waiting');
    await takeSeatBack(roomId, player.uid);
    return 'joined';
  }
  if (room.status !== 'waiting') return 'in-play';

  const maxPlayers = room.maxPlayers ?? 4;
  if (Object.keys(room.players || {}).length >= maxPlayers) return 'full';

  await update(ref(rtdb, `rooms/${roomId}/players`), {
    [player.uid]: player,
  });
  await armSeatDisconnect(roomId, player.uid, false); // room is 'waiting' here

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
  // A search only ever holds a room that is still waiting.
  await armSeatDisconnect(roomId, uid, false);
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
export const disarmLastSeatDisconnect = async (
  roomId: string,
  uid: string,
  keepSeat: boolean
) => {
  await onDisconnect(ref(rtdb, `rooms/${roomId}`)).cancel();
  await armSeatDisconnect(roomId, uid, keepSeat);
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

/** What became of a tap. Anything but 'flipped' means nothing was written. */
export type FlipResult = 'flipped' | 'duplicate' | 'pair-full' | 'refused';

/**
 * Turn a card, as a compare-and-set on `flippedCards` rather than a read
 * followed by a write.
 *
 * The read-then-write version could not see a tap that was already in flight,
 * and the rules cannot help — they can count the array to two but not tell one
 * card from the same card twice. Two taps of one card inside a single round trip
 * (which on a phone is most double taps) therefore wrote `[c0, c0]`: a pair that
 * matches itself, and one that neither tap believed it had completed, so nothing
 * ever resolved it. A transaction sees the array as it actually stands each time
 * it runs, so the second tap has something to refuse.
 */
export const flipCard = async (roomId: string, cardId: string): Promise<FlipResult> => {
  let verdict: FlipResult = 'flipped';
  const res = await runTransaction(
    ref(rtdb, `rooms/${roomId}/gameState/flippedCards`),
    (current: string[] | null) => {
      const flipped = Array.isArray(current) ? current : [];
      if (flipped.includes(cardId)) {
        verdict = 'duplicate';
        return; // abort — leave the array alone
      }
      if (flipped.length >= 2) {
        verdict = 'pair-full';
        return;
      }
      verdict = 'flipped';
      return [...flipped, cardId];
    }
  );
  if (!res.committed && verdict === 'flipped') return 'refused';
  return verdict;
};

/**
 * Finish the turn: the board, the count, the turn and the point, in one write.
 *
 * One write rather than two because the point and the board that earned it must
 * not be able to arrive separately — the score rule reads `status` and
 * `currentTurn` off the *stored* room, so both are still what they were when the
 * pair was completed, and the whole update is refused together or lands
 * together. `outcome` comes from `resolvePairOutcome`, which reads the room at
 * the moment of the write; see `utils/flipUtils` for why that matters.
 */
export const resolvePair = async (roomId: string, outcome: PairOutcome) => {
  const updates: Record<string, unknown> = {
    [`rooms/${roomId}/gameState/cards`]: outcome.cards,
    [`rooms/${roomId}/gameState/flippedCards`]: null,
    [`rooms/${roomId}/gameState/currentTurn`]: outcome.nextTurnUid,
    [`rooms/${roomId}/gameState/matchedPairs`]: outcome.matchedPairs,
    [`rooms/${roomId}/gameState/turnStartedAt`]: serverTimestamp(),
  };
  if (outcome.scoringUid) {
    updates[`rooms/${roomId}/players/${outcome.scoringUid}/score`] = outcome.newScore;
  }
  if (outcome.isComplete) {
    // The board is clear, but the table stays seated — see startNextRound.
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

// The point used to be its own transaction here, landing just before the board
// that earned it. It rides inside `resolvePair`'s single update now — a score
// that cannot arrive without its board is worth more than one that cannot be
// lost to an interleave, and the update is atomic either way.

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

// ─── Table talk ───────────────────────────────────────────────────────────────

/**
 * Say something at the table. The rules insist the message is written by a
 * seated player, as themselves, under the name on their seat, with the server's
 * clock — so `displayName` has to be what is on the seat, not what the auth
 * profile says today. Messages live under the room and leave with it.
 */
export const sendChatMessage = async (
  roomId: string,
  uid: string,
  displayName: string,
  text: string
) => {
  const message: Omit<ChatMessage, 'sentAt'> & { sentAt: object } = {
    uid,
    displayName,
    text,
    sentAt: serverTimestamp(),
  };
  await set(push(ref(rtdb, `rooms/${roomId}/chat`)), message);
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
