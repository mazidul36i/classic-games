/**
 * Exercises database.rules.json against the Realtime Database emulator.
 *
 *   npm run test:rules
 *
 * These rules are the only server-side thing in the project, so nothing here
 * should be deployed without this passing. Two things the emulator will happily
 * let you get wrong, both of which silently make every test vacuous:
 *
 *   - an `Authorization: Bearer owner` token bypasses rules entirely, so users
 *     are simulated with real ID tokens from the Auth emulator instead;
 *   - the emulator serves *any* namespace, and one it has no rules for is wide
 *     open. The rules load into `<projectId>-default-rtdb`, so `ns` must match.
 *
 * If a run comes back all green after a change to the rules, check that a case
 * you expect to fail still fails before believing it.
 */
const DB = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'}`;
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'}`;
const NS = 'demo-parlour-default-rtdb';

let pass = 0;
let fail = 0;
const U = {}; // name -> { uid, token }

const signUp = async name => {
  const res = await fetch(
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${name}@parlour.test`,
        password: 'password',
        returnSecureToken: true,
      }),
    }
  );
  if (!res.ok) throw new Error(`auth emulator: ${res.status} ${await res.text()}`);
  const body = await res.json();
  U[name] = { uid: body.localId, token: body.idToken };
};

/** as: undefined = signed out, 'ADMIN' = rules bypassed (fixtures), else a user name. */
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

const check = async (label, expected, method, path, as, body) => {
  const res = await req(method, path, as, body);
  const ok = expected === 'allow' ? res.ok : res.status === 401 || res.status === 403;
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label} — expected ${expected}, got ${res.status} ${(await res.text()).slice(0, 140)}`
    );
  }
};

const SV = { '.sv': 'timestamp' };
const seat = (uid, name) => ({
  uid,
  displayName: name,
  photoURL: '',
  score: 0,
  roundsWon: 0,
  isReady: false,
  joinedAt: Date.now(),
});
const room = (hostUid, isPrivate) => ({
  hostId: hostUid,
  isPrivate,
  maxPlayers: 4,
  status: 'waiting',
  gameType: 'card-flip',
  difficulty: '4x4',
  theme: 'emojis',
  round: 1,
  players: { [hostUid]: seat(hostUid, 'Alice') },
  createdAt: SV,
});
const cards = Array.from({ length: 16 }, (_, i) => ({
  id: `c${i}`,
  pairId: `p${Math.floor(i / 2)}`,
  value: '*',
  isFlipped: false,
  isMatched: false,
}));

const R = 'ROOMAA';
const PUB = 'ROOMBB';
const BUCKET = 'card-flip_4x4_emojis';

