import { useCallback, useEffect, useRef, useState } from "react";
import {
  openQuickMatchRoom,
  publishOpenRoom,
  sweepForOpponent,
  subscribeToRoom,
  armSearchDisconnect,
  disarmSearchDisconnect,
  cancelSearchDisconnect,
  closeRoom,
  leaveRoom,
  MATCH_TIMEOUT_MS,
  MATCH_POLL_MS,
} from "../firebase/realtime";
import type { TableKey } from "../firebase/realtime";
import type { RoomPlayer } from "../types/multiplayer.types";
import { play } from "../audio/cues";

export type MatchPhase = "idle" | "searching" | "matched" | "timed-out" | "error";

/** What a running search needs in order to take itself apart again. */
interface Search {
  cancelled: boolean;
  startedAt: number;
  uid: string;
  /** The table we are holding open, if we opened one rather than joined one. */
  ownRoomId: string | null;
  /** Wherever we are actually sitting — ours or someone else's. */
  seatedIn: string | null;
  table: TableKey;
  unsubRoom: (() => void) | null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * "Find an opponent", as a search rather than a single lookup.
 *
 * The old version read the index once and, finding nothing, opened a table and
 * walked straight into it — so two players pressing the button together each
 * read the same empty index and each sat down alone at a different table. This
 * one keeps looking for the whole two minutes: it opens a table so it can be
 * found, watches that table for anyone sitting down, and goes on re-reading the
 * index so a table opened in the same second as ours still gets matched a poll
 * later. Which of the two moves is settled by room code (see
 * `sweepForOpponent`), so they converge instead of trading places.
 */
export const useQuickMatch = (onMatched: (roomId: string) => void) => {
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState("");
  /* How many are sitting at the table we are holding. Drawn in the search
     panel, and read by the poll loop — which runs outside React and so needs
     the ref rather than the state. */
  const [seated, setSeatedState] = useState(0);
  const seatedRef = useRef(0);
  const setSeated = useCallback((count: number) => {
    seatedRef.current = count;
    setSeatedState(count);
  }, []);
  const searchRef = useRef<Search | null>(null);
  const matchedRef = useRef(onMatched);
  useEffect(() => {
    matchedRef.current = onMatched;
  }, [onMatched]);

  /* Take down whatever a search left standing: the room watcher, the seat we
     were holding, and — if we were the only one at it — the table itself.
     Safe to call twice.

     We stand up rather than close the room outright, because a table waiting on
     its third player already has a second one sitting at it, and taking the
     room away would take their game with it. `leaveRoom` closes the room behind
     the last player to stand up, which is the case this used to handle. */
  const teardown = useCallback(async (search: Search, giveUpSeat: boolean) => {
    search.cancelled = true;
    search.unsubRoom?.();
    search.unsubRoom = null;
    if (!giveUpSeat) return;

    const roomId = search.seatedIn;
    const ownRoomId = search.ownRoomId;
    search.seatedIn = null;
    search.ownRoomId = null;
    if (!roomId) return;

    // Withdraw the standing "delete this on disconnect" first: the seat is
    // about to go by hand, and the room may well outlive us now.
    if (ownRoomId) {
      await cancelSearchDisconnect(ownRoomId, search.table).catch(() => {});
    }
    await leaveRoom(roomId, search.uid).catch(() => {});
  }, []);

  /* A tab closing mid-search is covered by `armSearchDisconnect` on the server
     side; this covers the milder case of navigating away inside the app. */
  useEffect(
    () => () => {
      const search = searchRef.current;
      if (search && !search.cancelled) void teardown(search, true);
    },
    [teardown]
  );

  // Only tick while there is a clock to draw.
  useEffect(() => {
    if (phase !== "searching") return;
    const id = window.setInterval(() => {
      const search = searchRef.current;
      if (search) setElapsedMs(Date.now() - search.startedAt);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  const cancel = useCallback(async () => {
    const search = searchRef.current;
    searchRef.current = null;
    setPhase("idle");
    setElapsedMs(0);
    setSeated(0);
    if (search && !search.cancelled) await teardown(search, true);
  }, [teardown, setSeated]);

  const start = useCallback(
    async (player: RoomPlayer, table: TableKey) => {
      const previous = searchRef.current;
      if (previous && !previous.cancelled) await teardown(previous, true);

      const search: Search = {
        cancelled: false,
        startedAt: Date.now(),
        uid: player.uid,
        ownRoomId: null,
        seatedIn: null,
        table,
        unsubRoom: null,
      };
      searchRef.current = search;
      setError("");
      setElapsedMs(0);
      setSeated(0);
      setPhase("searching");

      /* Whoever gets there first — the watcher on our own table, or the sweep —
         ends the search; `cancelled` makes the other one a no-op. */
      const settle = (roomId: string) => {
        if (search.cancelled) return;
        search.cancelled = true;
        search.unsubRoom?.();
        search.unsubRoom = null;
        setPhase("matched");
        play("found");
        matchedRef.current(roomId);
      };

      /* Watch the table we are sitting at until it is full.
         Two thresholds, not one: the search ends when every seat is taken, but
         the standing "remove this room if my tab dies" has to go the moment a
         *second* player sits down — past that the table is somebody else's game
         too, and it should outlive us. */
      const watch = (roomId: string, ourTable: boolean) =>
        subscribeToRoom(roomId, (room) => {
          if (!room || search.cancelled) return;
          const count = Object.keys(room.players ?? {}).length;
          setSeated(count);
          if (ourTable && count >= 2 && search.ownRoomId) {
            search.ownRoomId = null;
            void disarmSearchDisconnect(roomId, player.uid, table).catch(() => {});
          }
          if (count >= table.seats) settle(roomId);
        });

      try {
        // 1. Somebody may already be waiting. Sit down before opening anything.
        const waiting = await sweepForOpponent(player, table, null);
        if (search.cancelled) {
          if (waiting) await leaveRoom(waiting, player.uid).catch(() => {});
          return;
        }
        if (waiting) {
          // Their table, now partly ours. Nothing left to sweep for — we have a
          // seat — so just wait for the rest of the table to arrive.
          search.seatedIn = waiting;
          search.unsubRoom = watch(waiting, false);
          return;
        }

        // 2. Nobody about. Open a table and tell the index where it is.
        const ownRoomId = await openQuickMatchRoom(player, table);
        search.ownRoomId = ownRoomId;
        search.seatedIn = ownRoomId;
        if (search.cancelled) {
          await closeRoom(ownRoomId, { isPrivate: false, maxPlayers: table.seats, ...table });
          return;
        }
        await armSearchDisconnect(ownRoomId, table);

        // 3. Watch our own table fill.
        search.unsubRoom = watch(ownRoomId, true);

        // 4. Meanwhile keep reading the index. A table that opened in the same
        //    second as ours was invisible to step 1 and shows up here.
        while (!search.cancelled) {
          await sleep(MATCH_POLL_MS);
          if (search.cancelled) return;

          /* The clock only runs while we are sitting alone. Once somebody has
             joined, the table is really forming and giving up on it would strand
             them; the player can still stop the search by hand. */
          const alone = seatedRef.current <= 1;
          if (alone && Date.now() - search.startedAt >= MATCH_TIMEOUT_MS) {
            await teardown(search, true);
            searchRef.current = null;
            setPhase("timed-out");
            play("bust");
            return;
          }
          if (!alone) continue; // ours is filling — do not go and sit elsewhere

          const other = await sweepForOpponent(player, table, search.ownRoomId);
          if (search.cancelled) {
            // Our own table filled up while we were sitting down elsewhere.
            if (other) await leaveRoom(other, player.uid).catch(() => {});
            return;
          }
          if (other) {
            await teardown(search, true); // take our empty table down behind us
            search.cancelled = false; // ...but the search itself still runs
            search.seatedIn = other;
            search.unsubRoom = watch(other, false);
            return;
          }

          // A sweep retracts the pointer of any table it could not sit at, and
          // another player's sweep can judge ours wrongly (it may read the room
          // a moment before our own seat lands). Re-assert our pointer.
          if (search.seatedIn) {
            await publishOpenRoom(search.seatedIn, table).catch(() => {});
          }
        }
      } catch (err) {
        console.error("[quick-match] search failed", err);
        await teardown(search, true);
        searchRef.current = null;
        setError(
          err instanceof Error && err.message.includes("PERMISSION_DENIED")
            ? "The table refused that write — the database rules may be out of date."
            : "Something went wrong looking for an opponent."
        );
        setPhase("error");
        play("wrong");
      }
    },
    [teardown, setSeated]
  );

  return {
    phase,
    error,
    elapsedMs,
    /** Players sitting at the table we are holding, us included. */
    seated,
    searching: phase === "searching",
    start,
    cancel,
    timeoutSeconds: Math.round(MATCH_TIMEOUT_MS / 1000),
  };
};
