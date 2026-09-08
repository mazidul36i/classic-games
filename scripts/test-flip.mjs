/**
 * The multiplayer flip, against the Realtime Database emulator.
 *
 *   npm run test:flip     (or: firebase emulators:exec ... node scripts/test-flip.mjs)
 *
 * A turn is two writes with a pause in the middle — flip, flip, then resolve —
 * and for a long time the pause lived in one `setTimeout` inside one tab. This
 * file exists because that meant a reload could end a turn halfway and leave the
 * board with two cards face up and nothing anywhere that would ever put them
 * down. Both halves are pinned here: the stuck states the old client could
 * write, and the recovery that now gets out of them.
 *
 * Same two emulator traps as `test-rules.mjs` — read its header before touching
 * the transport here.
 */
import {
  resolvePairOutcome,
  isFlipAllowed,
  isPresent,
  activeOrder,
  nextPlayerUid,
  REVEAL_MS,
} from '../src/utils/flipUtils.ts';

const DB = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'}`;
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
const NS = 'demo-parlour-default-rtdb';

let pass = 0;
let fail = 0;
const U = {};

const signUp = async name => {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name}-flip@parlour.test`,
        password: 'password',
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`auth emulator: ${res.status} ${await res.text()}`);
  const body = await res.json();
  U[name] = { uid: body.localId, token: body.idToken };
};

/** as: 'ADMIN' bypasses rules (fixtures only); otherwise a user name. */
const req = (method, path, as, body) => {
  const q = new URLSearchParams({ ns: NS });
  const headers = { 'Content-Type': 'application/json' };
  if (as === 'ADMIN') headers.Authorization = 'Bearer owner';
  else if (as) q.set('auth', U[as].token);
  return fetch(`${DB}/${path}.json?${q}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

const read = async path => (await req('GET', path, 'ADMIN')).json();

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

const SV = { '.sv': 'timestamp' };

const seat = (uid, name) => ({
  uid,
  displayName: name,
  photoURL: '',
  score: 0,
  roundsWon: 0,
  isReady: true,
  joinedAt: Date.now(),
  connected: true,
});

/** Four cards, two pairs: c0/c2 are one pair, c1/c3 the other. */
const deck = () => [
  { id: 'c0', value: '★', pairId: 'p0', isFlipped: false, isMatched: false },
  { id: 'c1', value: '●', pairId: 'p1', isFlipped: false, isMatched: false },
  { id: 'c2', value: '★', pairId: 'p0', isFlipped: false, isMatched: false },
  { id: 'c3', value: '●', pairId: 'p1', isFlipped: false, isMatched: false },
];

/** A room mid-hand, Alice to play. Written as ADMIN — this is the fixture, not
 *  the thing under test. */
const deal = async roomId => {
  await req('PUT', `rooms/${roomId}`, 'ADMIN', {
    hostId: U.alice.uid,
    isPrivate: true,
    maxPlayers: 2,
    status: 'playing',
    gameType: 'card-flip',
    difficulty: '4x4',
    theme: 'symbols',
    round: 1,
    createdAt: SV,
    startedAt: SV,
    players: {
      [U.alice.uid]: seat(U.alice.uid, 'Alice'),
      [U.bob.uid]: seat(U.bob.uid, 'Bob'),
    },
    gameState: {
      cards: deck(),
      currentTurn: U.alice.uid,
      matchedPairs: 0,
      totalPairs: 2,
      turnStartedAt: SV,
    },
  });
};

// ─── What the old client did, write for write ────────────────────────────────

/** The pre-fix `flipCard`: read the array, append, write it back. No check that
 *  the card is already in there, and two of these can interleave. */
const legacyFlip = async (roomId, as, cardId) => {
  const gs = await read(`rooms/${roomId}/gameState`);
  const flipped = [...(gs.flippedCards || []), cardId];
  return req('PATCH', `rooms/${roomId}/gameState`, as, { flippedCards: flipped });
};

// ─── The fixed client's two moving parts ─────────────────────────────────────

/** The new `flipCard`: one compare-and-set against the stored array, so a second
 *  tap of the same card and a third card are both refused by the write itself
 *  rather than by whatever the tab happened to have in memory. */
const atomicFlip = async (roomId, as, cardId) => {
  const gs = await read(`rooms/${roomId}/gameState`);
  const verdict = isFlipAllowed(gs, U[as].uid, cardId);
  if (!verdict.allowed) return verdict.reason;
  const res = await req('PATCH', `rooms/${roomId}/gameState`, as, {
    flippedCards: [...(gs.flippedCards || []), cardId],
  });
  return res.ok ? 'flipped' : 'refused';
};

