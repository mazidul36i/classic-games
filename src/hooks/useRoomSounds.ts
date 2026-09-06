import { useEffect, useRef } from "react";
import { play } from "../audio/cues";
import type { Room, RoomPlayer } from "../types/multiplayer.types";

/**
 * What the table sounds like.
 *
 * Nothing in a multiplayer room is driven by a click handler — every card on
 * screen is rendered from the room snapshot, and the player who flipped it
 * learns it turned the same way everyone else does. So the cues are read off
 * *transitions between snapshots*, which is also what keeps them honest: the
 * actor and their opponents hear the same thing at the same moment, and there
 * is no second, optimistic path that could double-fire.
 *
 * This borrows the baseline rule from `useRoomChat` — the first snapshot of a
 * room is history, not news, so arriving mid-hand is silent — but deliberately
 * not its mechanism. That hook adjusts state during render, which React may
 * discard and re-run; playing a sound is a side effect and has to sit in an
 * effect. Under StrictMode's doubled effects this is self-correcting: the
 * second pass diffs the snapshot against itself and finds nothing.
 */

const rankByScore = (players: Record<string, RoomPlayer>): RoomPlayer[] =>
  Object.values(players ?? {}).sort(
    (a, b) => b.score - a.score || a.uid.localeCompare(b.uid)
  );

export const useRoomSounds = (room: Room | null, currentUid: string | null): void => {
  const seenRef = useRef<Room | null>(null);

  useEffect(() => {
    const previous = seenRef.current;
    seenRef.current = room;

    if (!room) return;
    // Baseline: the first sight of a room, or of a different one.
    if (!previous || previous.id !== room.id) return;

    const before = previous.gameState;
    const after = room.gameState;

    // A hand going down — the first of the session, or the next round.
    if (previous.status !== "playing" && room.status === "playing") play("deal");

    /* `flippedCards` is absent entirely on a freshly dealt gameState and is
       cleared to null by `passTurn`, so these have to be read as counts and
       compared as a strict growth. Anything looser fires a card snap at the
       start of every round. */
    const wasFlipped = before?.flippedCards?.length ?? 0;
    const nowFlipped = after?.flippedCards?.length ?? 0;
    if (before && after && nowFlipped > wasFlipped) play("flip");

    if (before && after) {
      if (after.matchedPairs > before.matchedPairs) {
        play("match");
      } else if (wasFlipped === 2 && nowFlipped === 0) {
        /* Two cards down and nothing claimed. Deliberately not `< 2`: one card
           down and then cleared is `passTurn` running the clock out, which is
           a different event and gets its own cue below. */
        play("miss");
      }
    }

    const beforeTurn = before?.currentTurn ?? null;
    const afterTurn = after?.currentTurn ?? null;
    if (beforeTurn !== afterTurn) {
      if (afterTurn === currentUid) {
        play("turn");
      } else if (
        beforeTurn === currentUid &&
        // A new round moves the turn on too, and that is not a turn being
        // taken from anyone — `startNextRound` bumps `round` in the same write.
        previous.round === room.round &&
        wasFlipped < 2
      ) {
        play("pass");
      }
    }

    if (previous.status === "playing" && room.status === "round-finished") {
      // Held back so it lands after the final match has rung out.
      play(rankByScore(room.players)[0]?.uid === currentUid ? "win" : "bust", {
        delay: 0.32,
      });
    }
  }, [room, currentUid]);
};
