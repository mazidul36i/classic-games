import { burst, now, tone } from './engine';
import { useSoundStore } from '../store/soundStore';

/**
 * The parlour's vocabulary.
 *
 * Every cue is a short recipe over the two primitives in `engine.ts`, tuned to
 * the letterpress identity the rest of the app wears — paper, brass, felt and
 * wood rather than arcade blips. Nothing here lasts longer than 800ms.
 *
 * `play` is a plain function, not a hook: it reads the mute setting through
 * `getState()` at call time, so it is safe to capture in a `setTimeout` closure
 * or a `useCallback` with a narrow dependency array without ever going stale,
 * and it adds nothing to any dependency array in the first place.
 */

export type Cue =
  | 'flip'
  | 'match'
  | 'miss'
  | 'deal'
  | 'win'
  | 'bust'
  | 'cue'
  | 'wrong'
  | 'life'
  | 'level'
  | 'turn'
  | 'pass'
  | 'clock'
  | 'chat'
  | 'found'
  | 'toggle';

export interface CueOptions {
  /** Which step of the scale, for the sequence games. See `pitchAt`. */
  pitch?: number;
  /** A lighter reading of the same cue — the player's echo of a pip. */
  soft?: boolean;
  /** Seconds to hold the cue back, to keep it out of another one's way. */
  delay?: number;
}

/**
 * A minor pentatonic step. Every interval in the scale is consonant with every
 * other, so a sequence of cells plays back as a phrase however the game shuffles
 * them — the whole reason the pips are pitched at all.
 *
 * Three octaves above the root, which is exactly enough to give Pattern
 * Memory's sixteen cells sixteen distinct pitches (220Hz up to 1760Hz) without
 * anything arriving as a shriek. Capping any lower makes the top band repeat,
 * and two cells that sound alike are worse than a high one.
 */
const STEPS = [0, 3, 5, 7, 10];
const ROOT = 220;
const TOP_OCTAVE = 3;

const pitchAt = (index: number): number => {
  const i = Math.abs(Math.trunc(index));
  const step = STEPS[i % STEPS.length];
  const octave = Math.min(Math.floor(i / STEPS.length), TOP_OCTAVE);
  return ROOT * Math.pow(2, (step + octave * 12) / 12);
};

/**
 * The shortest gap allowed between two firings of the same cue.
 *
 * 40ms is right for the cues a player drives directly — it only ever collapses
 * one event delivered twice. It is badly wrong for the cues that *announce*
 * something, because those are driven by synced room state this module does
 * not control: a reconnect, a disagreement between two clients, or the
 * turn-expiry loop in `useMultiplayer` can flap `currentTurn` many times a
 * second, and at 40ms the bell would machine-gun. A sound layer sits downstream
 * of network state and has to stay civil when that state misbehaves, so an
 * announcement gets one voice per beat and the rest are dropped.
 */
const THROTTLE_MS: Record<Cue, number> = {
  flip: 40,
  cue: 40,
  chat: 40,
  toggle: 40,
  match: 120,
  miss: 120,
  wrong: 120,
  life: 120,
  // A real turn clock ticks once a second; anything faster is the room flapping.
  clock: 600,
  // Announcements. In honest play these are seconds apart at the very least.
  turn: 1200,
  pass: 1200,
  deal: 1200,
  level: 1200,
  win: 1200,
  bust: 1200,
  found: 1200,
};
const lastPlayed = new Map<Cue, number>();

/**
 * A hidden tab stays subscribed to its room, so without this an opponent's
 * every flip would rattle away behind whatever the player actually switched to.
 * `turn` is the deliberate exception: it is the one cue that exists to say
 * *you* have to do something, which is exactly what a buried tab needs to say.
 */
const AUDIBLE_WHEN_HIDDEN: ReadonlySet<Cue> = new Set<Cue>(['turn']);

