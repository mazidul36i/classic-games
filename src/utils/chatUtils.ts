import type { ChatMessage } from '../types/multiplayer.types';

/** Mirrors CHAT_MAX_LENGTH in src/firebase/realtime.ts and the rules. Kept
 *  here as well so this module stays free of Firebase imports and can be run
 *  under plain Node by scripts/test-chat.mjs. */
export const CHAT_MAX_LENGTH = 200;

/** One-tap lines for when there is a turn clock running and no time to type. */
export const QUICK_PHRASES: readonly string[] = [
  'Good luck!',
  'Nice one',
  'Well played',
  'Your turn',
  'Hurry up!',
  'GG',
  '👏',
  '😅',
  '🔥',
];

/** A message with its push key attached, ready to render. */
export interface ChatLine extends ChatMessage {
  id: string;
}

/**
 * Tidy what someone typed into what the table will accept: trimmed, runs of
 * whitespace (including newlines) collapsed to one space, and clipped to the
 * house limit. Returns null when nothing is left worth sending.
 */
export const normalizeChatText = (raw: string): string | null => {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > CHAT_MAX_LENGTH ? text.slice(0, CHAT_MAX_LENGTH) : text;
};

/**
 * The chat node as it comes off the wire, in the order it was said. Push keys
 * are roughly chronological but stamped by the sender's clock; `sentAt` is the
 * server's, so it wins, with the key breaking ties so every client agrees.
 */
export const orderMessages = (
  chat: Record<string, ChatMessage> | null | undefined
): ChatLine[] =>
  Object.entries(chat ?? {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0) || a.id.localeCompare(b.id));