const run = async () => {
  await Promise.all([signUp('alice'), signUp('mallory')]);
  const A = U.alice.uid;
  const M = U.mallory.uid;

  console.log('\nroom creation');
  await check('signed-out cannot create a room', 'deny', 'PUT', `rooms/${R}`, undefined, room(A, true));
  await check('cannot create a room hosted by someone else', 'deny', 'PUT', `rooms/${R}`, 'mallory', room(A, true));
  await check('alice creates her own room', 'allow', 'PUT', `rooms/${R}`, 'alice', room(A, true));
  await check('mallory cannot overwrite an existing room', 'deny', 'PUT', `rooms/${R}`, 'mallory', room(M, true));
  await check('client-stamped createdAt is refused', 'deny', 'PUT', 'rooms/ROOMCC', 'alice', { ...room(A, true), createdAt: Date.now() });
  await check('an unknown game type is refused', 'deny', 'PUT', 'rooms/ROOMCC', 'alice', { ...room(A, true), gameType: 'poker' });

  console.log('\nreading');
  await check('signed-out cannot read a room', 'deny', 'GET', `rooms/${R}`, undefined);
  await check('a signed-in player with the code can read it', 'allow', 'GET', `rooms/${R}`, 'mallory');
  await check('nobody can list every room', 'deny', 'GET', 'rooms', 'mallory');

  console.log('\nseats');
  await check('mallory takes a seat', 'allow', 'PUT', `rooms/${R}/players/${M}`, 'mallory', seat(M, 'Mallory'));
  await check('mallory cannot write alice’s seat', 'deny', 'PUT', `rooms/${R}/players/${A}`, 'mallory', seat(A, 'Not Alice'));
  await check('a seat cannot carry a foreign uid', 'deny', 'PUT', `rooms/${R}/players/${M}`, 'mallory', seat(A, 'Mallory'));
  await check('a seat cannot smuggle extra fields', 'deny', 'PATCH', `rooms/${R}/players/${M}`, 'mallory', { isAdmin: true });
  await check('mallory marks herself ready', 'allow', 'PATCH', `rooms/${R}/players/${M}`, 'mallory', { isReady: true });
  await check('a seat cannot start with points on it', 'deny', 'PUT', `rooms/${R}/players/${M}`, 'mallory', { ...seat(M, 'M'), score: 7 });

  console.log('\nthe deal');
  await check('a guest cannot deal', 'deny', 'PATCH', `rooms/${R}`, 'mallory', { status: 'playing' });
  await check('the host deals', 'allow', 'PATCH', `rooms/${R}`, 'alice', {
    status: 'playing',
    startedAt: SV,
    gameState: { cards, currentTurn: A, matchedPairs: 0, totalPairs: 8, turnStartedAt: SV },
  });

  console.log('\nthe turn');
  await check('the turn holder flips', 'allow', 'PATCH', `rooms/${R}/gameState`, 'alice', { flippedCards: ['c0'] });
  await check('a third card in one turn is refused', 'deny', 'PATCH', `rooms/${R}/gameState`, 'alice', { flippedCards: ['c0', 'c1', 'c2'] });
  await check('an idle player cannot flip', 'deny', 'PATCH', `rooms/${R}/gameState`, 'mallory', { flippedCards: ['c3'] });
  await check('an idle player cannot rewrite the board', 'deny', 'PUT', `rooms/${R}/gameState/cards`, 'mallory', cards);
  await check('an idle player cannot seize the turn', 'deny', 'PUT', `rooms/${R}/gameState/currentTurn`, 'mallory', M);
  await check('matchedPairs cannot jump', 'deny', 'PUT', `rooms/${R}/gameState/matchedPairs`, 'alice', 8);
  await check('matchedPairs may rise by one', 'allow', 'PUT', `rooms/${R}/gameState/matchedPairs`, 'alice', 1);
  // totalPairs can change on the write that opens a fresh round (a new
  // difficulty means a new pair count) — see "the next round" below — but an
  // idle player still can't touch it mid-round; that's still gameState's own
  // ".write", not this value check.
  await check('an idle player cannot touch totalPairs mid-round', 'deny', 'PUT', `rooms/${R}/gameState/totalPairs`, 'mallory', 99);
  await check('the turn holder passes on', 'allow', 'PATCH', `rooms/${R}/gameState`, 'alice', { currentTurn: M, flippedCards: null, turnStartedAt: SV });

  console.log('\nscoring');
  await check('the turn holder takes a point', 'allow', 'PUT', `rooms/${R}/players/${M}/score`, 'mallory', 1);
  await check('but not five at once', 'deny', 'PUT', `rooms/${R}/players/${M}/score`, 'mallory', 6);
  await check('and not while someone else holds the turn', 'deny', 'PUT', `rooms/${R}/players/${A}/score`, 'alice', 1);

  console.log('\nthe clock');
  await check('a live turn cannot be passed by the idle player', 'deny', 'PUT', `rooms/${R}/gameState/currentTurn`, 'alice', A);
  await req('PUT', `rooms/${R}/gameState/turnStartedAt`, 'ADMIN', Date.now() - 60_000);
  await check('an expired turn may be passed by another player', 'allow', 'PATCH', `rooms/${R}/gameState`, 'alice', { currentTurn: A, flippedCards: null, turnStartedAt: SV });
  await req('PUT', `rooms/${R}/gameState/turnStartedAt`, 'ADMIN', Date.now() - 60_000);
  await check('the turn cannot be handed to a stranger', 'deny', 'PUT', `rooms/${R}/gameState/currentTurn`, 'alice', 'nobody');

  console.log('\nthe next round');
  const R2 = 'ROOMRR';
  await req('PUT', `rooms/${R2}`, 'ADMIN', {
    ...room(A, true),
    status: 'playing',
    round: 1,
    players: { [A]: { ...seat(A, 'Alice'), score: 5 }, [M]: { ...seat(M, 'Mallory'), score: 3 } },
    gameState: { cards, currentTurn: A, matchedPairs: 8, totalPairs: 8, turnStartedAt: SV },
  });
  await check('an outsider cannot propose before the round ends', 'deny', 'PUT', `rooms/${R2}/nextRound`, 'mallory', {
    gameType: 'word-match', difficulty: '4x4', theme: 'emojis', readyPlayers: { [M]: true },
  });
  await check('anyone but the last turn holder cannot end the round', 'deny', 'PATCH', `rooms/${R2}`, 'mallory', { status: 'round-finished', finishedAt: SV });
  await check('the last turn holder ends the round', 'allow', 'PATCH', `rooms/${R2}`, 'alice', { status: 'round-finished', finishedAt: SV });

  await check('a stranger cannot credit alice a round win', 'deny', 'PUT', `rooms/${R2}/players/${A}/roundsWon`, 'mallory', 1);
  await check('alice cannot award herself two rounds at once', 'deny', 'PUT', `rooms/${R2}/players/${A}/roundsWon`, 'alice', 2);
  await check('alice — actually ahead on score — credits her own win', 'allow', 'PUT', `rooms/${R2}/players/${A}/roundsWon`, 'alice', 1);

  await check('gameType cannot be changed directly between rounds', 'deny', 'PATCH', `rooms/${R2}`, 'alice', { gameType: 'word-match' });

  const seedProposal = { gameType: 'word-match', difficulty: '6x6', theme: 'animals', readyPlayers: { [A]: false, [M]: false } };
  await check('a seated player seeds the next-round proposal', 'allow', 'PUT', `rooms/${R2}/nextRound`, 'alice', seedProposal);
  await check('mallory agrees to it', 'allow', 'PATCH', `rooms/${R2}/nextRound/readyPlayers`, 'mallory', { [M]: true });
  await check('mallory cannot agree on alice’s behalf', 'deny', 'PATCH', `rooms/${R2}/nextRound/readyPlayers`, 'mallory', { [A]: true });
  await check('mallory may withdraw her own agreement', 'allow', 'PATCH', `rooms/${R2}/nextRound/readyPlayers`, 'mallory', { [M]: false });
  await check('a fresh proposal resets the table — alice re-proposes word-match', 'allow', 'PUT', `rooms/${R2}/nextRound`, 'alice', {
    gameType: 'word-match', difficulty: '4x4', theme: 'colors', readyPlayers: { [A]: true },
  });
  await check('mallory agrees to the new proposal', 'allow', 'PATCH', `rooms/${R2}/nextRound/readyPlayers`, 'mallory', { [M]: true });

  // Dealing is two writes, not one — see startNextRound in src/firebase/realtime.ts
  // for why gameType/round can't land in the same write as the status flip.
  // Flipping status alone isn't itself the gate (any seated player may do that
  // much); the deal that follows is where an impostor actually gets refused.
  await req('PUT', `rooms/${R2}/status`, 'ADMIN', 'playing');
  await check('mallory cannot actually deal — she did not hold the last turn', 'deny', 'PATCH', `rooms/${R2}`, 'mallory', {
    round: 2, gameType: 'word-match', difficulty: '4x4', theme: 'colors',
    gameState: { cards, currentTurn: M, matchedPairs: 0, totalPairs: 8, turnStartedAt: SV },
    nextRound: null,
  });
  await req('PUT', `rooms/${R2}/status`, 'ADMIN', 'round-finished');

  await check('the last turn holder flips status to open the round', 'allow', 'PATCH', `rooms/${R2}`, 'alice', { status: 'playing', startedAt: SV });
  await check('...then deals the agreed-on game, gameType and all', 'allow', 'PATCH', `rooms/${R2}`, 'alice', {
    round: 2, gameType: 'word-match', difficulty: '4x4', theme: 'colors',
    gameState: { cards, currentTurn: M, matchedPairs: 0, totalPairs: 8, turnStartedAt: SV },
    nextRound: null,
    [`players/${A}/score`]: 0,
  });
  await check('mallory zeroes her own carried-over score', 'allow', 'PUT', `rooms/${R2}/players/${M}/score`, 'mallory', 0);
  await check('alice cannot zero mallory’s score for her', 'deny', 'PUT', `rooms/${R2}/players/${M}/score`, 'alice', 0);

  console.log('\nending between rounds');
  const R3 = 'ROOMEE';
  await req('PUT', `rooms/${R3}`, 'ADMIN', {
    ...room(A, true),
    status: 'round-finished',
    players: { [A]: seat(A, 'Alice'), [M]: seat(M, 'Mallory') },
    gameState: { cards, currentTurn: A, matchedPairs: 8, totalPairs: 8, turnStartedAt: SV },
  });
  await check('an outsider cannot end the session', 'deny', 'DELETE', `rooms/${R3}`, undefined);
  await check('any seated player — not just the host — may end it between rounds', 'allow', 'DELETE', `rooms/${R3}`, 'mallory');

  console.log('\nclosing the table');
  await check('a player cannot delete a room in play', 'deny', 'DELETE', `rooms/${R}`, 'mallory');
  await check('the host may close it', 'allow', 'DELETE', `rooms/${R}`, 'alice');

  console.log('\nthe matchmaking index');
  await req('PUT', `rooms/${PUB}`, 'alice', room(A, false));
  await check('a seated player publishes their open room', 'allow', 'PUT', `openRooms/${BUCKET}/${PUB}`, 'alice', true);
  await check('an outsider cannot publish a pointer', 'deny', 'PUT', `openRooms/${BUCKET}/ROOMZZ`, 'mallory', true);
  await check('a pointer must be a plain true', 'deny', 'PUT', `openRooms/${BUCKET}/${PUB}`, 'alice', { spam: 1 });
  await check('the bucket is readable for matchmaking', 'allow', 'GET', `openRooms/${BUCKET}`, 'mallory');
  await check('anyone may retract a stale pointer', 'allow', 'DELETE', `openRooms/${BUCKET}/${PUB}`, 'mallory');

  console.log('\nsweeping');
  await req('PUT', 'rooms/ROOMOLD', 'ADMIN', { ...room(A, true), createdAt: Date.now() - 7 * 60 * 60 * 1000 });
  await check('a six-hour-old waiting room may be swept by anyone', 'allow', 'DELETE', 'rooms/ROOMOLD', 'mallory');
  await req('PUT', 'rooms/ROOMFRESH', 'ADMIN', { ...room(A, true), createdAt: Date.now() });
  await check('a fresh room may not be swept by an outsider', 'deny', 'DELETE', 'rooms/ROOMFRESH', 'mallory');
  await req('PUT', 'rooms/ROOMEMPTY', 'ADMIN', { ...room(A, true), players: null, createdAt: Date.now() });
  await check('an empty room may be swept by anyone', 'allow', 'DELETE', 'rooms/ROOMEMPTY', 'mallory');

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(e => {
  console.error(e);
  process.exit(1);
});
