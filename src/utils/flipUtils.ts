import type { CardItem } from '../types/game.types';
import type { Room, MultiplayerGameState, RoomPlayer } from '../types/multiplayer.types';

/**
 * The rules of a multiplayer turn, with no Firebase in them.
 *
 * A turn is three steps — flip, flip, resolve — and the middle of it is a pause
 * long enough to read the cards. That pause used to be a `setTimeout` living in
 * the tab that made the second flip, which meant the tab was the only thing in
 * the system that knew the turn was unfinished. Reload it, background it on a
 * phone, lose the network for a moment, and the turn never ended: two cards face
 * up, the turn still yours, and every later tap refused by the "two cards are
 * already down" guard.
 *
 * So the decisions live here instead, as functions of the room as it currently
 * stands. Anyone holding the turn can work out what a pending pair means and
 * finish it — including the same player a second later in a completely new tab.
 * `useMultiplayer` drives them off the room subscription rather than off a click.
 */

/** How long a completed pair is held face up before it resolves. Long enough to
 *  read across the table, short enough not to feel like a hang. */
export const REVEAL_MS = 900;

/** Whether the tab holding a seat is here. A seat written before presence
 *  existed carries no flag, and is read as present — an old room should not
 *  empty itself the moment this ships. */
export const isPresent = (player: RoomPlayer | null | undefined): boolean =>
  Boolean(player) && player!.connected !== false;

/** Every seat the table is holding, in the order people sat down — including
 *  seats whose player has stepped away. Turn order has to be identical on every
 *  client, and object key order is not a promise anyone made. */
export const seatedOrder = (players: Record<string, RoomPlayer>): string[] =>
  Object.values(players ?? {})
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.uid.localeCompare(b.uid))
    .map(p => p.uid);

/** The seats actually being played, which is who the turn moves between. A seat
 *  that is away keeps its place at the table and its score, but costs the rest
 *  of the table nothing — the turn goes straight past it.
 *
 *  Falls back to every seat when nothing reads as present, so this can never
 *  hand back an empty order and leave the turn pointing at nobody. */
export const activeOrder = (players: Record<string, RoomPlayer>): string[] => {
  const here = Object.values(players ?? {})
    .filter(isPresent)
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0) || a.uid.localeCompare(b.uid))
    .map(p => p.uid);
  return here.length > 0 ? here : seatedOrder(players);
};

/** The uid to the left of `currentUid`, skipping anyone away or gone. */
export const nextPlayerUid = (
  players: Record<string, RoomPlayer>,
  currentUid: string
): string => {
  const order = activeOrder(players);
  if (order.length === 0) return currentUid;
  const idx = order.indexOf(currentUid);
  // Not in the order at all means we are the one who stepped away; the turn
  // belongs to whoever is actually sitting there.
  if (idx === -1) return order[0];
  return order[(idx + 1) % order.length];
};

/** Why a tap did not turn a card. Only 'flipped' reaches the database. */
export type FlipRefusal =
  | 'no-board'
  | 'not-your-turn'
  | 'pair-full'
  | 'duplicate'
  | 'unknown-card';

export type FlipVerdict = { allowed: true } | { allowed: false; reason: FlipRefusal };

/**
 * Whether this tap is worth sending at all.
 *
 * The `duplicate` case is the one that matters and the one the old client had no
 * answer for: a card in `flippedCards` is only drawn face up — the stored card
 * still reads `isFlipped: false` — so nothing stopped the same card being sent
 * twice. Two taps inside one round trip put it in the pair twice, and a card
 * always matches itself: a free point, a partner orphaned for the rest of the
 * round, and a turn neither tap believed it had completed.
 *
 * This is the cheap local half. The write itself is a compare-and-set against
 * the stored array (see `flipCard`), which is what actually holds when two taps
 * are in flight at once.
 */
