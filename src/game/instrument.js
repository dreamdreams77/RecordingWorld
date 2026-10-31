// The Recollector's instrument: everything between "I have a recording" and "the world is playing it".
// It owns a *preview cursor* — a moment in a stored recording the player is examining before committing to it.
// The cursor lives entirely outside the simulation (it is not saved, not hashed, never steps the world); committing
// goes through the ordinary world API (playFrom / stepHead), so determinism, saves and rewinds are unaffected.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const RATE_STEPS = [0.25, 0.5, 1, 2, 4];

export class Instrument {
  constructor(game) {
    this.g = game;
    this.cursor = null;          // { slot, tick } when examining a recording that is not playing
    this.lastTouch = -99;        // render-clock seconds of the last deliberate action (drives the reel's expansion)
    this.reelPinned = false;     // the player asked for the reel to stay open (touch button)
    this.rep = { code: null, t: 0, acc: 0 };
    this.jog = 0; this.jogging = false;
    this.focus = null;           // the lane (track id) last pointed at, for omit / solo
  }
  get w() { return this.g.world; }
  get slot() { return this.g.selected; }
  get rec() { return this.w?.recordings[this.slot] ?? null; }
  get pb() { return this.w?.playbacks[this.slot] ?? null; }
  now() { return performance.now() / 1000; }
  poke() { this.lastTouch = this.now(); }
  clear() { this.cursor = null; this.jogging = false; this.jog = 0; }

  /** The tick under inspection: the echo's head if it is out in the world, else the preview cursor, else null. */
  head() {
    const pb = this.pb; if (!this.rec) return null;
    if (pb?.active) return Math.floor(pb.head);
    return this.cursor && this.cursor.slot === this.slot ? this.cursor.tick : null;
  }
  isPreview() { return !!this.rec && !this.pb?.active && !!this.cursor && this.cursor.slot === this.slot; }
  /** Should the reel be open? Recording, examining, or having just touched an echo. */
  expanded() {
    if (this.w?.recorder) return true;
    if (this.reelPinned || this.cursor) return true;
    const pb = this.pb;
    return !!(pb?.active && this.now() - this.lastTouch < 6) || this.now() - this.lastTouch < 3;
  }

  // ---------------------------------------------------------------- moving through history
  clampTick(t) { const r = this.rec; return r ? clamp(Math.round(t), 0, Math.max(0, r.length - 1)) : 0; }
  /** Absolute move. An echo in the world is held at that tick; otherwise the preview cursor moves. */
  scrubTo(tick, { quiet = false } = {}) {
    const r = this.rec; if (!r || this.w.recorder) return false;
    const t = this.clampTick(tick), pb = this.pb;
    if (pb?.active) { this.w.stepHead(this.slot, t - Math.floor(pb.head)); this.cursor = null; }
    else { const first = !this.cursor; this.cursor = { slot: this.slot, tick: t }; if (first) this.g.audio?.event('preview'); }
    this.poke();
    if (!quiet) this.g.audio?.event('scrub', t / Math.max(1, r.length - 1));
    return true;
  }
  /** Relative move by exactly n ticks (default one). */
  scrubBy(n) {
    const h = this.head();
    return this.scrubTo((h ?? (n < 0 ? this.rec?.length - 1 : 0)) + n);
  }
  /** Jump to the previous / next significant moment (a plate pressed, a door opening, a note sung…). */
  jumpMarker(dir) {
    const r = this.rec; if (!r) return null;
    const h = this.head() ?? (dir > 0 ? -1 : r.length), ms = r.markers;
    let m = null;
    if (dir > 0) m = ms.find((k) => k.t > h);
    else for (let i = ms.length - 1; i >= 0; i--) if (ms[i].t < h) { m = ms[i]; break; }
    if (!m) return null;
    this.scrubTo(m.t, { quiet: true }); this.g.audio?.event('marker');
    this.g.hud.toast(m.label, '', `t ${m.t} · ${(m.t / 60).toFixed(2)} s`, 1800);
    return m;
  }
  /** What the 3D ghost should show this frame (only while a stored moment is being examined, never during playback). */
  ghost() {
    if (!this.isPreview() || !this.rec) return null;
    const t = this.cursor.tick, pb = this.pb;
    if (!this._near || this._nearT !== t || this._nearRec !== this.rec) {
      this._near = new Set(this.around(t, 20).map((m) => m.id)); this._nearT = t; this._nearRec = this.rec;
    }
    return { entries: this.rec.sampleAll(t, pb?.muted), slot: this.slot, world: this.w, near: this._near };
  }
  /** Markers at (or within `win` ticks of) a tick — what is happening at the moment under inspection. */
  around(tick, win = 6) { const r = this.rec; return r ? r.markers.filter((m) => Math.abs(m.t - tick) <= win) : []; }
  next(tick) { const r = this.rec; return r ? r.markers.find((m) => m.t > tick) ?? null : null; }

