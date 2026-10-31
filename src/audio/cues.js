// The instrument's voice, as data. Every sound the Recollector's instrument makes is built from the same few things:
//   * tones: sine or triangle only, pitched on one scale (D minor pentatonic), with a small tape "wow" added at playback;
//   * hiss: band-passed tape noise, the only kind of noise used;
//   * a gesture that says what is happening — a rising pair for starting, a falling pair for stopping, a downward glide
//     for reversing, an octave drop for slowing, a bright open chord for freezing, a bell for singling one thing out.
// The cues are plain data so their consistency (scale, timbre, loudness) can be checked without a speaker.

export const SCALE = { D3: 146.83, F3: 174.61, G3: 196.0, A3: 220.0, C4: 261.63, D4: 293.66, F4: 349.23, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, F5: 698.46, G5: 783.99, A5: 880.0, C6: 1046.5, D6: 1174.66 };
const T = (note, dur, vol, at = 0, to = null, type = 'sine') => ({ k: 'tone', f: SCALE[note], to: to ? SCALE[to] : null, dur, vol, at, type });
const H = (f, dur, vol, at = 0, q = 1.5) => ({ k: 'hiss', f, dur, vol, at, q });

export const CUES = {
  // starting and stopping
  'rec-start': [T('A4', 0.22, 0.15), T('D5', 0.32, 0.15, 0.1), H(3200, 0.06, 0.12)],
  'rec-stop': [T('D5', 0.2, 0.14), T('A4', 0.34, 0.14, 0.1), H(2400, 0.05, 0.1, 0.1)],
  play: [T('D4', 0.55, 0.15, 0, 'A4'), H(1200, 0.35, 0.1)],
  stop: [T('A4', 0.38, 0.14, 0, 'D4'), H(900, 0.25, 0.08)],
  select: [T('A5', 0.05, 0.05), H(3000, 0.03, 0.1)],
  pin: [T('G4', 0.1, 0.12), T('D5', 0.14, 0.12, 0.06)],
  tape: [H(1800, 0.25, 0.14), T('D4', 0.42, 0.12)],
  rewind: [T('A5', 0.62, 0.13, 0, 'D4'), H(2500, 0.5, 0.12)],
  end: [T('A4', 0.4, 0.1, 0, null, 'triangle')],
  // the verbs of time
  reverse: [T('A4', 0.55, 0.14, 0, 'D3'), H(3200, 0.5, 0.12, 0, 0.8), T('D3', 0.25, 0.1, 0.45)],
  forward: [T('D3', 0.4, 0.12, 0, 'A4'), H(900, 0.3, 0.08)],
  slow: [T('D4', 0.95, 0.14, 0, 'D3'), T('D3', 0.95, 0.08, 0, null, 'triangle'), H(700, 0.8, 0.07)],
  fast: [T('D4', 0.36, 0.11, 0, 'D5'), H(4200, 0.25, 0.1)],
  loop: [T('D5', 0.07, 0.12), T('D5', 0.07, 0.1, 0.09), T('A5', 0.2, 0.12, 0.18)],
  freeze: [H(6500, 0.5, 0.12, 0, 6), T('D5', 1.6, 0.07), T('A5', 1.9, 0.06), T('D6', 2.2, 0.05)],
  thaw: [T('A5', 0.32, 0.1, 0, 'A4'), H(1200, 0.25, 0.08)],
  // editing a memory
  omit: [T('G4', 0.2, 0.15, 0, 'G3', 'triangle'), H(320, 0.22, 0.22, 0, 0.8)],
  unomit: [T('G3', 0.2, 0.13, 0, 'G4', 'triangle')],
  solo: [T('A5', 1.4, 0.1), T('D6', 1.1, 0.07, 0.02), H(5000, 0.08, 0.1, 0, 4)],
  // looking around inside a recording
  preview: [T('D5', 0.05, 0.07)],
  marker: [T('A5', 0.09, 0.09), T('D6', 0.11, 0.06, 0.03)],
  scrub: (pos = 0.5) => [H(900 + Math.max(0, Math.min(1, pos)) * 3200, 0.035, 0.11, 0, 1.4)],
};
export const cueFor = (name, arg) => { const c = CUES[name]; return typeof c === 'function' ? c(arg) : c ?? null; };

/** White tape hiss at nominal level; the band-pass takes most of its energy away, so cue levels are calibrated by measurement (see LEVEL). */
export const HISS_GAIN = 1;
/** Per-cue level calibration, measured by rendering each cue offline through the real tape bus (e2e/audio.mjs) so that the loudest moment of every tonal cue lands within a few dB of the others. */
export const LEVEL = {"rec-start":0.7,"rec-stop":0.77,"play":0.86,"stop":1.27,"select":2.4,"pin":1.5,"tape":1.23,"rewind":0.92,"end":2.37,"reverse":0.92,"forward":1.17,"slow":0.56,"fast":1.5,"loop":1,"freeze":0.52,"thaw":1.95,"omit":2.19,"unomit":2.34,"solo":0.54,"preview":1.71,"marker":1.07,"scrub":3.16};
