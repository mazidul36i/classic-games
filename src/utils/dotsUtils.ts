import type { Difficulty } from '../types/game.types';
import type { DotsGameState, Room, RoomGameState, RoomPlayer } from '../types/multiplayer.types';
// Extension included so the rule tests can import this straight into Node,
// which resolves nothing for itself. `allowImportingTsExtensions` is on.
import { nextPlayerUid } from './flipUtils.ts';

/**
 * The rules of Dots and Boxes, with no Firebase in them.
 *
 * Same discipline as `flipUtils`: every decision is a function of the room as it
 * currently stands, so any tab can work out what a move comes to. This game gets
 * that for free where the card game had to fight for it — a move here has no
 * pause in the middle. Drawing a line, closing whatever boxes that line closed,
 * and handing the turn on are all decided at once and written at once, so there
 * is no half-finished turn for a tab to abandon.
 *
 * Coordinates: `gridSize` is boxes per side, so a 4×4 board is 5×5 dots.
 *   h_r_c  the horizontal line below dot-row r, spanning column c
 *          (r: 0…gridSize, c: 0…gridSize-1)
 *   v_r_c  the vertical line right of dot-column c, spanning row r
 *          (r: 0…gridSize-1, c: 0…gridSize)
 *   b_r_c  the box at row r, column c, closed by h_r_c, h_(r+1)_c, v_r_c, v_r_(c+1)
 */

/** Boxes per side. The lobby's "length of hand" is the board size here — the
 *  same three settings the card games use, so the room, the matchmaking bucket
 *  and the next-round proposal all carry it without a field of their own. */
export const gridSizeFor = (difficulty: Difficulty): number =>
  difficulty === '4x4' ? 4 : difficulty === '6x6' ? 6 : 8;

/**
 * A seat's mark, by the order people sat down.
 *
 * Four at a table means initials collide — two players called Alice and Anna
 * would both write "A" and the board would only be readable by colour. A suit
 * cannot collide, and the house already deals in them. The seat plate prints
 * the same mark beside the name, so the board says who without saying it twice.
 *
 * The reds go to the two warm inks and the blacks to the two cool ones, which
 * is as close to a deck as four inks legible on green baize will get.
 */
export const SEAT_SUITS = ['♥', '♦', '♠', '♣'] as const;

export const seatSuitAt = (index: number): string =>
  SEAT_SUITS[((index % SEAT_SUITS.length) + SEAT_SUITS.length) % SEAT_SUITS.length];

/** The ink that goes with that seat. Paired with the suit above, and mirrored
 *  in the `.p-ink-*` classes in `index.css`. */
export const seatInkAt = (index: number): string =>
  `p-ink-${(((index % SEAT_SUITS.length) + SEAT_SUITS.length) % SEAT_SUITS.length) + 1}`;

/** Where a player sits, for the two above. A uid the table does not know sits
 *  at the head of it rather than nowhere — the board still has to draw. */
export const seatIndexOf = (seatedUids: string[], uid: string): number => {
  const index = seatedUids.indexOf(uid);
  return index === -1 ? 0 : index;
};

export const isDotsBoard = (
  gs: RoomGameState | null | undefined
): gs is DotsGameState => Boolean(gs && 'gridSize' in gs);

export const horizontalEdgeId = (row: number, col: number) => `h_${row}_${col}`;
export const verticalEdgeId = (row: number, col: number) => `v_${row}_${col}`;
export const boxId = (row: number, col: number) => `b_${row}_${col}`;

/** The four lines that close the box at (row, col). */
export const boxEdges = (row: number, col: number): string[] => [
  horizontalEdgeId(row, col),
  horizontalEdgeId(row + 1, col),
  verticalEdgeId(row, col),
  verticalEdgeId(row, col + 1),
];

const boxCoords = (id: string): [number, number] => {
  const [, row, col] = id.split('_');
  return [Number(row), Number(col)];
};

const isKnownEdge = (edgeId: string, gridSize: number): boolean => {
  const [axis, rawRow, rawCol] = edgeId.split('_');
  const row = Number(rawRow);
  const col = Number(rawCol);
  if (!Number.isInteger(row) || !Number.isInteger(col)) return false;
  if (axis === 'h') return row >= 0 && row <= gridSize && col >= 0 && col < gridSize;
  if (axis === 'v') return row >= 0 && row < gridSize && col >= 0 && col <= gridSize;
  return false;
};

/** Every box an edge forms a side of — two of them, or one at the board's rim. */
const boxesTouching = (edgeId: string, gridSize: number): string[] => {
  const [axis, rawRow, rawCol] = edgeId.split('_');
  const row = Number(rawRow);
  const col = Number(rawCol);
  const inside = (r: number, c: number) => r >= 0 && r < gridSize && c >= 0 && c < gridSize;

  const candidates =
    axis === 'h'
      ? [
          [row - 1, col],
          [row, col],
        ]
      : [
          [row, col - 1],
          [row, col],
        ];

  return candidates.filter(([r, c]) => inside(r, c)).map(([r, c]) => boxId(r, c));
};

