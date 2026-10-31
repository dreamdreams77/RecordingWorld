// Procedural audio. Audio is part of the simulation's presentation: every audible thing is a voice that
// is positioned from simulation state each frame (emitters, machinery, the player's own voice) and
// recorded sound is audibly *historical* — tape-filtered, flutter-detuned and wetter than the present.
// No samples are shipped; everything is synthesised with the Web Audio API.

const NOTE_HZ = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88].map((f) => f * 1); // C D E F G A B
export const noteHz = (n) => NOTE_HZ[(n - 1) % 7];

const THEME_AUDIO = {
  chamber:     { root: 55,   rev: 3.4, wind: 400,  fifth: 1.5,   pulse: 0.2,  clank: 0 },
  machine:     { root: 41.2, rev: 2.2, wind: 250,  fifth: 1.335, pulse: 0.55, clank: 1 },
  absence:     { root: 49,   rev: 4.2, wind: 700,  fifth: 1.414, pulse: 0.12, clank: 0 },
  acoustic:    { root: 65.4, rev: 5.0, wind: 900,  fifth: 1.5,   pulse: 0.1,  clank: 0 },
  observatory: { root: 36.7, rev: 6.0, wind: 1100, fifth: 1.5,   pulse: 0.08, clank: 0 },
  record:      { root: 58.3, rev: 4.6, wind: 500,  fifth: 1.25,  pulse: 0.25, clank: 0 },
};

export class AudioEngine {
  constructor() {
    this.ctx = null; this.ready = false; this.voices = new Map(); this.level = null; this.settings = null;
    this.stepClock = 0; this.lastSection = 0; this.t = 0; this.maxVoices = 28;
    this.meter = { rms: 0, voices: 0 };
  }

