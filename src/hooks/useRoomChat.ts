import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage, CHAT_COOLDOWN_MS } from "../firebase/realtime";
import { normalizeChatText, orderMessages } from "../utils/chatUtils";
import type { Room, RoomPlayer } from "../types/multiplayer.types";

/** One line in the panel: something a player said, or something the table
 *  noticed happen (a seat taken, a round dealt). System lines are made up on
 *  each client from what the room does and are never written anywhere. */
export interface ChatEntry {
  id: string;
  kind: "message" | "system";
  uid: string | null;
  displayName: string;
  text: string;
  sentAt: number;
  own: boolean;
  muted: boolean;
}

const rankByScore = (players: Record<string, RoomPlayer>): RoomPlayer[] =>
  Object.values(players ?? {}).sort((a, b) => b.score - a.score || a.uid.localeCompare(b.uid));

/**
 * The latest moment the room itself can vouch for: the newest server stamp
 * on the room, a seat or a message. System lines are dated with this rather
 * than the device clock, so this hook stays pure during render and a line
 * about "now" still sorts after everything already said.
 */
const latestStamp = (room: Room): number => {
  let stamp = room.createdAt ?? 0;
  stamp = Math.max(stamp, room.startedAt ?? 0, room.finishedAt ?? 0);
  for (const p of Object.values(room.players ?? {})) stamp = Math.max(stamp, p.joinedAt ?? 0);
  for (const m of Object.values(room.chat ?? {})) stamp = Math.max(stamp, m.sentAt ?? 0);
  return stamp;
};

/**
 * What changed between two snapshots of the same room, as lines for the
 * panel. Pure: ids come from the stamp and a running position, so the same
 * diff always yields the same lines and two diffs never share an id.
 */
export const noticeChanges = (
  prev: Room,
  next: Room,
  currentUid: string | null,
  sentAt: number,
  startIndex: number
): ChatEntry[] => {
  const texts: string[] = [];
  const before = prev.players ?? {};
  const after = next.players ?? {};

  for (const uid of Object.keys(after)) {
    if (!before[uid] && uid !== currentUid) texts.push(`${after[uid].displayName} sat down.`);
  }
  for (const uid of Object.keys(before)) {
    if (!after[uid] && uid !== currentUid) texts.push(`${before[uid].displayName} left the table.`);
  }

  if (prev.status !== "playing" && next.status === "playing") {
    texts.push(`Round ${next.round} dealt.`);
  }
  if (prev.status === "playing" && next.status === "round-finished") {
    const top = rankByScore(next.players)[0];
    if (top) {
      texts.push(
        top.uid === currentUid
          ? `You took round ${next.round}.`
          : `${top.displayName} took round ${next.round}.`
      );
    }
  }

  return texts.map((text, i) => ({
    id: `sys-${sentAt}-${startIndex + i}`,
    kind: "system" as const,
    uid: null,
    displayName: "",
    text,
    sentAt,
    own: false,
    muted: false,
  }));
};

/**
 * Table talk for one room. Messages ride the room subscription that
 * `useMultiplayer` already holds, so this hook only shapes them: ordered by
 * the server's clock, interleaved with what the table noticed happen, with
 * muted seatmates folded away and a count of what arrived while the panel
 * was closed.
 */
export const useRoomChat = (room: Room | null, currentUid: string | null, isOpen: boolean) => {
  const [mutedUids, setMutedUids] = useState<Set<string>>(() => new Set());
  const [cooling, setCooling] = useState(false);
  const cooldownTimerRef = useRef<number | null>(null);

  const roomId = room?.id ?? null;
  const myPlayer = room && currentUid ? room.players?.[currentUid] ?? null : null;

  /* What the table noticed, kept as state adjusted while rendering — the
     React-sanctioned way to carry something over from the previous render.
     The first snapshot of a room is the baseline: everyone already seated
     when you arrive is not "sitting down". */
  const [seenRoom, setSeenRoom] = useState<Room | null>(null);
  const [systemLines, setSystemLines] = useState<ChatEntry[]>([]);
  if (room !== seenRoom) {
    setSeenRoom(room);
    if (!room || !seenRoom || seenRoom.id !== room.id) {
      setSystemLines([]);
    } else {
      const lines = noticeChanges(seenRoom, room, currentUid, latestStamp(room), systemLines.length);
      if (lines.length > 0) setSystemLines((s) => [...s, ...lines]);
    }
  }

  const messages = useMemo<ChatEntry[]>(
    () =>
      orderMessages(room?.chat).map((m) => ({
        id: m.id,
        kind: "message" as const,
        uid: m.uid,
        displayName: m.displayName,
        text: m.text,
        sentAt: m.sentAt,
        own: m.uid === currentUid,
        muted: mutedUids.has(m.uid),
      })),
    [room?.chat, currentUid, mutedUids]
  );

  const entries = useMemo<ChatEntry[]>(
    () =>
      [...messages, ...systemLines].sort(
        (a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id)
      ),
    [messages, systemLines]
  );

  /* Unread: what other people said while the panel was shut. Whatever was
     already said when the room first loads is history, not news. Same
     adjust-while-rendering pattern as above. */
  const [seen, setSeen] = useState<{ roomId: string | null; count: number }>({
    roomId: null,
    count: 0,
  });
  if (seen.roomId !== roomId) {
    setSeen({ roomId, count: messages.length });
  } else if (isOpen && seen.count !== messages.length) {
    setSeen({ roomId, count: messages.length });
  }

  const unread =
    isOpen || seen.roomId !== roomId
      ? 0
      : messages.slice(seen.count).filter((m) => !m.own && !m.muted).length;

  const toggleMute = useCallback((uid: string) => {
    setMutedUids((s) => {
      const next = new Set(s);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }, []);

  const canSend = Boolean(roomId && currentUid && myPlayer);

  const send = useCallback(
    async (raw: string) => {
      if (!roomId || !currentUid || !myPlayer || cooling) return;
      const text = normalizeChatText(raw);
      if (!text) return;
      setCooling(true);
      if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = window.setTimeout(() => setCooling(false), CHAT_COOLDOWN_MS);
      // The rules pin the name to the seat, so send the seat's, not the profile's.
      await sendChatMessage(roomId, currentUid, myPlayer.displayName, text);
    },
    [roomId, currentUid, myPlayer, cooling]
  );

  useEffect(
    () => () => {
      if (cooldownTimerRef.current) window.clearTimeout(cooldownTimerRef.current);
    },
    []
  );

  return { entries, unread, canSend, cooling, send, mutedUids, toggleMute };
};
