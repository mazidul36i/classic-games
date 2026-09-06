/**
 * Exercises firestore.rules against the Firestore emulator.
 *
 *   npm run test:rules
 *
 * Uses @firebase/rules-unit-testing, which issues fake-but-real auth contexts
 * against the emulator and lets each check run as a specific signed-in user
 * (or signed out) through the real client SDK — the same functions the app
 * calls (setDoc/updateDoc/...), so a check here fails exactly the way the app
 * would fail.
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-parlour';
const ALICE = 'alice-uid';
const MALLORY = 'mallory-uid';

let pass = 0;
let fail = 0;

const check = async (label, expected, run) => {
  try {
    if (expected === 'allow') await assertSucceeds(run());
    else await assertFails(run());
    pass++;
    console.log(`  ok    ${label}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL  ${label} — expected ${expected}, ${String(e.message || e).split('\n')[0]}`);
  }
};

const run = async () => {
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  const alice = testEnv.authenticatedContext(ALICE).firestore();
  const mallory = testEnv.authenticatedContext(MALLORY).firestore();
  const anon = testEnv.unauthenticatedContext().firestore();

  const profile = (overrides = {}) => ({
    displayName: 'Alice',
    email: 'alice@parlour.test',
    photoURL: '',
    createdAt: Date.now(),
    totalGamesPlayed: 0,
    totalWins: 0,
    highScores: {},
    ...overrides,
  });

  console.log('\nusers/{uid}');
  await check('signed-out cannot create a profile', 'deny', () =>
    setDoc(doc(anon, 'users', ALICE), profile()));
  await check('mallory cannot create alice’s profile', 'deny', () =>
    setDoc(doc(mallory, 'users', ALICE), profile()));
  await check('alice creates her own profile', 'allow', () =>
    setDoc(doc(alice, 'users', ALICE), profile()));
  await check('signed-out cannot read a profile', 'deny', () =>
    getDoc(doc(anon, 'users', ALICE)));
  await check('a signed-in stranger can read a profile', 'allow', () =>
    getDoc(doc(mallory, 'users', ALICE)));
  await check('alice updates an ordinary field', 'allow', () =>
    updateDoc(doc(alice, 'users', ALICE), { totalGamesPlayed: 3 }));
  await check('alice cannot change her own email', 'deny', () =>
    updateDoc(doc(alice, 'users', ALICE), { email: 'new@parlour.test' }));
  await check('alice cannot change her own createdAt', 'deny', () =>
    updateDoc(doc(alice, 'users', ALICE), { createdAt: 1 }));
  await check('mallory cannot edit alice’s profile', 'deny', () =>
    updateDoc(doc(mallory, 'users', ALICE), { totalGamesPlayed: 99 }));
  await check('nobody can delete a profile', 'deny', () =>
    deleteDoc(doc(alice, 'users', ALICE)));

  console.log('\ngameHistory/{id}');
  const historyResult = () => ({
    uid: ALICE,
    displayName: 'Alice',
    gameType: 'card-flip',
    mode: 'single',
    difficulty: '4x4',
    score: 500,
    moves: 20,
    timeSeconds: 60,
    completedAt: serverTimestamp(),
    isWin: true,
  });
  await check('signed-out cannot log a game', 'deny', () =>
    setDoc(doc(anon, 'gameHistory', 'h1'), historyResult()));
  await check('alice cannot log a game under mallory’s uid', 'deny', () =>
    setDoc(doc(alice, 'gameHistory', 'h1'), { ...historyResult(), uid: MALLORY }));
  await check('alice logs her own game', 'allow', () =>
    setDoc(doc(alice, 'gameHistory', 'h1'), historyResult()));
  await check('a history row cannot be edited', 'deny', () =>
    updateDoc(doc(alice, 'gameHistory', 'h1'), { score: 9999 }));
  await check('a history row cannot be deleted', 'deny', () =>
    deleteDoc(doc(alice, 'gameHistory', 'h1')));

  console.log('\nleaderboard/{gameType}/scores/{entryId}');
  const entry = (overrides = {}) => ({
    uid: ALICE,
    displayName: 'Alice',
    difficulty: '4x4',
    score: 500,
    moves: 20,
    timeSeconds: 60,
    completedAt: serverTimestamp(),
    ...overrides,
  });
  const row = ALICE + '_4x4';
  await check('mallory cannot write a row named after alice', 'deny', () =>
    setDoc(doc(mallory, 'leaderboard/card-flip/scores', row), entry()));
  await check('the entry id must match uid + difficulty', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', MALLORY + '_4x4'), entry()));
  await check('a score above the board’s ceiling is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ score: 5000 })));
  await check('a non-integer score is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ score: 500.5 })));
  await check('a negative move count is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ moves: -1 })));
  await check('an unknown difficulty is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ difficulty: '10x10' })));
  await check('alice sets her first entry', 'allow', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry()));
  await check('a lower score cannot replace the standing one', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ score: 400 })));
  await check('a rename with the same score is allowed', 'allow', () =>
    updateDoc(doc(alice, 'leaderboard/card-flip/scores', row), { displayName: 'Alice R.' }));
  await check('a same-score write that also changes moves is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ moves: 5 })));

  // Rate limit: a better score lands right after the standing one, before the
  // grace window has passed.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'leaderboard/card-flip/scores', row),
      entry({ completedAt: Timestamp.now() })
    );
  });
  await check('a higher score lands too soon after the last one', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ score: 600 })));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'leaderboard/card-flip/scores', row),
      entry({ completedAt: Timestamp.fromMillis(Date.now() - 10_000) })
    );
  });
  await check('a higher score clears the board once the grace window passes', 'allow', () =>
    setDoc(doc(alice, 'leaderboard/card-flip/scores', row), entry({ score: 600 })));
  await check('a leaderboard row cannot be deleted', 'deny', () =>
    deleteDoc(doc(alice, 'leaderboard/card-flip/scores', row)));

  // The level games — Number Sequence and Pattern Memory — have no board, so a
  // board-sized ceiling refused their better runs outright, and with them the
  // history row and profile counters in the same transaction (ROADMAP 0.7).
  console.log('\nleaderboard — the level games');
  // Number Sequence loses the very first sequence: level 0, nothing scored.
  await check('a first-hand loss scores nothing and is still recorded', 'allow', () =>
    setDoc(doc(alice, 'leaderboard/number-sequence/scores', row), entry({ score: 0, moves: 0 })));

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), 'leaderboard/number-sequence/scores', row),
      entry({ score: 0, moves: 0, completedAt: Timestamp.fromMillis(Date.now() - 10_000) })
    );
  });
  // Fourteen levels of Number Sequence is 5m(m-1) = 910, over the 800 a 4x4
  // board allows — which is the difficulty the game submits for want of one.
  await check('a run past the old board ceiling is kept', 'allow', () =>
    setDoc(doc(alice, 'leaderboard/number-sequence/scores', row), entry({ score: 910, moves: 14 })));
  await check('a level count nobody has played is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/number-sequence/scores', row), entry({ score: 1000, moves: 501 })));

  // Ten cleared levels of Pattern Memory is 7.5n(n+1) = 825, at level 11.
  await check('a Pattern Memory run past the old board ceiling is kept', 'allow', () =>
    setDoc(doc(alice, 'leaderboard/pattern-memory/scores', row), entry({ score: 825, moves: 11 })));
  await check('a score the level reached could not have earned is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/pattern-memory/scores', row), entry({ score: 5000, moves: 11 })));

  await check('a board game keeps its board ceiling', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/word-match/scores', row), entry({ score: 4000, moves: 40 })));
  await check('an invented game collection is refused', 'deny', () =>
    setDoc(doc(alice, 'leaderboard/solitaire/scores', row), entry({ score: 999999, moves: 400 })));

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await testEnv.cleanup();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(e => {
  console.error(e);
  process.exit(1);
});