  /** Must be called from a user gesture (click / key) the first time. */
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = c.createGain(); this.master.gain.value = 0.8;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 1024;
    this.master.connect(this.comp); this.comp.connect(this.analyser); this.analyser.connect(c.destination);
    this.bus = {};
    for (const k of ['sfx', 'amb', 'music', 'voice']) { const g = c.createGain(); g.connect(this.master); this.bus[k] = g; }
    this.reverb = c.createConvolver(); this.reverbSend = c.createGain(); this.reverbSend.gain.value = 1;
    this.reverbOut = c.createGain(); this.reverbOut.gain.value = 0.55;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.master);
    this.setReverb(3);
    this.noiseBuf = this.makeNoise(2);
    this.ready = true;
    if (this.settings) this.applySettings(this.settings);
    c.resume?.();
  }
  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } // brown-ish
    return b;
  }
  setReverb(seconds) {
    const c = this.ctx, len = Math.floor(c.sampleRate * seconds), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1); }
    this.reverb.buffer = ir;
  }
  applySettings(s) {
    this.settings = s;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.master, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.sfx, t, 0.05); this.bus.amb.gain.setTargetAtTime(s.ambience, t, 0.05);
    this.bus.music.gain.setTargetAtTime(s.music, t, 0.05); this.bus.voice.gain.setTargetAtTime(s.voice, t, 0.05);
  }
  suspend(flag) { if (!this.ready) return; flag ? this.ctx.suspend() : this.ctx.resume(); }

  // ---------------------------------------------------------------- level ambience
  loadLevel(level) {
    this.level = level;
    this.stopAll();
    if (!this.ready) return;
    const th = THEME_AUDIO[level.theme] ?? THEME_AUDIO.chamber, c = this.ctx;
    this.setReverb(th.rev);
    const amb = this.ambience = { nodes: [] };
    // drone: two detuned saws + a fifth, through a slowly breathing lowpass
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2;
    const g = c.createGain(); g.gain.value = 0.16;
    for (const [m, det] of [[1, -6], [1, 7], [th.fifth, 0], [2, 3]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = th.root * m; o.detune.value = det;
      const og = c.createGain(); og.gain.value = m === 2 ? 0.25 : 0.6; o.connect(og); og.connect(lp); o.start(); amb.nodes.push(o);
    }
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 110; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); amb.nodes.push(lfo);
    lp.connect(g); g.connect(this.bus.amb); g.connect(this.reverbSend);
    // air: bandpassed noise drifting
    const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = th.wind; bp.Q.value = 0.7;
    const ng = c.createGain(); ng.gain.value = 0.35; ns.connect(bp); bp.connect(ng); ng.connect(this.bus.amb);
    const l2 = c.createOscillator(), l2g = c.createGain(); l2.frequency.value = 0.05; l2g.gain.value = th.wind * 0.4; l2.connect(l2g); l2g.connect(bp.frequency); l2.start(); ns.start(); amb.nodes.push(ns, l2);
    // slow pulse (the "tick" under everything)
    this.pulseT = 0; this.pulseRate = th.pulse; this.clank = th.clank; this.themeAudio = th;
  }
  stopAll() {
    for (const v of this.voices.values()) this.killVoice(v);
    this.voices.clear();
    if (this.ambience) for (const n of this.ambience.nodes) { try { n.stop(); } catch { /* already stopped */ } }
    this.ambience = null;
  }

  // ---------------------------------------------------------------- voices
  voice(key, build) {
    let v = this.voices.get(key);
    if (!v) {
      if (this.voices.size >= this.maxVoices) return null;
      v = build(); v.key = key; v.seen = this.t; this.voices.set(key, v);
    }
    v.seen = this.t;
    return v;
  }
  killVoice(v) {
    const t = this.ctx.currentTime;
    try { v.gain.gain.setTargetAtTime(0, t, 0.05); } catch { /* ignore */ }
    for (const n of v.nodes) { try { n.stop?.(t + 0.3); } catch { /* ignore */ } }
    setTimeout(() => { try { v.out.disconnect(); } catch { /* ignore */ } }, 400);
  }
  /** Common spatial chain: [src] → gain → (tape?) → panner → bus (+ reverb send). */
  chain(historical, bus = 'sfx') {
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = 0;
    const pan = c.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 2.5; pan.rolloffFactor = 1.1; pan.maxDistance = 80;
    const nodes = [];
    let tail = gain;
    if (historical) { // tape: bandwidth-limited, flutter, a touch of saturation
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.9;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
      const sh = c.createWaveShaper(); const cu = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; cu[i] = Math.tanh(x * 2.2); } sh.curve = cu;
      gain.connect(hp); hp.connect(sh); sh.connect(lp); tail = lp;
    }
    tail.connect(pan); pan.connect(this.bus[bus]);
    const send = c.createGain(); send.gain.value = historical ? 0.55 : 0.2; pan.connect(send); send.connect(this.reverbSend);
    return { gain, pan, nodes, out: pan, send };
  }
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }

  toneVoice(historical, isPlayer) {
    const c = this.ctx, ch = this.chain(historical, isPlayer ? 'voice' : 'sfx');
    const f = this.osc(isPlayer ? 'sawtooth' : 'triangle', 261);
    const f2 = this.osc('sine', 522), f3 = this.osc('sine', 783);
    const g2 = c.createGain(); g2.gain.value = 0.35; const g3 = c.createGain(); g3.gain.value = 0.15;
    const fm1 = c.createBiquadFilter(); fm1.type = 'bandpass'; fm1.frequency.value = isPlayer ? 780 : 1500; fm1.Q.value = 2.2;
    const vib = this.osc('sine', historical ? 4.1 : 5.4), vg = c.createGain(); vg.gain.value = historical ? 14 : 7; vib.connect(vg); vg.connect(f.detune); vg.connect(f2.detune); vg.connect(f3.detune);
    if (historical) { const wow = this.osc('sine', 0.7), wg = c.createGain(); wg.gain.value = 22; wow.connect(wg); wg.connect(f.detune); wg.connect(f2.detune); wow.start(); ch.nodes.push(wow); }
    f.connect(fm1); f2.connect(g2); g2.connect(fm1); f3.connect(g3); g3.connect(fm1); fm1.connect(ch.gain);
    for (const o of [f, f2, f3, vib]) { o.start(); ch.nodes.push(o); }
    return { ...ch, f, f2, f3 };
  }
  machineVoice(historical) {
    const c = this.ctx, ch = this.chain(historical);
    const o = this.osc('sawtooth', 60), o2 = this.osc('square', 30);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g2 = c.createGain(); g2.gain.value = 0.4; o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(ch.gain);
    o.start(); o2.start(); ch.nodes.push(o, o2);
    return { ...ch, o, o2, lp };
  }
  noiseVoice(historical, freq = 400) {
    const c = this.ctx, ch = this.chain(historical);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; s.loopStart = Math.random();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
    s.connect(bp); bp.connect(ch.gain); s.start(); ch.nodes.push(s);
    return { ...ch, bp };
  }

  /** Drive every voice from the simulation. Called once per rendered frame. */
  update(world, camera, dt, input) {
    if (!this.ready || !this.ambience) return;
    this.t += dt;
    const c = this.ctx, now = c.currentTime;
    // listener follows the camera
    const L = c.listener, p = camera.position, q = camera.quaternion;
    const fwd = _v.set(0, 0, -1).applyQuaternion(q), up = _u.set(0, 1, 0).applyQuaternion(q);
    if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z; L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z; }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
    const set = (param, v, tc = 0.04) => param.setTargetAtTime(v, now, tc);
    const place = (v, x, y, z) => { if (v.pan.positionX) { v.pan.positionX.value = x; v.pan.positionY.value = y; v.pan.positionZ.value = z; } else v.pan.setPosition(x, y, z); };

    let activeMotion = 0;
    for (const L2 of world.aliveList) {
      const hist = L2.echo, def = L2.def, t = def.type, lk = `${L2.layer}|${L2.id}`;
      if (t === 'emitter' && L2.st[0] > 0.5) {
        const v = this.voice(`${lk}|tone`, () => this.toneVoice(hist, false));
        if (v) { const f = noteHz(def.note ?? 1); v.f.frequency.value = f; v.f2.frequency.value = f * 2; v.f3.frequency.value = f * 3; place(v, ...def.pos); set(v.gain.gain, 0.16); }
      } else if (t === 'player' && L2.st[8] > 0.5 && (L2.echo || false)) {
        const v = this.voice(`${lk}|voice`, () => this.toneVoice(true, true));
        if (v) { const f = noteHz(L2.st[8] | 0) * 0.5; v.f.frequency.setTargetAtTime(f, now, 0.02); v.f2.frequency.setTargetAtTime(f * 2, now, 0.02); v.f3.frequency.setTargetAtTime(f * 3, now, 0.02); place(v, L2.st[0], L2.st[1] + 0.5, L2.st[2]); set(v.gain.gain, 0.2); }
      } else if (t === 'carillon' && L2.st[1] > 0.5) {
        const v = this.voice(`${lk}|car`, () => this.toneVoice(hist, false));
        if (v) { const f = noteHz(L2.st[1] | 0) * 2; v.f.frequency.setTargetAtTime(f, now, 0.01); v.f2.frequency.setTargetAtTime(f * 2.7, now, 0.01); v.f3.frequency.setTargetAtTime(f * 4.1, now, 0.01); place(v, ...def.pos); set(v.gain.gain, 0.2); }
      } else if (t === 'actor' && L2.st[7] > 0.5 && L2.st[4] > 0.5) {
        const v = this.voice(`${lk}|hum`, () => this.toneVoice(true, true));
        if (v) { const f = noteHz(L2.st[4] | 0) * 0.5; v.f.frequency.setTargetAtTime(f, now, 0.04); v.f2.frequency.setTargetAtTime(f * 2, now, 0.04); v.f3.frequency.setTargetAtTime(f * 3, now, 0.04); place(v, L2.st[0], L2.st[1] + 0.4, L2.st[2]); set(v.gain.gain, 0.14); }
      } else if (t === 'flywheel' && L2.st[0] > 0.03) {
        const v = this.voice(`${lk}|fw`, () => this.machineVoice(hist));
        if (v) { const om = L2.st[0]; v.o.frequency.value = 38 + om * 90; v.o2.frequency.value = 19 + om * 45; v.lp.frequency.value = 160 + om * 600; place(v, ...def.pos); set(v.gain.gain, 0.05 + om * 0.22); }
      } else if (t === 'conveyor' && L2.st[0] > 0.5) {
        const v = this.voice(`${lk}|belt`, () => this.noiseVoice(hist, 900));
        if (v) { place(v, ...def.pos); set(v.gain.gain, 0.16 + 0.06 * Math.sin(this.t * 14)); }
      } else if (t === 'slider') {
        const prev = L2._ps ?? L2.st[0]; L2._ps = L2.st[0];
        const moving = Math.abs(L2.st[0] - prev) > 0.0004;
        if (moving) {
          activeMotion++;
          const v = this.voice(`${lk}|slide`, () => this.noiseVoice(hist, 160));
          if (v) { const a = L2.type.anchor(def, L2.st); place(v, a[0], a[1], a[2]); v.bp.frequency.value = 120 + Math.abs(L2.st[0] - prev) * 40000; set(v.gain.gain, 0.5); }
        }
      } else if (t === 'resonator' && L2.st[0] > 0.02 && !hist) {
        const v = this.voice(`${lk}|res`, () => this.toneVoice(false, false));
        if (v) { const n = (def.want ?? def.seq ?? [1])[0]; const f = noteHz(n) * 2; v.f.frequency.value = f; v.f2.frequency.value = f * 2; v.f3.frequency.value = f * 3; place(v, ...def.pos); set(v.gain.gain, L2.st[0] * 0.05); }
      }
    }
    // the player's own voice (not spatialised relative to anything but the head)
    const me = world.player?.st;
    if (me && me[8] > 0.5) {
      const v = this.voice('me|voice', () => this.toneVoice(false, true));
      if (v) { const f = noteHz(me[8] | 0) * 0.5; v.f.frequency.setTargetAtTime(f, now, 0.02); v.f2.frequency.setTargetAtTime(f * 2, now, 0.02); v.f3.frequency.setTargetAtTime(f * 3, now, 0.02); place(v, me[0], me[1] + 0.3, me[2]); set(v.gain.gain, 0.22); }
    }
    // footsteps
    if (me && me[9] > 0.5) {
      const sp = Math.hypot(me[3], me[5]);
      if (sp > 1) { this.stepClock += dt * sp; if (this.stepClock > 2.1) { this.stepClock = 0; this.footstep(sp / 5); } }
    }
    // temporal interference: beating detuned pair + crackle, proportional to conflicts and lost coherence
    let incoh = 0; for (const pb of world.playbacks) if (pb?.active) incoh = Math.max(incoh, 1 - pb.coherence);
    const amt = Math.min(1, world.conflicts.filter((x) => x.kind !== 'state' && x.kind !== 'projection').length * 0.3 + incoh);
    if (amt > 0.02) {
      const v = this.voice('interference', () => {
        const ch = this.chain(false, 'sfx'); const a = this.osc('sine', 83), b = this.osc('sine', 80.6), s = this.osc('square', 1900);
        const sg = c.createGain(); sg.gain.value = 0.05; s.connect(sg); sg.connect(ch.gain); a.connect(ch.gain); b.connect(ch.gain); [a, b, s].forEach((o) => { o.start(); ch.nodes.push(o); }); return { ...ch, a, b, s };
      });
      if (v) { v.s.frequency.value = 1500 + 800 * Math.sin(this.t * 33) ; place(v, p.x, p.y, p.z + 1); set(v.gain.gain, 0.05 + amt * 0.2); }
    }
    // rhythmic pulse / machine clank in the ambience
    this.pulseT += dt;
    if (this.pulseT > 1 / Math.max(0.05, this.pulseRate)) { this.pulseT = 0; this.blip(this.clank ? 70 : 52, 0.12, this.clank ? 0.14 : 0.07, 'sine'); if (this.clank) this.noiseTick(900, 0.05, 0.1); }
    // retire voices that were not touched this frame
    for (const [k, v] of this.voices) if (this.t - v.seen > 0.12) { this.killVoice(v); this.voices.delete(k); }
    // meter (diagnostics + tests)
    const buf = this._buf ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    this.meter.rms = Math.sqrt(s / buf.length); this.meter.voices = this.voices.size;
  }

  // ---------------------------------------------------------------- one-shots
  env(g, t, a, d, peak) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  blip(freq, dur, vol, type = 'sine', bus = 'sfx', freq2 = null) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, o = this.osc(type, freq), g = c.createGain();
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    this.env(g, t, 0.005, dur, vol); o.connect(g); g.connect(this.bus[bus]); g.connect(this.reverbSend); o.start(t); o.stop(t + dur + 0.1);
  }
  noiseTick(freq, dur, vol, q = 1.5) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loopStart = Math.random();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q; const g = c.createGain();
    this.env(g, t, 0.003, dur, vol); s.connect(bp); bp.connect(g); g.connect(this.bus.sfx); g.connect(this.reverbSend); s.loop = true; s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  footstep(k = 1) { const f = { chamber: 1800, machine: 1200, absence: 900, acoustic: 1400, observatory: 2000, record: 1500 }[this.level?.theme] ?? 1400; this.noiseTick(f * (0.8 + Math.random() * 0.4), 0.09, 0.2 * k, 1.8); this.blip(70, 0.08, 0.1 * k, 'sine'); }
  /** Every verb of the instrument has its own voice: you can play it with your eyes closed. */
  event(name, arg = 0) {
    if (!this.ready) return;
    switch (name) {
      case 'reverse': this.blip(1100, 0.55, 0.17, 'sawtooth', 'sfx', 160); this.noiseTick(3200, 0.5, 0.16, 0.8); setTimeout(() => this.blip(180, 0.25, 0.12, 'sine', 'sfx', 90), 420); return;   // a tape sucked backwards
      case 'forward': this.blip(180, 0.4, 0.13, 'sawtooth', 'sfx', 900); this.noiseTick(900, 0.3, 0.1); return;
      case 'slow': this.blip(520, 0.9, 0.14, 'sine', 'sfx', 130); this.blip(262, 0.9, 0.08, 'triangle', 'sfx', 66); return;                                                             // winding down, heavy
      case 'fast': this.blip(300, 0.35, 0.1, 'square', 'sfx', 1200); this.noiseTick(4200, 0.25, 0.14); return;
      case 'loop': this.blip(523, 0.07, 0.14, 'triangle'); setTimeout(() => this.blip(523, 0.07, 0.12, 'triangle'), 90); setTimeout(() => this.blip(784, 0.18, 0.14, 'triangle'), 180); return; // the seam closing
      case 'freeze': this.noiseTick(7000, 0.5, 0.18, 6); this.blip(3136, 1.6, 0.07, 'sine'); this.blip(2093, 1.9, 0.07, 'sine'); this.blip(1568, 2.2, 0.06, 'sine'); return;          // ice: glassy and still
      case 'thaw': this.blip(1568, 0.3, 0.1, 'sine', 'sfx', 392); this.noiseTick(1200, 0.25, 0.1); return;
      case 'omit': this.blip(330, 0.18, 0.2, 'triangle', 'sfx', 82); this.noiseTick(260, 0.2, 0.3, 0.7); return;                                                                         // something taken out: a hollow thud
      case 'unomit': this.blip(82, 0.18, 0.18, 'triangle', 'sfx', 330); return;
      case 'solo': this.blip(1568, 1.4, 0.13, 'sine'); this.blip(2349, 1.1, 0.08, 'sine'); this.noiseTick(5000, 0.08, 0.12, 4); return;                                                   // one thing singled out: a bell
      case 'preview': this.blip(660, 0.05, 0.08, 'sine'); return;
      case 'marker': this.blip(1760, 0.08, 0.1, 'triangle'); this.blip(2217, 0.1, 0.06, 'sine'); return;
      case 'scrub': { // tape head over the oxide: pitch follows position in the recording
        const now = performance.now(); if (now - (this._scrubAt ?? 0) < 38) return; this._scrubAt = now;
        this.noiseTick(900 + Math.max(0, Math.min(1, arg)) * 3200, 0.03, 0.09, 3); return;
      }
      default:
    }
    switch (name) {
      case 'rec-start': this.blip(880, 0.12, 0.2, 'square', 'sfx', 1320); this.noiseTick(3000, 0.04, 0.2); setTimeout(() => this.blip(1320, 0.18, 0.18, 'square'), 90); break;
      case 'rec-stop': this.blip(1320, 0.12, 0.18, 'square', 'sfx', 660); setTimeout(() => this.blip(660, 0.2, 0.16, 'square', 'sfx', 330), 90); break;
      case 'play': this.blip(220, 0.5, 0.2, 'sawtooth', 'sfx', 660); this.noiseTick(600, 0.4, 0.15); break;
      case 'stop': this.blip(660, 0.3, 0.16, 'sawtooth', 'sfx', 110); break;
      case 'select': this.noiseTick(2600, 0.03, 0.15); this.blip(1400, 0.04, 0.06, 'sine'); break;
      case 'pin': this.blip(520, 0.08, 0.16, 'triangle'); setTimeout(() => this.blip(780, 0.1, 0.14, 'triangle'), 60); break;
      case 'lever': this.noiseTick(300, 0.12, 0.5, 0.8); this.blip(90, 0.15, 0.35, 'sine', 'sfx', 50); break;
      case 'section': [392, 523.25, 659.25].forEach((f, i) => setTimeout(() => this.blip(f, 0.9, 0.09, 'sine', 'music'), i * 140)); break;
      case 'upgrade': [330, 440, 587, 880].forEach((f, i) => setTimeout(() => this.blip(f, 0.7, 0.1, 'triangle', 'music'), i * 110)); break;
      case 'discovery': [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 1.4, 0.08, 'sine', 'music'), i * 90)); break;
      case 'tape': this.noiseTick(1800, 0.25, 0.25); this.blip(330, 0.4, 0.15, 'sawtooth', 'sfx', 165); break;
      case 'shock': this.noiseTick(150, 0.5, 0.8, 0.5); this.blip(60, 0.6, 0.4, 'sawtooth', 'sfx', 30); break;
      case 'collapse': this.noiseTick(500, 0.9, 0.7, 0.4); this.blip(300, 0.9, 0.3, 'sawtooth', 'sfx', 40); break;
      case 'canon': [196, 293.66, 392, 587.33].forEach((f, i) => setTimeout(() => this.blip(f, 2.4, 0.12, 'sine', 'music'), i * 160)); this.noiseTick(300, 0.8, 0.4, 0.5); break;
      case 'rewind': this.blip(880, 0.6, 0.14, 'sawtooth', 'sfx', 110); this.noiseTick(2000, 0.5, 0.2); break;
      case 'end': this.blip(440, 0.4, 0.12, 'triangle'); break;
      case 'complete': [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => setTimeout(() => this.blip(f, 2.2, 0.1, 'sine', 'music'), i * 220)); break;
      default:
    }
  }
}
import * as THREE from 'three';
const _v = new THREE.Vector3(), _u = new THREE.Vector3();
