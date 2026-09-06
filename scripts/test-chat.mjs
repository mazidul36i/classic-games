/**
 * The pure half of table talk: what the composer lets through, and the order
 * the panel draws messages in.
 *
 *   npm run test:chat
 *
 * Run under Node's type stripping — no build step, no test runner.
 */
import { normalizeChatText, orderMessages, CHAT_MAX_LENGTH } from '../src/utils/chatUtils.ts';

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

console.log('\ntable talk — what gets said\n');

eq('plain text passes through', normalizeChatText('Good luck!'), 'Good luck!');
eq('surrounding whitespace is trimmed', normalizeChatText('  hello  '), 'hello');
eq('runs of whitespace collapse to one space', normalizeChatText('so\n\nmany   words'), 'so many words');
eq('an empty line is nothing to send', normalizeChatText(''), null);
eq('only whitespace is nothing to send', normalizeChatText(' \n\t '), null);
eq('a long line is clipped to the house limit', normalizeChatText('x'.repeat(500))?.length, CHAT_MAX_LENGTH);
eq('a line at the limit is left alone', normalizeChatText('y'.repeat(CHAT_MAX_LENGTH))?.length, CHAT_MAX_LENGTH);
eq('the limit is the one the rules enforce', CHAT_MAX_LENGTH, 200);

console.log('\ntable talk — in what order\n');

const m = (uid, text, sentAt) => ({ uid, displayName: uid, text, sentAt });

eq('nothing said is an empty list', orderMessages(undefined), []);
eq('nothing said (null node) is an empty list', orderMessages(null), []);
eq(
  'messages sort by the server clock, not key order',
  orderMessages({ b: m('u1', 'second', 200), a: m('u2', 'first', 100) }).map(x => x.text),
  ['first', 'second']
);
eq(
  'a tie on the clock is broken by key so every client agrees',
  orderMessages({ zz: m('u1', 'later key', 100), aa: m('u2', 'earlier key', 100) }).map(x => x.id),
  ['aa', 'zz']
);
eq(
  'the push key rides along as the id',
  orderMessages({ k1: m('u1', 'hi', 1) }),
  [{ id: 'k1', uid: 'u1', displayName: 'u1', text: 'hi', sentAt: 1 }]
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
