# Fix log

Short record of what broke, why, and what the fix relies on. Newest first.
Read the entries touching whatever you are about to change. History before the
first entry is in `ROADMAP.md` Phase 0–1.

---

## 2026-09-08 — Refreshing mid-hand locked a player out of their own room

`a5a0c68` · `realtime.ts`, `useMultiplayer.ts`, `database.rules.json`, `flipUtils.ts`
· ROADMAP 0.10, 0.11

**Issue.** Refresh mid-game on a phone, then tapping cards did nothing. Permanent,
not intermittent.

**RCA.** Two bugs. (1) `onDisconnect(players/{uid}).remove()` deleted the seat on
refresh; nothing re-seated you, and `joinRoom` refuses a room that is not `waiting`
("That hand is already under way") — so you came back a spectator with no way in.
(2) A pair was resolved by a `setTimeout` in the tab that flipped it, so losing that
tab left `flippedCards` stuck at two and the old `length >= 2` guard killed every
later tap. Also `flipCard` appended without a duplicate check, so two taps of one
card wrote `[c0, c0]` — a card matches itself: free point, orphaned partner.

**Fix.** Seats carry `connected`; kept and marked away once a hand is in play, still
deleted while `waiting`. `activeOrder` skips absent seats. `flipCard` is a
transaction. Resolution moved onto the room subscription, so the next tab finishes an
abandoned pair. The point rides inside `resolvePair`'s single update. Round reset now
reads the board (`claimedPairs`) instead of watching `round` change — otherwise it
zeroed your score on every refresh.

**Don't undo.** Never delete a seat mid-hand. `seatedOrder` = seats held,
`activeOrder` = who is playing. No `setTimeout` in a click handler settling game
state. Deploy rules before app code — `connected` is a new field.

**Verified.** `npm run test:rules` (54 assertions, incl. the old stuck states and
negative rule cases); two browsers on the emulators, refresh mid-hand and full round.

**Left open.** ROADMAP 0.9 turn ping-pong. Rooms created before this still unseat on
refresh.