/** The new resolve: computed from whatever is on the table right now, and
 *  landed as one write so a point cannot arrive without the board that earned
 *  it. This is what the recovery effect calls. */
const resolve = async (roomId, as) => {
  const room = await read(`rooms/${roomId}`);
  const outcome = resolvePairOutcome(room, U[as].uid);
  if (!outcome) return null;

  const updates = {
    [`rooms/${roomId}/gameState/cards`]: outcome.cards,
    [`rooms/${roomId}/gameState/flippedCards`]: null,
    [`rooms/${roomId}/gameState/currentTurn`]: outcome.nextTurnUid,
    [`rooms/${roomId}/gameState/matchedPairs`]: outcome.matchedPairs,
    [`rooms/${roomId}/gameState/turnStartedAt`]: SV,
  };
  if (outcome.scoringUid) {
    updates[`rooms/${roomId}/players/${outcome.scoringUid}/score`] = outcome.newScore;
  }
  if (outcome.isComplete) {
    updates[`rooms/${roomId}/status`] = 'round-finished';
    updates[`rooms/${roomId}/finishedAt`] = SV;
  }
  const res = await req('PATCH', '', as, updates);
  return { outcome, ok: res.ok, status: res.status, body: res.ok ? '' : await res.text() };
};

// ─── The runs ────────────────────────────────────────────────────────────────