export const isFlipAllowed = (
  gs: MultiplayerGameState | null | undefined,
  uid: string,
  cardId: string
): FlipVerdict => {
  if (!gs) return { allowed: false, reason: 'no-board' };
  if (gs.currentTurn !== uid) return { allowed: false, reason: 'not-your-turn' };

  const flipped = gs.flippedCards ?? [];
  if (flipped.includes(cardId)) return { allowed: false, reason: 'duplicate' };
  if (flipped.length >= 2) return { allowed: false, reason: 'pair-full' };

  const card = (gs.cards ?? []).find(c => c.id === cardId);
  if (!card) return { allowed: false, reason: 'unknown-card' };
  if (card.isMatched) return { allowed: false, reason: 'duplicate' };

  return { allowed: true };
};

/**
 * How many pairs this player has taken off the board *in the round currently
 * dealt*. Every matched card records who turned it, so a seat's score for the
 * round in play is a fact about the board rather than something a client has to
 * remember across a reload.
 */
export const claimedPairs = (
  gs: MultiplayerGameState | null | undefined,
  uid: string
): number => (gs?.cards ?? []).filter(c => c.isMatched && c.flippedBy === uid).length / 2;

/** Everything the resolving write needs, worked out from the room it read. */
export interface PairOutcome {
  matched: boolean;
  /** The whole board as it should be stored: the pair claimed, or turned back. */
  cards: CardItem[];
  matchedPairs: number;
  isComplete: boolean;
  nextTurnUid: string;
  /** Whose score moves, and to what. Null on a miss — the write then carries no
   *  score at all rather than a value that happens to be unchanged. */
  scoringUid: string | null;
  newScore: number;
}

/**
 * What the pair currently on the table comes to, or null if there is nothing to
 * resolve — no board, not our turn, fewer than two cards down.
 *
 * Read from the room every time it is called, so it is safe to call late: a
 * player who reloads mid-reveal, or whose write was refused and is trying again,
 * resolves against the table as it is now rather than as it was when the card
 * was tapped. That also covers the seatmate who stood up during the reveal —
 * the turn passes to whoever is actually still sitting there.
 */
export const resolvePairOutcome = (
  room: Room | null | undefined,
  uid: string
): PairOutcome | null => {
  const gs = room?.gameState;
  if (!room || !gs) return null;
  if (room.status !== 'playing') return null;
  if (gs.currentTurn !== uid) return null;

  const flipped = gs.flippedCards ?? [];
  if (flipped.length < 2) return null;

  const [firstId, secondId] = flipped;
  const cards = gs.cards ?? [];
  const first = cards.find(c => c.id === firstId);
  const second = cards.find(c => c.id === secondId);

  /* A card is never its own pair. The old client had no such check and a board
     spoiled by it can still be sitting in a live room, so treat the duplicate as
     an ordinary miss: the cards go back down, nobody is paid, and the table is
     playable again. */
  const matched = Boolean(
    first &&
      second &&
      firstId !== secondId &&
      !first.isMatched &&
      !second.isMatched &&
      first.pairId === second.pairId
  );

  const inPair = (id: string) => id === firstId || id === secondId;
  const updated: CardItem[] = cards.map(c =>
    inPair(c.id)
      ? matched
        ? { ...c, isFlipped: true, isMatched: true, flippedBy: uid }
        : { ...c, isFlipped: false }
      : c
  );

  const matchedPairs = (gs.matchedPairs ?? 0) + (matched ? 1 : 0);

  // A match buys another go; a miss hands the turn on. If we are the last one
  // left at the table, `nextPlayerUid` gives us back our own seat, which is the
  // only uid the rules will accept anyway.
  const players = room.players ?? {};
  const candidate = matched ? uid : nextPlayerUid(players, uid);
  const nextTurnUid = players[candidate] ? candidate : uid;

  return {
    matched,
    cards: updated,
    matchedPairs,
    isComplete: matchedPairs >= gs.totalPairs,
    nextTurnUid,
    scoringUid: matched ? uid : null,
    newScore: (players[uid]?.score ?? 0) + 1,
  };
};
