/**
 * The house instrument.
 *
 * Every cue in the parlour is synthesised here rather than loaded from a file:
 * nothing to ship, nothing to licence, works offline, and a cue can be retuned
 * by editing a number instead of re-recording it. Two primitives do all the
 * work — a filtered noise `burst` (paper, felt, wood) and an oscillator `tone`
 * (brass, bells) — and `cues.ts` writes the recipes on top of them.
 *
 * Nothing here runs at import time. No AudioContext exists until something
 * actually asks to make a sound, or until `installUnlock` catches the first
 * gesture.
 */

/** Gain never reaches zero: exponential ramps are undefined at 0 and a ramp
 *  that starts or ends there lands as a step, which is an audible click. */
const SILENT = 0.0001;

/** Above this many voices still sounding, new ones are dropped. Guards against
 *  a runaway effect rather than against a fast player. */
const MAX_VOICES = 12;

interface Instrument {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

/* Held on globalThis, not in a module `let`. Vite invalidates this module's
   importers on every HMR edit, and a module-local would then leak a fresh
   AudioContext per save until the browser's per-document limit is hit and all
   audio dies — a confusing way to lose an afternoon. */
interface AudioGlobals {
  __parlourInstrument?: Instrument | null;
}
const globals = globalThis as unknown as AudioGlobals;

/**
 * When each voice still in flight finishes, as a wall clock stamp.
 *
 * Deliberately not context time and deliberately not an `onended` tally. An
 * AudioContext's clock *stops* while it is suspended — before the first
 * gesture, or in a backgrounded tab — and `onended` never fires for a voice
 * scheduled into a stopped context. Either of those measures would fill this
 * budget, never drain it, and silence the app permanently. The wall clock runs
 * whatever the context is doing.
 */
let sounding: number[] = [];

const buildNoise = (ctx: AudioContext): AudioBuffer => {
  // Built at the context's own rate: a fixed 44100 buffer on a 48k device gets
  // resampled, which lengthens every snap and drops its pitch.
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
  return buffer;
};

/** The instrument, built on first use. Returns null where Web Audio is absent. */
const instrument = (): Instrument | null => {
  if (globals.__parlourInstrument !== undefined) {
    const existing = globals.__parlourInstrument;
    if (existing) void resume(existing.ctx);
    return existing;
  }

  const Ctor =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!Ctor) {
    globals.__parlourInstrument = null;
    return null;
  }

  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const built: Instrument = { ctx, master, noise: buildNoise(ctx) };
  globals.__parlourInstrument = built;
  void resume(ctx);
  return built;
};

const resume = async (ctx: AudioContext): Promise<void> => {
  if (ctx.state === "running") return;
  try {
    await ctx.resume();
  } catch {
    /* Not unlocked yet. The next gesture will get it. */
  }
};

/**
 * Let a gesture wake the context.
 *
 * Most cues follow a click and could resume the context themselves, but the
 * multiplayer bell fires when an *opponent* acts — there may be no gesture of
 * this player's own to ride. The listeners stay attached rather than firing
 * once: iOS re-suspends the context after a call or Siri, and a spent one-shot
 * listener would leave the tab silent for good.
 */
export const installUnlock = (): (() => void) => {
  if (typeof window === "undefined") return () => {};

  const wake = () => {
    const built = instrument();
    if (built) void resume(built.ctx);
  };

  window.addEventListener("pointerdown", wake, { capture: true, passive: true });
  window.addEventListener("keydown", wake, { capture: true, passive: true });

  return () => {
    window.removeEventListener("pointerdown", wake, { capture: true });
    window.removeEventListener("keydown", wake, { capture: true });
  };
};

/** Claim a slot in the voice budget for a sound of `dur` seconds starting at
 *  `start` in context time. */
const claim = (ctx: AudioContext, start: number, dur: number): boolean => {
  const now = Date.now();
  sounding = sounding.filter((t) => t > now);
  if (sounding.length >= MAX_VOICES) return false;
  const waitsFor = Math.max(0, start - ctx.currentTime);
  sounding.push(now + (waitsFor + dur) * 1000);
  return true;
};

/** Where a cue starts. Cues schedule their own parts against this. */
export const now = (): number => instrument()?.ctx.currentTime ?? 0;

const envelope = (node: GainNode, start: number, peak: number, attack: number, dur: number) => {
  const g = node.gain;
  g.setValueAtTime(SILENT, start);
  g.exponentialRampToValueAtTime(Math.max(peak, SILENT), start + attack);
  g.exponentialRampToValueAtTime(SILENT, start + dur);
};

export interface BurstSpec {
  /** Context time to start at. Defaults to immediately. */
  at?: number;
  dur: number;
  freq: number;
  q?: number;
  type?: BiquadFilterType;
  gain?: number;
  attack?: number;
}

/** Filtered noise: the card snapping, the chip landing, the knuckle on wood. */
export const burst = (spec: BurstSpec): void => {
  const built = instrument();
  if (!built) return;
  const { ctx, master, noise } = built;

  const start = spec.at ?? ctx.currentTime;
  const dur = spec.dur;
  if (!claim(ctx, start, dur)) return;

  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = spec.type ?? "bandpass";
  filter.frequency.value = spec.freq;
  filter.Q.value = spec.q ?? 4;

  const gain = ctx.createGain();
  envelope(gain, start, spec.gain ?? 0.15, spec.attack ?? 0.004, dur);

  source.connect(filter).connect(gain).connect(master);
  source.start(start);
  source.stop(start + dur);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
};

export interface ToneSpec {
  at?: number;
  dur: number;
  freq: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** Slide to this frequency across the note — a turn slipping away, a buzz. */
  glideTo?: number;
}

/** A pitched note: the brass, the bells, the pips of a sequence. */
export const tone = (spec: ToneSpec): void => {
  const built = instrument();
  if (!built) return;
  const { ctx, master } = built;

  const start = spec.at ?? ctx.currentTime;
  const dur = spec.dur;
  if (!claim(ctx, start, dur)) return;

  const osc = ctx.createOscillator();
  osc.type = spec.type ?? "triangle";
  osc.frequency.setValueAtTime(spec.freq, start);
  if (spec.glideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(spec.glideTo, 1), start + dur);
  }

  const gain = ctx.createGain();
  envelope(gain, start, spec.gain ?? 0.1, spec.attack ?? 0.006, dur);

  osc.connect(gain).connect(master);
  osc.start(start);
  osc.stop(start + dur);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
};
