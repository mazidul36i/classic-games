/**
 * The rules of Dots and Boxes, as pure functions.
 *
 *   npm run test:rules     (runs this alongside the rule and flip tests)
 *
 * No emulator here: everything this game decides — which boxes a line closed,
 * who goes next, who took the round — is a function of the room as stored, and
 * that is the property worth pinning. It is what lets any tab finish a move
 * against the board it can see rather than the one it remembers, and it is why
 * this game needs nothing like the flip's reveal pause to recover from.
 *
 * The database's own half — that a line is drawn once, by the turn holder,
 * under their own name — is in `test-rules.mjs` instead, because only the rules
 * can promise it.
 */
import {
  boxCounts,
  boxEdges,
  claimEdgeOutcome,
  emptyDotsBoard,
  gridSizeFor,
  isDotsBoard,
  isEdgeClaimAllowed,
  rankByBoxes,
  roundWinner,
  seatIndexOf,
  seatInkAt,
  seatSuitAt,
  totalBoxes,
  totalEdges,
} from '../src/utils/dotsUtils.ts';

let pass = 0;
let fail = 0;

const ok = (label, condition, detail = '') => {
  if (condition) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const eq = (label, actual, expected) =>
  ok(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );

const A = 'alice';
const M = 'mallory';

const seat = (uid, joinedAt) => ({
  uid,
  displayName: uid,
  score: 0,
  roundsWon: 0,
  isReady: true,
  joinedAt,
  connected: true,
});

const players = { [A]: seat(A, 1), [M]: seat(M, 2) };

/** A room mid-hand, with whatever lines and boxes are already down. */
const table = (gs, status = 'playing') => ({
  id: 'DOTS',
  hostId: A,
  isPrivate: true,
  maxPlayers: 2,
  status,
  gameType: 'dots-and-boxes',
  difficulty: '4x4',
  theme: 'emojis',
  round: 1,
  players,
  gameState: gs,
  createdAt: 0,
});

const board = (gridSize, currentTurn, edges, boxes) => ({
  gridSize,
  currentTurn,
  turnStartedAt: 1,
  ...(edges ? { edges } : {}),
  ...(boxes ? { boxes } : {}),
});

/** Play a list of lines in order, each by whoever holds the turn. */
const playOut = (gs, moves) => {
  let state = gs;
  for (const edgeId of moves) {
    const outcome = claimEdgeOutcome(table(state), state.currentTurn, edgeId);
    if (!outcome) throw new Error(`refused: ${edgeId}`);
    const uid = state.currentTurn;
    state = {
      ...state,
      edges: { ...(state.edges ?? {}), [edgeId]: uid },
      boxes: {
        ...(state.boxes ?? {}),
        ...Object.fromEntries(outcome.closedBoxes.map(id => [id, uid])),
      },
      currentTurn: outcome.nextTurnUid,
    };
  }
  return state;
};

const run = () => {
  console.log('\nthe board');
  eq('the length of hand is the size of the board', gridSizeFor('6x6'), 6);
  eq('a 4×4 board holds sixteen boxes', totalBoxes(4), 16);
  eq('…and forty lines', totalEdges(4), 40);
  eq('a box is closed by four lines', boxEdges(1, 2), ['h_1_2', 'h_2_2', 'v_1_2', 'v_1_3']);
  ok('a freshly dealt board is the grid and the turn alone', (() => {
    const fresh = emptyDotsBoard(4, A);
    return !('edges' in fresh) && !('boxes' in fresh) && fresh.currentTurn === A;
  })());
  ok('a deck is not mistaken for a board', !isDotsBoard({ cards: [], currentTurn: A }));
  ok('…and a board is', isDotsBoard(emptyDotsBoard(4, A)));

  console.log('\nwhose go it is');
  const fresh = board(4, A);
  eq('a line that closes nothing hands the turn on', claimEdgeOutcome(table(fresh), A, 'h_0_0').nextTurnUid, M);
  eq('…and closes nothing', claimEdgeOutcome(table(fresh), A, 'h_0_0').closedBoxes, []);

  // Three sides of b_0_0 down, all drawn by mallory; alice draws the fourth.
  const nearlyClosed = board(4, A, { h_0_0: M, h_1_0: M, v_0_0: M });
  const closing = claimEdgeOutcome(table(nearlyClosed), A, 'v_0_1');
  eq('the fourth line closes the box', closing.closedBoxes, ['b_0_0']);
  eq('and the box buys another go', closing.nextTurnUid, A);
  ok('the round is not over yet', closing.isComplete === false);

  // One line can be the fourth side of two boxes at once — the reason a seat's
  // score cannot be kept on the seat, where it may only ever move by one.
  const corridor = board(4, A, {
    h_0_0: M, v_0_0: M, v_0_1: M, // b_0_0 wants h_1_0
    h_2_0: M, v_1_0: M, v_1_1: M, // b_1_0 wants h_1_0 too
  });
  const double = claimEdgeOutcome(table(corridor), A, 'h_1_0');
  eq('one line can close two boxes', double.closedBoxes.sort(), ['b_0_0', 'b_1_0']);

  console.log('\nwhat is refused');
  const drawn = board(4, A, { h_0_0: M });
  ok('a line already drawn', !isEdgeClaimAllowed(drawn, A, 'h_0_0').allowed);
  ok('a line off the edge of the board', !isEdgeClaimAllowed(drawn, A, 'h_9_9').allowed);
  ok('a line that is not one', !isEdgeClaimAllowed(drawn, A, 'x_0_0').allowed);
  ok('a move made out of turn', !isEdgeClaimAllowed(drawn, M, 'v_0_0').allowed);
  ok('a move on a deck', !isEdgeClaimAllowed({ cards: [], currentTurn: A }, A, 'h_0_0').allowed);
  ok('a move once the round is over', claimEdgeOutcome(table(drawn, 'round-finished'), A, 'v_0_0') === null);
  /* The one that matters: a tap sent against a board that has moved on under it
     is refused here rather than half-written, because the outcome is worked out
     from the room at the moment of the write and not at the moment of the tap. */
  ok('a tap the board has already answered', claimEdgeOutcome(table(drawn), A, 'h_0_0') === null);

  console.log('\nthe scoreboard');
  /* A 2×2 board played out in full, every move made by whoever the last one
     left holding the turn. Mallory closes three boxes off alice's third lines
     and goes again each time; alice takes the last one. Twelve legal moves —
     `playOut` throws on a refusal, so the sequence itself is the assertion. */
  const small = playOut(board(2, A), [
    'h_0_0', 'v_0_0', 'v_0_1', 'h_1_0',
    'h_0_1', 'v_0_2', 'h_1_1',
    'v_1_0', 'h_2_0', 'v_1_1',
    'v_1_2', 'h_2_1',
  ]);
  const counted = Object.entries(boxCounts(small)).sort();
  eq('every line on the board is drawn', Object.keys(small.edges).length, totalEdges(2));
  eq('and every box closed', Object.keys(small.boxes).length, totalBoxes(2));
  eq('the board is the scoreboard', counted, [[A, 1], [M, 3]]);
  eq('the seats rank by boxes closed', rankByBoxes(players, small).map(p => p.uid), [M, A]);
  eq('whoever closed more takes the round', roundWinner(players, small), M);
  ok(
    'closing the last box ends the round',
    claimEdgeOutcome(table(playOut(board(2, A), [
      'h_0_0', 'v_0_0', 'v_0_1', 'h_1_0',
      'h_0_1', 'v_0_2', 'h_1_1',
      'v_1_0', 'h_2_0', 'v_1_1',
      'v_1_2',
    ])), A, 'h_2_1').isComplete === true
  );

  const level = { ...small, boxes: { b_0_0: A, b_0_1: A, b_1_0: M, b_1_1: M } };
  eq('a level board is nobody’s round', roundWinner(players, level), null);
  eq('and an empty board is nobody’s either', roundWinner(players, board(2, A)), null);

  console.log('\na table of four');
  const four = {
    [A]: seat(A, 1),
    [M]: seat(M, 2),
    carol: seat('carol', 3),
    dave: seat('dave', 4),
  };
  const seatedFour = [A, M, 'carol', 'dave'];

  /* Four at a table means initials collide, so a seat is marked by its suit.
     Suit and ink both come from where you sit, so the board and the seat plate
     cannot disagree about whose box is whose. */
  eq('each seat draws under its own suit', seatedFour.map((uid, i) => seatSuitAt(i)), ['♥', '♦', '♠', '♣']);
  eq('and in its own ink', seatedFour.map((uid, i) => seatInkAt(i)), ['p-ink-1', 'p-ink-2', 'p-ink-3', 'p-ink-4']);
  eq('a seat is found by where it sat down', seatIndexOf(seatedFour, 'carol'), 2);
  eq('a stranger to the table still gets drawn', seatIndexOf(seatedFour, 'nobody'), 0);
  ok(
    'two players sharing an initial still differ',
    seatSuitAt(seatIndexOf(seatedFour, A)) !== seatSuitAt(seatIndexOf(seatedFour, 'dave'))
  );

  // The turn goes round all four, and a closed box still buys another go.
  const fourUp = { ...board(4, A), players: four };
  const roundTable = table(board(4, A));
  roundTable.players = four;
  eq('the turn goes round the table', claimEdgeOutcome(roundTable, A, 'h_0_0').nextTurnUid, M);
  roundTable.gameState = board(4, 'carol');
  eq('…and on past the third seat', claimEdgeOutcome(roundTable, 'carol', 'h_0_1').nextTurnUid, 'dave');
  roundTable.gameState = board(4, 'dave');
  eq('…and round to the first again', claimEdgeOutcome(roundTable, 'dave', 'h_0_2').nextTurnUid, A);

  const spread = { ...fourUp, boxes: { b_0_0: A, b_0_1: M, b_1_0: 'carol', b_1_1: 'carol' } };
  eq('four seats rank by boxes closed', rankByBoxes(four, spread).map(p => p.uid), ['carol', A, M, 'dave']);
  eq('and the round goes to whoever closed most', roundWinner(four, spread), 'carol');
  const sharedLead = { ...fourUp, boxes: { b_0_0: A, b_0_1: A, b_1_0: M, b_1_1: M } };
  eq('two tied in front is nobody’s round', roundWinner(four, sharedLead), null);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

run();