export const totalEdges = (gridSize: number): number => 2 * gridSize * (gridSize + 1);
export const totalBoxes = (gridSize: number): number => gridSize * gridSize;

/** How many boxes each seat has closed. The board is the scoreboard: a seat's
 *  standing is read off `boxes` rather than kept on the seat, because one line
 *  can close two boxes at once and a seat's `score` may only ever move by one. */
export const boxCounts = (
  gs: DotsGameState | null | undefined
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const uid of Object.values(gs?.boxes ?? {})) {
    counts[uid] = (counts[uid] ?? 0) + 1;
  }
  return counts;
};

/** Seats in order of boxes closed, ties broken by uid so every client agrees. */
export const rankByBoxes = (
  players: Record<string, RoomPlayer>,
  gs: DotsGameState | null | undefined
): RoomPlayer[] => {
  const counts = boxCounts(gs);
  return Object.values(players ?? {}).sort(
    (a, b) => (counts[b.uid] ?? 0) - (counts[a.uid] ?? 0) || a.uid.localeCompare(b.uid)
  );
};

/** Who takes the round, or null if the board is level. Nobody is credited a
 *  drawn round — `roundsWon` can only be claimed by the player it belongs to,
 *  and on a tie there is no such player. */
export const roundWinner = (
  players: Record<string, RoomPlayer>,
  gs: DotsGameState | null | undefined
): string | null => {
  const counts = boxCounts(gs);
  const ranked = rankByBoxes(players, gs);
  if (ranked.length === 0) return null;
  const [first, second] = ranked;
  if (second && (counts[first.uid] ?? 0) === (counts[second.uid] ?? 0)) return null;
  return first.uid;
};

/** An empty board. Both maps are left off entirely: the database has no way to
 *  store an empty one, and a board that starts with `edges: {}` would come back
 *  without it anyway. */
export const emptyDotsBoard = (
  gridSize: number,
  firstPlayerUid: string
): Omit<DotsGameState, 'turnStartedAt'> => ({
  gridSize,
  currentTurn: firstPlayerUid,
});

export type EdgeRefusal = 'no-board' | 'not-your-turn' | 'not-playing' | 'taken' | 'unknown-edge';

export type EdgeVerdict = { allowed: true } | { allowed: false; reason: EdgeRefusal };

/** Whether this tap is worth sending. The rules refuse a second claim on a line
 *  outright — that one is genuinely enforced server-side — so this is only here
 *  to save the trip and to keep the board from flickering. */
export const isEdgeClaimAllowed = (
  gs: RoomGameState | null | undefined,
  uid: string,
  edgeId: string
): EdgeVerdict => {
  if (!isDotsBoard(gs)) return { allowed: false, reason: 'no-board' };
  if (gs.currentTurn !== uid) return { allowed: false, reason: 'not-your-turn' };
  if (!isKnownEdge(edgeId, gs.gridSize)) return { allowed: false, reason: 'unknown-edge' };
  if (gs.edges?.[edgeId]) return { allowed: false, reason: 'taken' };
  return { allowed: true };
};

/** Everything the move writes, worked out from the room it read. */
export interface EdgeOutcome {
  edgeId: string;
  /** The boxes this line closed — none, one, or two. */
  closedBoxes: string[];
  /** Whose go it is next. Closing a box buys another. */
  nextTurnUid: string;
  /** The last box on the board went down with this move. */
  isComplete: boolean;
}

/**
 * What drawing this line comes to, or null if there is nothing to draw — no
 * board, not our turn, the round already over, or a line someone has taken.
 *
 * Read from the room every time it is called, so a tap sent against a board
 * that has moved on underneath it is refused here rather than half-written.
 */
export const claimEdgeOutcome = (
  room: Room | null | undefined,
  uid: string,
  edgeId: string
): EdgeOutcome | null => {
  const gs = room?.gameState;
  if (!room || !isDotsBoard(gs)) return null;
  if (room.status !== 'playing') return null;
  if (!isEdgeClaimAllowed(gs, uid, edgeId).allowed) return null;

  const edges = { ...(gs.edges ?? {}), [edgeId]: uid };
  const boxes = gs.boxes ?? {};

  const closedBoxes = boxesTouching(edgeId, gs.gridSize).filter(
    id => !boxes[id] && boxEdges(...boxCoords(id)).every(e => edges[e])
  );

  // A closed box buys another go. If we are somehow the last one at the table,
  // `nextPlayerUid` hands our own seat back, which is the only uid the rules
  // would accept anyway.
  const players = room.players ?? {};
  const candidate = closedBoxes.length > 0 ? uid : nextPlayerUid(players, uid);

  return {
    edgeId,
    closedBoxes,
    nextTurnUid: players[candidate] ? candidate : uid,
    isComplete:
      Object.keys(boxes).length + closedBoxes.length >= totalBoxes(gs.gridSize),
  };
};
