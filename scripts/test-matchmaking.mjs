/**
 * The quick-match convergence rule, on its own.
 *
 *   npm run test:match
 *
 * `pickOpponentRooms` is the whole answer to "two devices pressed the button
 * together and ended up at two different tables". Everything around it is I/O;
 * this is the part that has to be right, so it is the part that gets pinned
 * down here. Run under Node's type stripping — no build step, no test runner.
 */
import { pickOpponentRooms } from '../src/utils/matchUtils.ts';

let pass = 0;
let fail = 0;

const eq = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label} — expected ${b}, got ${a}`);
  }
};

console.log('\nquick match — which table to walk to\n');

eq('holding no table, any open one will do', pickOpponentRooms(['MMM222'], null), ['MMM222']);

eq('nothing open is nothing to join', pickOpponentRooms([], null), []);

eq('our own table is never a candidate', pickOpponentRooms(['AAA111'], 'AAA111'), []);

eq(
  'a table that opened after ours is left where it is',
  pickOpponentRooms(['ZZZ999'], 'AAA111'),
  []
);

eq(
  'a table that opened before ours is the one we move to',
  pickOpponentRooms(['AAA111'], 'ZZZ999'),
  ['AAA111']
);

eq(
  'candidates come back in a stable order, lowest code first',
  pickOpponentRooms(['CCC333', 'AAA111', 'BBB222'], 'ZZZ999'),
  ['AAA111', 'BBB222', 'CCC333']
);

/* The property the whole design rests on: of any two players holding tables and
   looking at each other, exactly one moves. If both moved they would swap
   tables forever; if neither moved they would both time out alone. */
console.log('\nconvergence — exactly one of any two players moves\n');

const codes = ['AAA111', 'B2C3D4', 'MMM222', 'QQ0011', 'ZZZ999', '000000', 'ZZ9ZZ9'];
let asymmetric = true;
for (const a of codes) {
  for (const b of codes) {
    if (a === b) continue;
    // Each sees the other's table in the index alongside their own.
    const aMoves = pickOpponentRooms([a, b], a).includes(b);
    const bMoves = pickOpponentRooms([a, b], b).includes(a);
    if (aMoves === bMoves) {
      asymmetric = false;
      console.log(`  FAIL  ${a} vs ${b} — aMoves=${aMoves}, bMoves=${bMoves}`);
    }
  }
}
eq(`over all ${codes.length * (codes.length - 1)} ordered pairs`, asymmetric, true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
