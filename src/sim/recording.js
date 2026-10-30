// Temporal state storage. A Track is the full history of one entity's state vector inside a
// recorded volume, stored as change-compressed keyframes (a keyframe is written only on ticks where
// at least one channel — or the "inside the volume" flag — differs from the previous keyframe).
// Because the simulation is fixed-step, sample-and-hold lookup reproduces the recorded state exactly.

import { typeOf } from './types.js';

export const PLAYBACK_MODES = ['once', 'loop', 'pingpong', 'hold'];

export class Track {
  /** @param {string} id @param {object} def entity template needed to reconstruct a ghost-only entity */
  constructor(id, def) {
    this.id = id;
    this.def = def;
    this.nch = typeOf(def).ch.length;
    this.stride = this.nch + 1; // [inside, ...channels]
    this.ticks = [];
    this.vals = [];
    this.frozen = false;
  }
  push(tick, inside, st) {
    const n = this.ticks.length, s = this.stride;
    if (n) {
      const o = (n - 1) * s;
      let same = this.vals[o] === (inside ? 1 : 0);
      for (let i = 0; same && i < this.nch; i++) if (this.vals[o + 1 + i] !== Math.fround(st[i])) same = false;
      if (same) return false;
    }
    this.ticks.push(tick);
    this.vals.push(inside ? 1 : 0);
    for (let i = 0; i < this.nch; i++) this.vals.push(Math.fround(st[i]));
    return true;
  }
  /** index of the last keyframe with tick <= tau, or -1 */
  find(tau) {
    const t = this.ticks;
    let lo = 0, hi = t.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (t[m] <= tau) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  /** Writes the state at tau into out; returns whether the entity existed inside the volume then. */
  sample(tau, out) {
    const k = this.find(tau);
    if (k < 0) return false;
    const o = k * this.stride;
    if (this.vals[o] === 0) return false;
    for (let i = 0; i < this.nch; i++) out[i] = this.vals[o + 1 + i];
    return true;
  }
  freeze() {
    this.ticks = Int32Array.from(this.ticks);
    this.vals = Float32Array.from(this.vals);
    this.frozen = true;
  }
  get keyframes() { return this.ticks.length; }
  get bytes() { return this.ticks.length * 4 + this.vals.length * 4; }
}

export class Recording {
  constructor(name, volume) {
    this.name = name;
    this.volume = { ...volume };
    this.length = 0;
    this.tracks = new Map();
    this.source = 'live';
    this.activity = null;
    this.uid = 0;
  }
  get keyframes() { let n = 0; for (const t of this.tracks.values()) n += t.keyframes; return n; }
  get bytes() { let n = 0; for (const t of this.tracks.values()) n += t.bytes; return n; }
  /** Raw (uncompressed) cost if every entity were stored every tick, for the diagnostics overlay. */
  get rawBytes() { let n = 0; for (const t of this.tracks.values()) n += this.length * t.stride * 4; return n; }
  finalize(length) {
    this.length = length;
    for (const t of this.tracks.values()) t.freeze();
    // Real activity histogram (state changes per bin), shown on the instrument timeline.
    const bins = 96, act = new Float32Array(bins);
    for (const t of this.tracks.values()) for (const k of t.ticks) act[Math.min(bins - 1, Math.floor((k / Math.max(1, length)) * bins))] += 1;
    let mx = 1; for (const a of act) mx = Math.max(mx, a);
    for (let i = 0; i < bins; i++) act[i] /= mx;
    this.activity = act;
  }
  toJSON() {
    return {
      name: this.name, volume: this.volume, length: this.length, source: this.source,
      tracks: [...this.tracks.values()].map((t) => ({ id: t.id, def: t.def, ticks: b64(new Int32Array(t.ticks)), vals: b64(new Float32Array(t.vals)) })),
    };
  }
  static fromJSON(j) {
    const r = new Recording(j.name, j.volume);
    r.source = j.source ?? 'live';
    for (const tj of j.tracks) {
      const t = new Track(tj.id, tj.def);
      t.ticks = unb64(tj.ticks, Int32Array); t.vals = unb64(tj.vals, Float32Array); t.frozen = true;
      r.tracks.set(t.id, t);
    }
    r.finalize(j.length);
    return r;
  }
}

/** Records the present layer of a world into a Recording while the world steps. */
export class Recorder {
  constructor(slot, volume, maxTicks, name) {
    this.slot = slot;
    this.rec = new Recording(name, volume);
    this.maxTicks = maxTicks;
    this.tau = 0;
  }
  capture(world) {
    const v = this.rec.volume;
    for (const L of world.items) {
      const t = L.type;
      if (t.capture === 'none') continue;
      if (t.ch.length === 0 && L.def.era !== 'past') continue; // present statics need no history
      const inside = world.insideVolume(L, v);
      let tr = this.rec.tracks.get(L.id);
      if (!tr) { if (!inside) continue; tr = new Track(L.id, trackTemplate(L)); this.rec.tracks.set(L.id, tr); }
      tr.push(this.tau, inside, L.st);
    }
    this.tau++;
  }
  get full() { return this.tau >= this.maxTicks; }
}

function trackTemplate(L) { // a plain-data copy of the definition, minus runtime links
  const d = JSON.parse(JSON.stringify(L.def));
  delete d.in; // an echo's wiring is irrelevant: its state is replayed verbatim
  return d;
}

export class Playback {
  constructor(slot, rec) {
    this.slot = slot; this.rec = rec;
    this.head = 0; this.rate = 1; this.mode = 'once';
    this.active = false; this.playing = false;
    this.coherence = 1; this.age = 0;
    this.items = new Map();
  }
  get tau() { return Math.max(0, Math.min(this.rec.length - 1, Math.floor(this.head))); }
  start(rate = 1) {
    this.rate = rate; this.active = true; this.playing = true; this.coherence = 1; this.age = 0;
    this.head = rate < 0 ? this.rec.length - 1 : 0;
  }
  /** Advance one world tick. Returns 'ended' when a one-shot playback runs out. */
  advance() {
    if (!this.active || !this.playing) return null;
    const L = this.rec.length;
    this.head += this.rate;
    this.age++;
    switch (this.mode) {
      case 'loop': this.head = ((this.head % L) + L) % L; break;
      case 'pingpong':
        if (this.head >= L - 1) { this.head = L - 1 - (this.head - (L - 1)); this.rate = -Math.abs(this.rate); }
        else if (this.head <= 0) { this.head = -this.head; this.rate = Math.abs(this.rate); }
        break;
      case 'hold':
        if (this.head >= L - 1) { this.head = L - 1; this.playing = false; return 'held'; }
        if (this.head <= 0) { this.head = 0; this.playing = false; return 'held'; }
        break;
      default:
        if (this.head >= L || this.head < 0) { this.head = Math.max(0, Math.min(L - 1, this.head)); this.active = false; this.playing = false; return 'ended'; }
    }
    return null;
  }
  toJSON() { return { slot: this.slot, head: this.head, rate: this.rate, mode: this.mode, active: this.active, playing: this.playing, coherence: this.coherence, age: this.age }; }
}

// --- base64 helpers for compact JSON saves (work in browsers and Node 20+)
function b64(typed) {
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function unb64(str, Ctor) {
  const s = atob(str), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return new Ctor(u.buffer);
}
