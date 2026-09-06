import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ConfirmDialogProps {
  isOpen: boolean;
  /** Small vermilion line above the heading. */
  tick?: string;
  title: string;
  /** The consequence, spelled out before the player commits. */
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Awaited: the dialog stays up, buttons held, until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * A card laid on the table before anything is torn up: nothing here happens
 * on a single click. Escape and the backdrop both read as "no".
 */
export default function ConfirmDialog({
  isOpen,
  tick,
  title,
  body,
  confirmLabel,
  cancelLabel = "Stay put",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [working, setWorking] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);
  /* Held in a ref so a fresh inline handler from the parent doesn't re-bind
     the key listener on every render. */
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;

  /* Take the focus off the button that opened this, and hand it back when
     the card comes off the table. */
  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setWorking(false);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") cancelFn.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  const confirm = async () => {
    if (working) return;
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="p-overlay"
          onClick={() => !working && onCancel()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            className="p-panel w-full max-w-[24rem] px-7 sm:px-8 pt-8 pb-8 text-center"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.93, opacity: 0, y: 14 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
          >
            {tick && <span className="p-tick text-vermilion">{tick}</span>}
            <h2 className="p-display text-[1.6rem] leading-[1.15] mt-3">{title}</h2>
            {body && (
              <p className="text-[0.95rem] leading-[1.7] text-ink-soft max-w-[34ch] mx-auto mt-4">
                {body}
              </p>
            )}

            <div className="flex flex-col gap-3 mt-8">
              <button
                onClick={confirm}
                disabled={working}
                className="p-btn p-btn-solid p-btn-block"
              >
                {working ? "One moment…" : confirmLabel}
              </button>
              <button
                ref={cancelRef}
                onClick={onCancel}
                disabled={working}
                className="p-btn p-btn-outline p-btn-block"
              >
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
