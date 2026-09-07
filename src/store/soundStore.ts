import { create } from 'zustand';

/**
 * Whether the parlour makes any sound, remembered on the device.
 *
 * Hand-rolled rather than zustand's `persist` middleware: it is a single
 * boolean, and every touch of localStorage needs its own try/catch anyway —
 * a private window or blocked site data throws on *access*, not just on read,
 * so a wrapper that only guards the read still takes the page down.
 */

const KEY = 'parlour:sound';

const readMuted = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === 'muted';
  } catch {
    return false; // Sound on by default, and the choice simply won't persist.
  }
};

const writeMuted = (muted: boolean): void => {
  try {
    window.localStorage.setItem(KEY, muted ? 'muted' : 'on');
  } catch {
    /* The setting holds for this tab and no longer. */
  }
};

interface SoundStore {
  muted: boolean;
  toggle: () => void;
}

export const useSoundStore = create<SoundStore>((set) => ({
  muted: readMuted(),
  toggle: () =>
    set((s) => {
      const muted = !s.muted;
      writeMuted(muted);
      return { muted };
    }),
}));
