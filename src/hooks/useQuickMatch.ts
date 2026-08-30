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
import type { RoomPlayer } from "../types/multiplayer.types";
import type { CardTheme, Difficulty, GameType } from "../types/game.types";

export type MatchPhase = "idle" | "searching" | "matched" | "timed-out" | "error";

/** What a running search needs in order to take itself apart again. */
interface Search {
  cancelled: boolean;
  startedAt: number;
  ownRoomId: string | null;
  table: { gameType: GameType; difficulty: Difficulty; theme: CardTheme };
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
  const searchRef = useRef<Search | null>(null);
  const matchedRef = useRef(onMatched);
  useEffect(() => {
    matchedRef.current = onMatched;
  }, [onMatched]);

  /* Take down whatever a search left standing: the room watcher, the table we
     were holding open, and its pointer in the index. Safe to call twice. */
  const teardown = useCallback(async (search: Search, closeOwnRoom: boolean) => {
    search.cancelled = true;
    search.unsubRoom?.();
    search.unsubRoom = null;
    if (closeOwnRoom && search.ownRoomId) {
      const roomId = search.ownRoomId;
      search.ownRoomId = null;
      // Withdraw the standing "delete this on disconnect" first: the room is
      // about to go by hand, and a code could in principle be dealt again.
      const { gameType, difficulty, theme } = search.table;
      await cancelSearchDisconnect(roomId, gameType, difficulty, theme).catch(() => {});
      await closeRoom(roomId, { isPrivate: false, ...search.table }).catch(() => {});
    }
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
    if (search && !search.cancelled) await teardown(search, true);
  }, [teardown]);

  const start = useCallback(
    async (
      player: RoomPlayer,
      gameType: GameType,
      difficulty: Difficulty,
      theme: CardTheme
    ) => {
      const previous = searchRef.current;
      if (previous && !previous.cancelled) await teardown(previous, true);

      const search: Search = {
        cancelled: false,
        startedAt: Date.now(),
        ownRoomId: null,
        table: { gameType, difficulty, theme },
        unsubRoom: null,
      };
      searchRef.current = search;
      setError("");
      setElapsedMs(0);
      setPhase("searching");

      /* Whoever gets there first — the watcher on our own table, or the sweep —
         ends the search; `cancelled` makes the other one a no-op. */
      const settle = (roomId: string) => {
        if (search.cancelled) return;
        search.cancelled = true;
        search.unsubRoom?.();
        search.unsubRoom = null;
        setPhase("matched");
        matchedRef.current(roomId);
      };

      try {
        // 1. Somebody may already be waiting. Sit down before opening anything.
        const waiting = await sweepForOpponent(player, gameType, difficulty, theme, null);
        if (search.cancelled) {
          if (waiting) await leaveRoom(waiting, player.uid).catch(() => {});
          return;
        }
        if (waiting) {
          settle(waiting);
          return;
        }

        // 2. Nobody about. Open a table and tell the index where it is.
        const ownRoomId = await openQuickMatchRoom(player, gameType, difficulty, theme);
        search.ownRoomId = ownRoomId;
        if (search.cancelled) {
          await closeRoom(ownRoomId, { isPrivate: false, gameType, difficulty, theme });
          return;
        }
        await armSearchDisconnect(ownRoomId, gameType, difficulty, theme);

        // 3. Someone sitting down at our table ends the search at once — no
        //    need to wait for the next sweep to notice them.
        search.unsubRoom = subscribeToRoom(ownRoomId, (room) => {
          if (!room || search.cancelled) return;
          if (Object.keys(room.players ?? {}).length < 2) return;
          void disarmSearchDisconnect(ownRoomId, player.uid, gameType, difficulty, theme)
            .catch(() => {})
            .then(() => settle(ownRoomId));
        });

        // 4. Meanwhile keep reading the index. A table that opened in the same
        //    second as ours was invisible to step 1 and shows up here.
        while (!search.cancelled) {
          await sleep(MATCH_POLL_MS);
          if (search.cancelled) return;

          if (Date.now() - search.startedAt >= MATCH_TIMEOUT_MS) {
            await teardown(search, true);
            searchRef.current = null;
            setPhase("timed-out");
            return;
          }

          const other = await sweepForOpponent(
            player,
            gameType,
            difficulty,
            theme,
            search.ownRoomId
          );
          if (search.cancelled) {
            // Our own table filled up while we were sitting down elsewhere.
            if (other) await leaveRoom(other, player.uid).catch(() => {});
            return;
          }
          if (other) {
            await teardown(search, true); // take our empty table down behind us
            search.cancelled = false; // ...but the search itself still succeeded
            settle(other);
            return;
          }

          // A sweep retracts the pointer of any table it could not sit at, and
          // another player's sweep can judge ours wrongly (it may read the room
          // a moment before our own seat lands). Re-assert our pointer.
          if (search.ownRoomId) {
            await publishOpenRoom(
              search.ownRoomId,
              gameType,
              difficulty,
              theme
            ).catch(() => {});
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
      }
    },
    [teardown]
  );

  return {
    phase,
    error,
    elapsedMs,
    searching: phase === "searching",
    start,
    cancel,
    timeoutSeconds: Math.round(MATCH_TIMEOUT_MS / 1000),
  };
};
