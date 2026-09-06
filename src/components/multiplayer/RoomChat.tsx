import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowDown, Send, Volume2, VolumeX, X } from "lucide-react";
import { QUICK_PHRASES, CHAT_MAX_LENGTH } from "../../utils/chatUtils";
import type { ChatEntry } from "../../hooks/useRoomChat";

interface RoomChatProps {
  entries: ChatEntry[];
  canSend: boolean;
  cooling: boolean;
  mutedUids: Set<string>;
  onSend: (text: string) => void;
  onToggleMute: (uid: string) => void;
  /** Present when the panel is a sheet that can be dismissed. */
  onClose?: () => void;
  className?: string;
}

/** Two lines from the same seat inside this window share one name plate. */
const GROUP_WINDOW_MS = 2 * 60 * 1000;

const formatClock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * The talk at the table. Layout-agnostic: the room page decides whether this
 * is a sticky column beside the board or a sheet drawn up from the bottom.
 */
export default function RoomChat({
  entries,
  canSend,
  cooling,
  mutedUids,
  onSend,
  onToggleMute,
  onClose,
  className = "",
}: RoomChatProps) {
  const [draft, setDraft] = useState("");
  const [atBottom, setAtBottom] = useState(true);
  const [seenCount, setSeenCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastEntry = entries[entries.length - 1];

  /* Follow the conversation while the reader is at the bottom; otherwise
     leave their scroll alone and offer a way down. Your own words always
     bring you down with them. The scroll event this raises is what marks
     the new lines as seen. */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (atBottom || lastEntry?.own) el.scrollTop = el.scrollHeight;
  }, [entries.length, atBottom, lastEntry]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const bottom = gap < 24;
    setAtBottom(bottom);
    if (bottom) setSeenCount(entries.length);
  };

  const scrollDown = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
    setSeenCount(entries.length);
  };

  const belowFold = !atBottom && entries.length > seenCount;

  const submit = (text: string) => {
    if (!canSend || cooling) return;
    onSend(text);
    setDraft("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <section className={`p-chat ${className}`} aria-label="Table talk">
      <header className="p-chat-head">
        <span className="p-tick text-vermilion">Table talk</span>
        {onClose && (
          <button onClick={onClose} className="p-icon-btn p-chat-close" aria-label="Close the chat">
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </header>

      <div className="p-chat-scroll">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="p-chat-list"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {entries.length === 0 && (
            <p className="p-chat-empty">
              Nobody has said anything yet. A word of luck goes a long way.
            </p>
          )}

          {entries.map((entry, i) => {
            if (entry.kind === "system") {
              return (
                <p key={entry.id} className="p-chat-sys">
                  {entry.text}
                </p>
              );
            }

            const prev = entries[i - 1];
            const grouped =
              prev?.kind === "message" &&
              prev.uid === entry.uid &&
              prev.muted === entry.muted &&
              entry.sentAt - prev.sentAt < GROUP_WINDOW_MS;

            if (entry.muted) {
              if (grouped) return null;
              return (
                <div key={entry.id} className="p-chat-muted">
                  <span>{entry.displayName} is muted.</span>
                  <button
                    onClick={() => entry.uid && onToggleMute(entry.uid)}
                    className="p-chat-mute"
                    aria-label={`Unmute ${entry.displayName}`}
                  >
                    <Volume2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                    <span>Unmute</span>
                  </button>
                </div>
              );
            }

            return (
              <div
                key={entry.id}
                className={`p-chat-msg ${entry.own ? "p-chat-msg-own" : ""} ${grouped ? "p-chat-msg-grouped" : ""}`}
              >
                {!grouped && (
                  <div className="p-chat-meta">
                    <span className="p-engrave text-ink-deep">
                      {entry.own ? "You" : entry.displayName}
                    </span>
                    <span className="p-tick text-ink-soft">{formatClock(entry.sentAt)}</span>
                    {!entry.own && entry.uid && (
                      <button
                        onClick={() => onToggleMute(entry.uid!)}
                        className="p-chat-mute"
                        aria-label={`Mute ${entry.displayName}`}
                        title="Mute"
                      >
                        <VolumeX className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                )}
                <p className="p-chat-bubble">{entry.text}</p>
              </div>
            );
          })}
        </div>

        {belowFold && (
          <button onClick={scrollDown} className="p-chat-nub">
            <ArrowDown className="w-3.5 h-3.5" strokeWidth={1.75} />
            New talk below
          </button>
        )}
      </div>

      {canSend ? (
        <div className="p-chat-foot">
          <div className="p-chat-chips" aria-label="Quick phrases">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => submit(phrase)}
                disabled={cooling}
                className="p-chat-chip"
              >
                {phrase}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="p-chat-compose">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              maxLength={CHAT_MAX_LENGTH}
              placeholder="Say something…"
              aria-label="Your message"
              className="p-input"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button
              type="submit"
              disabled={cooling || !draft.trim()}
              className="p-icon-btn"
              aria-label="Send"
            >
              <Send className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </form>
        </div>
      ) : (
        <p className="p-chat-foot p-chat-empty">Only players at the table may speak.</p>
      )}

      {mutedUids.size > 0 && (
        <p className="p-chat-note">
          {mutedUids.size === 1 ? "One seat is muted" : `${mutedUids.size} seats are muted`} on this
          device only.
        </p>
      )}
    </section>
  );
}