const recipes: Record<Cue, (at: number, o: CueOptions) => void> = {
  /* A card turned: the snap of stock against stock, with a trace of pitch. */
  flip: (at) => {
    burst({ at, dur: 0.06, freq: 2200, q: 6, gain: 0.16 });
    tone({ at, dur: 0.05, freq: 520, gain: 0.035 });
  },

  /* A pair claimed: two brass notes rising, over a thud into the felt. */
  match: (at) => {
    tone({ at, dur: 0.16, freq: 587.33, gain: 0.12 });
    tone({ at: at + 0.07, dur: 0.22, freq: 880, gain: 0.1 });
    burst({ at, dur: 0.12, freq: 200, q: 1, type: 'lowpass', gain: 0.09 });
  },

  /* The pair turns back: a dull, damped drop. */
  miss: (at) => {
    burst({ at, dur: 0.14, freq: 180, q: 1.2, type: 'lowpass', gain: 0.2 });
    tone({ at, dur: 0.12, freq: 110, type: 'sine', gain: 0.05 });
  },

  /* A hand dealt: three cards off the deck. One cue, not three calls — the
     repeat throttle would eat two of them. */
  deal: (at) => {
    burst({ at, dur: 0.05, freq: 2600, q: 6, gain: 0.13 });
    burst({ at: at + 0.045, dur: 0.05, freq: 2200, q: 6, gain: 0.12 });
    burst({ at: at + 0.09, dur: 0.06, freq: 1900, q: 5, gain: 0.11 });
  },

  /* The hand is yours: the house's little brass fanfare. */
  win: (at) => {
    const notes = [523.25, 659.25, 784, 1046.5];
    notes.forEach((freq, i) => {
      tone({ at: at + i * 0.09, dur: 0.42 - i * 0.04, freq, gain: 0.11 });
    });
    tone({ at, dur: 0.6, freq: 261.63, type: 'sine', gain: 0.05 });
  },

  /* Out of lives, or nobody came: two notes down, damped. */
  bust: (at) => {
    tone({ at, dur: 0.3, freq: 311.13, gain: 0.12 });
    tone({ at: at + 0.16, dur: 0.42, freq: 233.08, gain: 0.1 });
  },

  /* A pip in a sequence — pitched by cell, so a figure plays back as a phrase.
     `soft` is the player's echo of it as they repeat it back. */
  cue: (at, o) => {
    const freq = pitchAt(o.pitch ?? 0);
    const soft = o.soft ?? false;
    tone({
      at,
      dur: soft ? 0.11 : 0.2,
      freq,
      type: 'sine',
      gain: soft ? 0.07 : 0.11,
    });
    if (!soft) burst({ at, dur: 0.03, freq: freq * 3, q: 8, gain: 0.04 });
  },

  /* The wrong cell: a short sour buzz, sliding off pitch. */
  wrong: (at) => {
    tone({ at, dur: 0.17, freq: 165, type: 'sawtooth', gain: 0.075, glideTo: 118 });
  },

  /* A life spent: a knuckle on the table edge. */
  life: (at) => {
    burst({ at, dur: 0.1, freq: 420, q: 3, gain: 0.17 });
    tone({ at, dur: 0.1, freq: 196, gain: 0.055 });
  },

  /* A round cleared: two notes up, bright and quick. */
  level: (at) => {
    tone({ at, dur: 0.14, freq: 659.25, gain: 0.1 });
    tone({ at: at + 0.08, dur: 0.24, freq: 987.77, gain: 0.09 });
  },

  /* Your turn at the table: a small brass bell, left to ring. */
  turn: (at) => {
    tone({ at, dur: 0.6, freq: 1318.51, type: 'sine', gain: 0.085 });
    tone({ at: at + 0.01, dur: 0.45, freq: 1975.53, type: 'sine', gain: 0.04 });
  },

  /* The clock took your turn away: the same bell, falling. */
  pass: (at) => {
    tone({ at, dur: 0.26, freq: 392, gain: 0.08, glideTo: 294 });
  },

  /* The last seconds of your own turn: dry, quiet, insistent. */
  clock: (at) => {
    burst({ at, dur: 0.03, freq: 1500, q: 9, gain: 0.085 });
  },

  /* Someone said something. */
  chat: (at) => {
    tone({ at, dur: 0.09, freq: 880, type: 'sine', gain: 0.055 });
    tone({ at: at + 0.045, dur: 0.08, freq: 1174.66, type: 'sine', gain: 0.03 });
  },

  /* An opponent found: warmer than the turn bell, and a step up. */
  found: (at) => {
    tone({ at, dur: 0.15, freq: 440, gain: 0.1 });
    tone({ at: at + 0.09, dur: 0.28, freq: 660, gain: 0.1 });
  },

  /* Sound switched back on: a tick of the press. */
  toggle: (at) => {
    burst({ at, dur: 0.04, freq: 3000, q: 9, gain: 0.1 });
  },
};

export const play = (cue: Cue, options: CueOptions = {}): void => {
  if (useSoundStore.getState().muted) return;

  if (
    typeof document !== 'undefined' &&
    document.visibilityState !== 'visible' &&
    !AUDIBLE_WHEN_HIDDEN.has(cue)
  ) {
    return;
  }

  const stamp = Date.now();
  const previous = lastPlayed.get(cue);
  if (previous !== undefined && stamp - previous < THROTTLE_MS[cue]) return;
  lastPlayed.set(cue, stamp);

  recipes[cue](now() + (options.delay ?? 0), options);
};