const run = async () => {
  await Promise.all([signUp('alice'), signUp('bob'), signUp('carol')]);

  console.log('\nthe stuck states the old client could leave behind\n');

  // ── A reload between the second flip and the resolve ──
  await deal('STUCK1');
  await legacyFlip('STUCK1', 'alice', 'c0');
  await legacyFlip('STUCK1', 'alice', 'c2');
  // …and here Alice's tab reloads. The setTimeout that would have resolved this
  // went with it, and nothing else in the system is watching.
  let gs = await read('STUCK1/gameState'.replace(/^/, 'rooms/'));
  eq('a reload mid-pair leaves two cards face up', gs.flippedCards, ['c0', 'c2']);
  eq('…the turn never moves off the player who reloaded', gs.currentTurn, U.alice.uid);
  eq('…and the pair that was there to be taken is not counted', gs.matchedPairs, 0);
  ok(
    '…so every later tap is refused by the old two-card guard: the board is dead',
    (gs.flippedCards || []).length >= 2
  );

  // ── Two taps of one card, which mobile makes easy ──
  await deal('STUCK2');
  const first = read('rooms/STUCK2/gameState'); // both taps read before either writes
  const second = read('rooms/STUCK2/gameState');
  const [gsA, gsB] = await Promise.all([first, second]);
  await req('PATCH', 'rooms/STUCK2/gameState', 'alice', {
    flippedCards: [...(gsA.flippedCards || []), 'c0'],
  });
  // The second tap's read landed after the first tap's write on a real device;
  // reproduce that ordering rather than the interleaving that happens to be
  // faster here.
  const afterFirst = await read('rooms/STUCK2/gameState');
  await req('PATCH', 'rooms/STUCK2/gameState', 'alice', {
    flippedCards: [...(afterFirst.flippedCards || []), 'c0'],
  });
  void gsB;
  gs = await read('rooms/STUCK2/gameState');
  eq('two taps of one card put it in the pair twice', gs.flippedCards, ['c0', 'c0']);
  ok(
    '…the rules allow it — they only ever counted to two',
    (gs.flippedCards || []).length === 2
  );
  ok(
    '…and neither tap thought it had completed a pair, so nothing resolves it',
    gs.matchedPairs === 0
  );

  console.log('\nthe flip write, now that it is a compare-and-set\n');

  await deal('FIX1');
  eq('the first card goes down', await atomicFlip('FIX1', 'alice', 'c0'), 'flipped');
  eq(
    'the same card again is refused, not appended',
    await atomicFlip('FIX1', 'alice', 'c0'),
    'duplicate'
  );
  eq('a different card completes the pair', await atomicFlip('FIX1', 'alice', 'c2'), 'flipped');
  eq('a third card is refused', await atomicFlip('FIX1', 'alice', 'c1'), 'pair-full');
  eq("bob cannot flip on alice's turn", await atomicFlip('FIX1', 'bob', 'c1'), 'not-your-turn');
  eq('the board holds exactly the pair', (await read('rooms/FIX1/gameState')).flippedCards, [
    'c0',
    'c2',
  ]);

  console.log('\nresolving a pair the tab that flipped it never came back for\n');

  // FIX1 is exactly the state STUCK1 was: two cards up, no timer anywhere.
  // The recovery reads it off the room and finishes the turn.
  let r = await resolve('FIX1', 'alice');
  ok('a matching pair resolves', r.ok, `${r.status} ${r.body}`);
  const room = await read('rooms/FIX1');
  eq('…both cards stay face up, claimed', [room.gameState.cards[0], room.gameState.cards[2]].map(c => c.isMatched), [true, true]);
  eq('…the pair is counted', room.gameState.matchedPairs, 1);
  eq('…the point lands in the same write', room.players[U.alice.uid].score, 1);
  eq('…and a match keeps the turn', room.gameState.currentTurn, U.alice.uid);
  eq('…with the board cleared for the next pair', room.gameState.flippedCards ?? null, null);

  // ── A miss hands the turn on ──
  await deal('FIX2');
  await atomicFlip('FIX2', 'alice', 'c0');
  await atomicFlip('FIX2', 'alice', 'c1');
  r = await resolve('FIX2', 'alice');
  ok('a miss resolves', r.ok, `${r.status} ${r.body}`);
  let f2 = await read('rooms/FIX2');
  eq('…the cards go back down', f2.gameState.cards.filter(c => c.isMatched).length, 0);
  eq('…no point is awarded', f2.players[U.alice.uid].score, 0);
  eq('…and the turn passes', f2.gameState.currentTurn, U.bob.uid);

  // ── A board already spoiled by the old build heals instead of paying out ──
  await deal('HEAL');
  await req('PATCH', 'rooms/HEAL/gameState', 'ADMIN', { flippedCards: ['c0', 'c0'] });
  const healOutcome = resolvePairOutcome(await read('rooms/HEAL'), U.alice.uid);
  eq('a card paired with itself is not a match', healOutcome.matched, false);
  eq('…it earns nothing', healOutcome.scoringUid, null);
  r = await resolve('HEAL', 'alice');
  ok('…and clearing it is a legal write', r.ok, `${r.status} ${r.body}`);
  const heal = await read('rooms/HEAL');
  eq('…the table is playable again', heal.gameState.flippedCards ?? null, null);
  eq('…with the count untouched', heal.gameState.matchedPairs, 0);

  // ── The last pair closes the round in one write ──
  await deal('DONE');
  await req('PATCH', 'rooms/DONE/gameState', 'ADMIN', { matchedPairs: 1 });
  await atomicFlip('DONE', 'alice', 'c0');
  await atomicFlip('DONE', 'alice', 'c2');
  r = await resolve('DONE', 'alice');
  ok('the closing pair resolves', r.ok, `${r.status} ${r.body}`);
  const done = await read('rooms/DONE');
  eq('…the round is over', done.status, 'round-finished');
  eq('…the point still landed', done.players[U.alice.uid].score, 1);
  eq('…and the table is still seated', Object.keys(done.players).length, 2);

  // ── The seatmate leaving mid-reveal must not wedge the write ──
  await deal('GONE');
  await atomicFlip('GONE', 'alice', 'c0');
  await atomicFlip('GONE', 'alice', 'c1'); // a miss: the turn wants to move on
  await req('DELETE', `rooms/GONE/players/${U.bob.uid}`, 'ADMIN');
  r = await resolve('GONE', 'alice');
  ok('a miss with nobody left to pass to still resolves', r.ok, `${r.status} ${r.body}`);
  eq(
    '…the turn stays with the last player standing',
    (await read('rooms/GONE/gameState')).currentTurn,
    U.alice.uid
  );

  /* The whole point of folding the point into the resolve is that the rules get
     to see it. If these two came back allowed, every green line above would be
     measuring the client talking to itself. */
  console.log('\nwhat the rules still refuse, now that the point rides along\n');

  await deal('DENY');
  await atomicFlip('DENY', 'alice', 'c0');
  await atomicFlip('DENY', 'alice', 'c2');

  const honest = resolvePairOutcome(await read('rooms/DENY'), U.alice.uid);
  let res = await req('PATCH', '', 'alice', {
    [`rooms/DENY/gameState/cards`]: honest.cards,
    [`rooms/DENY/gameState/flippedCards`]: null,
    [`rooms/DENY/gameState/currentTurn`]: honest.nextTurnUid,
    [`rooms/DENY/gameState/matchedPairs`]: honest.matchedPairs,
    [`rooms/DENY/gameState/turnStartedAt`]: SV,
    [`rooms/DENY/players/${U.alice.uid}/score`]: 5, // a point is a point, not five
  });
  ok('a resolve that pays itself more than one point is refused', res.status === 403 || res.status === 401, `got ${res.status}`);

  res = await req('PATCH', '', 'bob', {
    [`rooms/DENY/gameState/cards`]: honest.cards,
    [`rooms/DENY/gameState/flippedCards`]: null,
    [`rooms/DENY/gameState/currentTurn`]: U.bob.uid,
    [`rooms/DENY/gameState/matchedPairs`]: honest.matchedPairs,
    [`rooms/DENY/gameState/turnStartedAt`]: SV,
    [`rooms/DENY/players/${U.bob.uid}/score`]: 1,
  });
  ok("a player who does not hold the turn cannot resolve it", res.status === 403 || res.status === 401, `got ${res.status}`);
  eq(
    '…and the pair is still sitting there for the player whose turn it is',
    (await read('rooms/DENY/gameState')).flippedCards,
    ['c0', 'c2']
  );
  r = await resolve('DENY', 'alice');
  ok('…who can still finish it', r.ok, `${r.status} ${r.body}`);
  eq('…for exactly one point', (await read(`rooms/DENY/players/${U.alice.uid}`)).score, 1);

  /* The bug this file was opened for. A refresh drops the websocket, the seat's
     onDisconnect fires, and the player used to come back to their own table as
     a spectator: the seat gone, `joinRoom` answering 'in-play', and the rules
     refusing to re-create a seat in a room that is not 'waiting'. The seat is
     kept and marked away now, which is a state the player can write themselves
     back out of. */
  console.log('\ncoming back from a refresh\n');

  await deal('BACK');
  await req('PATCH', `rooms/BACK/players/${U.alice.uid}`, 'ADMIN', { score: 3, roundsWon: 1 });

  // What the onDisconnect now does, in place of removing the seat.
  res = await req('PATCH', `rooms/BACK/players/${U.alice.uid}`, 'alice', {
    connected: false,
  });
  ok('a dropped tab may mark its own seat away', res.ok, `${res.status}`);

  let back = await read('rooms/BACK');
  ok('…the seat is still at the table', Boolean(back.players[U.alice.uid]));
  eq('…with the score it had', back.players[U.alice.uid].score, 3);
  eq('…and the rounds it had won', back.players[U.alice.uid].roundsWon, 1);
  eq('…read as away', isPresent(back.players[U.alice.uid]), false);

  eq(
    'the turn goes round an empty seat rather than sitting on it',
    activeOrder(back.players),
    [U.bob.uid]
  );
  eq(
    '…so the next turn belongs to whoever is actually there',
    nextPlayerUid(back.players, U.alice.uid),
    U.bob.uid
  );

  res = await req('PATCH', `rooms/BACK/players/${U.alice.uid}`, 'alice', { connected: true });
  ok('and the player may take their own seat back mid-hand', res.ok, `${res.status}`);
  back = await read('rooms/BACK');
  eq('…the score survived the round trip', back.players[U.alice.uid].score, 3);
  eq('…and both seats are in play again', activeOrder(back.players).length, 2);

  /* Keeping the seat is what makes coming back possible; it must not also make
     sitting down mid-hand possible for someone who was never there. */
  res = await req('PATCH', `rooms/BACK/players/${U.carol.uid}`, 'carol', {
    ...seat(U.carol.uid, 'Carol'),
    connected: true,
  });
  ok(
    'a stranger still cannot take a seat once the cards are down',
    res.status === 403 || res.status === 401,
    `got ${res.status}`
  );

  res = await req('PATCH', `rooms/BACK/players/${U.alice.uid}`, 'bob', { connected: false });
  ok(
    "and nobody may mark someone else's seat away",
    res.status === 403 || res.status === 401,
    `got ${res.status}`
  );

  /* A seat written before this field existed has no flag. Rooms like that are
     open right now, and must keep working rather than reading as empty. */
  const legacy = { [U.alice.uid]: seat(U.alice.uid, 'Alice') };
  delete legacy[U.alice.uid].connected;
  eq('a seat from before presence is read as present', isPresent(legacy[U.alice.uid]), true);
  eq('…and still takes its turn', activeOrder(legacy), [U.alice.uid]);

  console.log('\nthe reveal pause\n');
  ok('the pair is held up long enough to be read', REVEAL_MS >= 600 && REVEAL_MS <= 1500);

  // Tidy up after ourselves.
  for (const id of ['STUCK1', 'STUCK2', 'FIX1', 'FIX2', 'HEAL', 'DONE', 'GONE', 'DENY', 'BACK']) {
    await req('DELETE', `rooms/${id}`, 'ADMIN');
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
