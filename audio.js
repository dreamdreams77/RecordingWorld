// src/audio.js
// Procedural audio via the Web Audio API. No sample files, no licensed material.
// Every sound is synthesized here. Positional sounds are panned by world x.

import { WORLD_W } from './sim.js';

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.lastImpact = 0;
    this.ambience = null;
  }

  // Must be called from a user gesture (browsers gate audio contexts).
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);
    this.noise = this.makeNoise(2);
    this.startAmbience();
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.05);
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Deterministic noise: a simple LCG so the sound is the same each session.
    let s = 1234567;
    for (let i = 0; i < len; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
    return buf;
  }

  panner(x) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (x / WORLD_W) * 2 - 1)) * 0.8;
    p.connect(this.master);
    return p;
  }

  // Ambient bed: two slightly detuned low voices through a slowly moving filter,
  // plus filtered noise. Reads as "the machine is on".
  startAmbience() {
    const ctx = this.ctx;
    const bus = ctx.createGain();
    bus.gain.value = 0.07;
    bus.connect(this.master);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 4;
    filter.connect(bus);

    for (const [freq, detune] of [[55, 0], [55.4, 6], [110.6, -4]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(filter);
      o.start();
    }

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 2400;
    hissFilter.Q.value = 0.7;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.012;
    hiss.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(this.master);
    hiss.start();

    this.ambience = { bus, filter };
  }

  // A collision. Pitch and loudness follow impact speed; echoes sound thinner.
  impact(speed, x, echo) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - this.lastImpact < 0.03) return;
    this.lastImpact = now;

    const amp = Math.min(0.5, speed / 1400);
    const out = this.panner(x);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = echo ? 2600 : 900 + speed * 0.4;
    bp.Q.value = echo ? 6 : 2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + (echo ? 0.22 : 0.09));
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(now, Math.random() * 0.5, 0.3);
    src.stop(now + 0.3);

    if (!echo) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(260 + speed * 0.2, now);
      o.frequency.exponentialRampToValueAtTime(90, now + 0.12);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(amp * 0.6, now);
      og.gain.exponentialRampToValueAtTime(0.0008, now + 0.14);
      o.connect(og);
      og.connect(out);
      o.start(now);
      o.stop(now + 0.15);
    }
  }

  // A plate press (on) or release (off).
  plate(on, x) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const out = this.panner(x);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(on ? 880 : 660, now);
    o.frequency.exponentialRampToValueAtTime(on ? 660 : 440, now + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
    o.connect(g);
    g.connect(out);
    o.start(now);
    o.stop(now + 0.2);
  }

  // A door moves: filtered noise sweeping up (opening) or down (closing).
  door(open, x) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const out = this.panner(x);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(open ? 300 : 900, now);
    f.frequency.exponentialRampToValueAtTime(open ? 900 : 260, now + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(now, 0, 0.6);
    src.stop(now + 0.6);
  }

  // Recording start (rising) and stop (falling).
  record(start) {
    this.tone(start ? [330, 660] : [660, 220], 0.22, 'triangle', 0.2);
  }

  // Playback begins: a short three-note chord that blooms.
  playback() {
    this.tone([392, 494, 587], 0.6, 'sine', 0.12, true);
  }

  // A conflict between recorded memory and present reality: a dissonant pair.
  conflict(x) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const out = this.panner(x);
    for (const f of [146, 155]) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.35);
      o.connect(g);
      g.connect(out);
      o.start(now);
      o.stop(now + 0.4);
    }
  }

  // Objective complete: an ascending arpeggio.
  complete() {
    this.tone([523, 659, 784, 1046], 0.9, 'sine', 0.14, false, 0.09);
  }

  tone(freqs, dur, type, amp, simultaneous = false, stagger = 0.12) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      const t0 = simultaneous ? now : now + i * stagger;
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    });
  }
}