  // ---------------------------------------------------------------- committing
  /** Play the echo from the examined moment. */
  playHere() {
    const h = this.head(), w = this.w; if (h === null) return false;
    const ok = w.playFrom(this.slot, h, { frozen: false });
    if (ok) { this.cursor = null; this.poke(); this.g.audio?.event('play'); this.g.feel('play', this.slot); }
    return ok;
  }
  /** Hold the echo still at the examined moment (or right now, if it is playing). */
  freezeHere() {
    const w = this.w, pb = this.pb, r = this.rec; if (!r) return false;
    let ok;
    if (pb?.active && pb.playing) { pb.playing = false; ok = true; w.emit('freeze', { slot: this.slot, tick: Math.floor(pb.head) }); }
    else if (pb?.active && !pb.playing) { pb.playing = true; this.poke(); this.g.audio?.event('thaw'); this.g.feel('thaw', this.slot); return true; } // F again releases
    else { const h = this.head() ?? 0; ok = w.playFrom(this.slot, h, { frozen: true }); this.cursor = null; }
    if (ok) { this.poke(); this.g.audio?.event('freeze'); this.g.feel('freeze', this.slot); }
    return ok;
  }
  togglePlay() {
    const w = this.w, pb = this.pb;
    if (!this.rec) return;
    if (this.isPreview()) { this.playHere(); return; }
    if (!pb) return;
    w.togglePlay(this.slot); this.poke();
    if (pb.active && pb.playing) { this.g.audio?.event('play'); this.g.feel('play', this.slot); } else if (pb.active) { this.g.audio?.event('freeze'); this.g.feel('freeze', this.slot); }
  }
  reverse() {
    const w = this.w, pb = this.pb; if (!pb) return;
    w.reverse(this.slot); this.poke();
    const back = pb.rate < 0;
    this.g.audio?.event(back ? 'reverse' : 'forward'); this.g.feel(back ? 'reverse' : 'forward', this.slot);
  }
  rate(dir) {
    const w = this.w, pb = this.pb; if (!pb) return;
    const i = RATE_STEPS.indexOf(Math.abs(pb.rate)), j = clamp((i < 0 ? 2 : i) + dir, 0, RATE_STEPS.length - 1);
    w.setRate(this.slot, RATE_STEPS[j]); this.poke();
    const r = RATE_STEPS[j];
    if (r < 1) { this.g.audio?.event('slow'); this.g.feel('slow', this.slot); } else if (r > 1) { this.g.audio?.event('fast'); this.g.feel('fast', this.slot); } else this.g.audio?.event('select');
    this.g.hud.toast(`slot ${this.slot + 1}: ×${r}${pb.rate < 0 ? ' reversed' : ''}`, '', '', 1400);
  }
  cycleMode() {
    const m = this.w.cycleMode(this.slot); if (!m) return null;
    this.poke(); this.g.audio?.event(m === 'loop' ? 'loop' : 'select'); this.g.feel(m === 'loop' ? 'loop' : 'mode', this.slot);
    this.g.hud.toast(`slot ${this.slot + 1}: ${m}`, '', '', 1400);
    return m;
  }
  /** Omit or solo one recorded object (a lane of the reel, or the aimed object). */
  lane(id, solo = false) {
    const w = this.w; if (!this.rec?.tracks.has(id)) return null;
    const on = solo ? w.soloTrack(this.slot, id) : w.muteTrack(this.slot, id);
    this.poke(); this.focus = id;
    this.g.audio?.event(solo ? (on ? 'solo' : 'unomit') : (on ? 'omit' : 'unomit')); this.g.feel(solo ? (on ? 'solo' : 'unomit') : (on ? 'omit' : 'unomit'), this.slot, id);
    return on;
  }

  // ---------------------------------------------------------------- input
  /** Keyboard/mouse frame handling. Returns nothing; owns , . ; ' Home End F and the Ctrl jog-wheel. */
  keys(I, dt) {
    const w = this.w; if (!w || w.recorder) { this.rep.code = null; this.jogging = false; return; }
    const shift = I.held('ShiftLeft', 'ShiftRight');
    // one tick per press; hold to repeat, accelerating (8 → 60 ticks/s); Shift moves ten at a time
    for (const [code, dir] of [['Comma', -1], ['Period', 1]]) {
      if (I.hit(code)) { this.scrubBy(dir * (shift ? 10 : 1)); this.rep = { code, t: 0, acc: 0 }; }
      else if (I.held(code) && this.rep.code === code) {
        this.rep.t += dt;
        if (this.rep.t > 0.32) { this.rep.acc += dt * Math.min(60, 8 + (this.rep.t - 0.32) * 40); while (this.rep.acc >= 1) { this.rep.acc -= 1; this.scrubBy(dir * (shift ? 10 : 1)); } }
      } else if (this.rep.code === code) this.rep.code = null;
    }
    if (I.hit('Semicolon')) this.jumpMarker(-1);
    if (I.hit('Quote')) this.jumpMarker(1);
    if (I.hit('Home') && this.rec) this.scrubTo(0);
    if (I.hit('End') && this.rec) this.scrubTo(this.rec.length - 1);
    if (I.hit('KeyF') && !this.g.level?.sandbox) this.freezeHere();
    // mouse as a jog wheel: hold Ctrl and move horizontally (the view stays still); Shift = coarse
    const ctrl = I.held('ControlLeft', 'ControlRight') && !!this.rec;
    this.jogging = ctrl;
    if (ctrl) {
      this.jog += I.dx * (shift ? 1.5 : 0.35);
      const n = Math.trunc(this.jog); if (n) { this.jog -= n; this.scrubBy(n); }
      if (I.wheel) this.scrubBy(-I.wheel * (shift ? 10 : 1));
    } else if (this.cursor && I.wheel && !this.g.frameMode && !this.g.pinned) this.scrubBy(-I.wheel * (shift ? 10 : 1));
    if (!ctrl) this.jog = 0;
  }
}
