// Game: the application shell. Owns the fixed-timestep loop, translates input into simulation commands,
// and connects World/Director to the renderer, HUD, audio and menus.

import { World, IDLE } from '../sim/world.js';
import { Director } from '../sim/director.js';
import { rayBox, clamp, lerp } from '../sim/math.js';
import { PLAYBACK_MODES } from '../sim/recording.js';
import { LEVELS, CAMPAIGN } from '../levels/index.js';
import { GameRenderer } from '../render/renderer.js';
import { HUD } from '../ui/hud.js';
import { Input } from './input.js';
import { loadSettings, saveSettings } from './settings.js';
import { TouchControls } from '../ui/touch.js';
import { Instrument } from './instrument.js';
import { Reel } from '../ui/reel.js';
import { SPAWNABLE } from '../levels/sandbox.js';
import { loadProgress, saveProgress, levelRecord, saveSnapshot, loadSnapshot } from './progress.js';

const NOTE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'];
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const RATES = [0.25, 0.5, 1, 2, 4];
import { FILM_INT as SLOT_HEX } from '../palette.js';

export class Game {
  constructor(root, { audio = null, menus = null } = {}) {
    this.root = root;
    this.settings = loadSettings();
    this.progress = loadProgress();
    this.canvas = root.querySelector('canvas#view');
    this.input = new Input(this.canvas, (locked) => this.onLock(locked));
    this.hud = new HUD(root);
    if (this.input.touch) { document.body.classList.add('touch'); this.touchUI = new TouchControls(this); }
    this.audio = audio; this.menus = menus;
    this.state = 'boot'; // boot | menu | loading | play | pause | cinematic | ended
    this.world = null; this.director = null; this.level = null;
    this.frameHalf = [3, 2.25, 3]; this.pinned = null; this.frameMode = false; this.selected = 0;
    this.yaw = 0; this.pitch = 0; this.lensFull = false; this.showVolumes = false; this.showTraj = false; this.dev = this.settings.devMode;
    this.acc = 0; this.last = performance.now(); this.fpsAcc = 0; this.fps = 60; this.pendingInteract = false;
    this.prev = new Float64Array(10); this.cur = new Float64Array(10);
    this.sb = { item: 0, note: 1, link: null };
    this.coach = { step: 0, t: 0 };
    this.cine = null;
    this.rewinds = []; this.sectionCaps = {}; this.lastCap = 0;
    this.instr = new Instrument(this);
    this.reel ??= new Reel(this);
    this.instr.clear();
    this.renderer = new GameRenderer(this.canvas, this.settings);
    this.canvas.addEventListener('click', () => { if (this.state === 'play' && !this.input.locked) this.input.lock(); });
    addEventListener('resize', () => this.resize());
    this.resize();
    this.applySettings();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() { this.renderer.resize(); }

  applySettings() {
    const s = this.settings;
    document.documentElement.style.setProperty('--ui', s.uiScale);
    document.body.classList.toggle('hc', s.highContrast);
    document.body.classList.toggle('reduced', s.reducedMotion);
    this.audio?.applySettings(s);
    this.hud?.setMode(s.hudMode);
    saveSettings(s);
  }
  onLock(locked) {
    if (!locked && this.state === 'play') this.pause();
  }

  // ------------------------------------------------------------------ title / attract mode
  async startAttract() {
    this.state = 'loading';
    const level = LEVELS.ch1;
    this.level = level; this.world = new World(level, { caps: { modes: level.caps.modes } }); this.director = new Director(this.world, level);
    await this.renderer.loadLevel(level, this.world);
    this.audio?.loadLevel(level, this.world);
    this.state = 'title'; this.attractT = 0; this.last = performance.now();
    this.menus?.show('title');
  }
  async toTitle() {
    this.input.unlock(); this.cine = null; this.renderer.cinematic = null; this.renderer.setEmulsion(0, 0);
    this.menus?.hide();
    await this.startAttract();
  }
  attractFrame(dt) {
    this.attractT += dt;
    this.acc += dt; let n = 0;
    while (this.acc >= 1 / 60 && n < 4) { this.world.step(IDLE); this.acc -= 1 / 60; n++; }
    const t = this.attractT, z = 4 - ((t * 1.6) % 70);
    this.renderer.cinematic = { pos: [Math.sin(t * 0.13) * 5, 2.3 + Math.sin(t * 0.21) * 0.5, z], target: [Math.sin(t * 0.09) * 2, 3.2, z - 14], fov: 62 };
    const p = this.world.player.st; this.cur.set(p); this.prev.set(p);
    this.renderer.render({ world: this.world, dt, cam: { x: p[0], y: p[1], z: p[2], yaw: 0, pitch: 0, speed: 0, ground: true }, found: new Set(), ui: { frame: null, selected: 0 } });
    this.audio?.update(this.world, this.renderer.camera, dt, {});
  }
  applyQuality(name) {
    this.settings.quality = name; saveSettings(this.settings);
    this.menus?.loading('Rebuilding the renderer', 0.1);
    const prev = this.menus?.current;
    this.renderer.applyQuality(name);
    Promise.resolve().then(() => { this.menus?.show(prev === 'loading' ? 'settings' : (this.state === 'pause' ? 'settings' : 'settings')); });
  }

  // ------------------------------------------------------------------ level lifecycle
  async startLevel(id, { snapshot = null, loadingCb = () => {} } = {}) {
    const level = LEVELS[id];
    this.state = 'loading'; this.cine = null; this.renderer.cinematic = null; this.renderer.setEmulsion(0, 0); this.coach = { step: 0, t: 0 }; this.sb.link = null;
    this.level = level;
    this.progress.canon ??= {};
    const flags = this.storyFlags();
    this.world = new World(level, { caps: { modes: level.caps.modes }, canon: this.progress.canon, flags });
    this.director = new Director(this.world, level, this.progress.levels[id], flags, this.progress.seen ?? {});
    this.rewinds = []; this.sectionCaps = {}; this.lastCap = 0;
    this.applyPerks();
    if (snapshot) {
      this.world.restore(snapshot.world);
      this.director.found = new Set(snapshot.found); this.director.done = new Set(snapshot.done);
      this.director.sectionIndex = snapshot.section;
    }
    const p = this.world.player.st;
    this.yaw = p[6]; this.pitch = 0;
    this.cur.set(p); this.prev.set(p);
    this.selected = 0; this.pinned = null; this.frameMode = false;
    this.hud.buildDeck(this.world.caps.slots);
    await this.renderer.loadLevel(level, this.world, loadingCb);
    this.resize();
    this.hud.setFolio(level, this.director.section);
    this.hud.showHint(this.settings.hints);
    this.audio?.loadLevel(level, this.world);
    this.state = 'play';
    this.input.lock();
    this.hud.layer.style.display = '';
    this.processDirector();
    if (!snapshot) this.hud.titleCard(level);
    if (!snapshot && this.director.sectionIndex <= 0) this.hud.say(level.narrative?.intro ?? this.director.section?.intro ?? '', 'THE ARCHIVIST', 8000);
    this.acc = 0; this.last = performance.now();
  }
  /** Choices made in earlier chapters change what the Recollector can do (and who is waiting for you). */
  applyPerks() {
    const w = this.world, c = this.progress.canon?.ch3;
    this.perk = null;
    if (!c || this.level.sandbox || this.level.index < 4) return;
    if (c === 'archive') { w.setSlots(w.caps.slots + 1); this.perk = 'Archive canon: one extra recording slot'; }
    if (c === 'observatory') { w.caps.maxVolume = w.caps.maxVolume.map((v) => v * 1.25); this.perk = 'Observatory canon: recording volumes 25% larger'; }
  }
  pushRewind() {
    this.rewinds.push(this.world.capture());
    if (this.rewinds.length > 24) this.rewinds.shift();
    this.lastCap = this.world.tick;
  }
  /** F6: step back through automatic captures (every 5 s, and before every ledger decision). */
  rewind() {
    const w = this.world, now = w.tick;
    while (this.rewinds.length && now - this.rewinds[this.rewinds.length - 1].tick < 90) this.rewinds.pop();
    const c = this.rewinds.pop();
    if (!c) { this.hud.toast('Nothing earlier to rewind to yet.', 'warn'); return; }
    w.reinstate(c); this.director.update(); this.lastCap = w.tick;
    this.hud.toast(`Rewound ${((now - c.tick) / 60).toFixed(0)} s. ${this.rewinds.length} earlier state${this.rewinds.length === 1 ? '' : 's'} remain.`, 'good', 'REWIND');
    this.audio?.event('rewind'); this.renderer.pulse(0.25);
  }
  /** Shift+K: put the whole section back as it was when you entered it (the reset itself can be rewound). */
  resetSection() {
    const cap = this.sectionCaps[this.director.sectionIndex];
    if (!cap) { this.restartSection(); return; }
    this.pushRewind();
    const keep = this.world.recordings.slice();   // experiments should survive a reset: keep what you recorded
    this.world.reinstate(cap);
    keep.forEach((r, i) => { if (r && !this.world.recordings[i]) this.world.loadRecording(i, r); });
    this.hud.toast('Section restored to how you found it. Your recordings were kept. F6 undoes this.', 'good', 'SECTION RESET');
    this.audio?.event('rewind'); this.renderer.pulse(0.25);
  }
  pause() { if (this.state !== 'play') return; this.state = 'pause'; this.input.unlock(); this.menus?.show('pause'); this.audio?.suspend(true); }
  resume() { if (this.state !== 'pause') return; this.state = 'play'; this.menus?.hide(); this.input.lock(); this.audio?.suspend(false); this.last = performance.now(); }
  quickSave() {
    if (!this.world || !this.director) return false;
    const ok = saveSnapshot(this.level.id, this.world, this.director);
    this.hud.toast(ok ? 'Reality snapshot stored.' : 'Storage unavailable — snapshot not saved.', ok ? 'good' : 'warn');
    return ok;
  }
  restartSection() {
    const cp = this.world.checkpoint;
    this.world.teleportPlayer(cp.pos, cp.yaw); this.yaw = cp.yaw;
    this.world.recallCrates();
    this.hud.toast('Returned to checkpoint; crates recalled.', 'warn');
  }

  /** Flags derived from the whole save: the ending seen, the Operator's trust, and the choices that were canonised. */
  storyFlags() {
    const f = {}, rel = this.progress.relations ?? {};
    if (this.progress.ending) f.ending = true;
    for (const [who, n] of Object.entries(rel)) for (let i = 1; i <= n; i++) f[`${who === 'operator' ? 'op' : who}${i}`] = true;
    for (const [ch, v] of Object.entries(this.progress.canon ?? {})) f[`canon:${ch}:${v}`] = true;
    return f;
  }

  // ------------------------------------------------------------------ director messages
  processDirector() {
    for (const m of this.director.drain()) {
      switch (m.kind) {
        case 'event': this.hud.say(m.text, m.who ?? 'THE ARCHIVIST'); break;
        case 'bark': {
          const b = m.bark, pr = this.progress;
          this.hud.say(b.text, b.who ?? 'THE OPERATOR', 7000);
          (pr.seen ??= {})['bark:' + b.id] = true;
          if (b.truth) { pr.truths ??= []; if (!pr.truths.includes(b.truth)) { pr.truths.push(b.truth); this.hud.toast('A truth is recorded in the Archive.', 'disc', 'UNDERSTANDING'); } }
          for (const [who, n] of Object.entries(b.trust ?? {})) { pr.relations ??= {}; pr.relations[who] = (pr.relations[who] ?? 0) + n; }
          saveProgress(pr);
          break;
        }
        case 'section': {
          this.sectionCaps[m.index] = this.world.capture();
          this.hud.setFolio(this.level, m.section); this.hud.showHint(this.settings.hints && false);
          if (m.index > 0 || this.state !== 'loading') this.hud.say(m.section.intro, 'THE ARCHIVIST');
          this.audio?.event('section');
          if (this.settings.autosave && m.index > 0 && this.state === 'play') this.quickSave();
          break;
        }
        case 'caps': {
          if (m.caps.modes) this.hud.toast(`Playback modes: ${m.caps.modes.join(' · ')}`, 'good', 'INSTRUMENT UPGRADE');
          if (m.caps.slots) this.hud.toast(`${m.caps.slots} recording slots`, 'good', 'INSTRUMENT UPGRADE');
          if (m.caps.maxTicks) this.hud.toast(`Recording capacity ${(m.caps.maxTicks / 60).toFixed(0)} s`, 'good', 'INSTRUMENT UPGRADE');
          this.audio?.event('upgrade');
          break;
        }
        case 'discovery': {
          const r = levelRecord(this.progress, this.level.id);
          if (!r.discoveries.includes(m.discovery.id)) r.discoveries.push(m.discovery.id);
          saveProgress(this.progress);
          this.hud.toast(m.discovery.text, 'disc', m.discovery.title, 12000); this.audio?.event('discovery'); this.renderer.pulse(0.1);
          break;
        }
        case 'experiment': {
          const r = levelRecord(this.progress, this.level.id);
          if (!r.experiments.includes(m.experiment.id)) r.experiments.push(m.experiment.id);
          saveProgress(this.progress);
          this.hud.toast(m.experiment.desc, 'good', `EXPERIMENT COMPLETE — ${m.experiment.title}`, 9000); this.audio?.event('discovery');
          break;
        }
        case 'tape': this.hud.toast(`${m.tape.name} loaded into slot ${m.slot + 1}.`, 'good', 'ARCHIVE TAPE'); this.audio?.event('tape'); break;
        case 'complete': this.onComplete(!!m.finale); break;
        default:
      }
    }
  }
  onComplete(finale = false) {
    if (finale) { this.beginEnding(); return; }
    const r = levelRecord(this.progress, this.level.id);
    r.done = true;
    const ticks = this.world.tick;
    if (r.bestTicks === null || ticks < r.bestTicks) r.bestTicks = ticks;
    const idx = CAMPAIGN.indexOf(this.level.id);
    if (idx >= 0) this.progress.unlocked = Math.max(this.progress.unlocked, idx + 2);
    this.progress.stats.recordings += this.world.stats.recordingsMade;
    this.progress.stats.ticks += ticks;
    saveProgress(this.progress);
    this.state = 'ended';
    this.input.unlock();
    this.audio?.event('complete');
    this.menus?.showComplete(this.level, this.director, ticks);
  }

  // ------------------------------------------------------------------ the ending
  beginEnding() {
    this.state = 'cinematic'; this.input.unlock(); this.audio?.event('complete');
    this.hud.cinema(true);
    const R = (id) => id;
    this.cine = {
      t: 0, phase: 'reveal', emu: 0, sun: 0, next: 0, ending: null,
      script: [
        [1, 'Both of you. One standing, one remembered. For the first time since the beginning, they agree.', 'THE ARCHIVIST'],
        [8, 'The chamber stops pretending.', 'THE ARCHIVIST'],
        [14, 'Every hall you walked, every door, every star: recorded. Recording zero. The Last Day.', 'THE ARCHIVIST'],
        [21, 'The tick counter was never a clock. It was a playhead. You are the playhead.', 'THE ARCHIVIST'],
        [28, 'The Recollector did not record the world to study it. It recorded the world so the world would not end — and it needed something to play it back.', 'THE ARCHIVIST'],
        [36, 'Everything you moved was reality’s memory of itself, still holding its shape, still arguing about what is true.', 'THE ARCHIVIST'],
        [44, 'Beyond the last frame is the present. It has been waiting for the recording to finish.', 'THE ARCHIVIST'],
      ],
    };
    this.progress.ending ??= 'seen'; saveProgress(this.progress);
  }
  cineFrame(dt) {
    const c = this.cine, w = this.world;
    c.t += dt;
    this.acc += dt; let n = 0; while (this.acc >= 1 / 60 && n < 4) { w.step(IDLE); this.acc -= 1 / 60; n++; }
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const t = c.t, p = w.player.st;
    if (c.phase === 'reveal') {
      const k = ss(0, 40, t), L = (a, b) => a + (b - a) * k;
      this.renderer.cinematic = { pos: [Math.sin(t * 0.08) * 16 * k, L(p[1] + 1, 62), L(p[2] + 5, -62)], target: [0, L(1.5, 2), L(p[2] - 6, -112)], fov: L(70, 52) };
      c.emu = ss(7, 24, t) * 0.95;
      while (c.next < c.script.length && t >= c.script[c.next][0]) { const [, txt, who] = c.script[c.next++]; this.hud.say(txt, who, 6800); }
      if (t > 52 && !c.asked) { c.asked = true; this.menus.showChoice(() => this.endWith('release'), () => this.endWith('hold')); }
    } else if (c.phase === 'release') {
      const k = ss(0, 9, t - c.t0);
      c.emu = 0.95 * (1 - k); c.sun = k;
      const e = this.renderer.cinematic; if (e) e.pos[1] += dt * 0.5;
      if (t - c.t0 > 9 && !c.credits) { c.credits = true; this.menus.showCredits('release', () => this.toTitle()); }
    } else if (c.phase === 'hold') {
      const a = (t - c.t0) * 0.12;
      this.renderer.cinematic = { pos: [Math.sin(a) * 40, 36, -112 + Math.cos(a) * 40], target: [0, 2, -118], fov: 58 };
      c.emu = 0.95;
      if (t - c.t0 > 8 && !c.credits) { c.credits = true; this.menus.showCredits('hold', () => this.toTitle()); }
    }
    this.renderer.setEmulsion(c.emu, c.sun);
    if (!this.testNoRender) this.renderer.render({ world: w, dt, cam: { x: p[0], y: p[1], z: p[2], yaw: 0, pitch: 0, speed: 0, ground: true }, found: this.director.found, ui: { frame: null, selected: 0 } });
    this.audio?.update(w, this.renderer.camera, dt, {});
  }
  endWith(kind) {
    const c = this.cine; c.phase = kind; c.t0 = c.t; c.credits = false; this.menus.hide(); this.hud.layer.style.display = 'none';
    this.progress.ending = kind; this.progress.sandbox = true;
    const r = levelRecord(this.progress, this.level.id); r.done = true; saveProgress(this.progress);
    this.hud.say(kind === 'release' ? 'The playhead lifts. The first thing the present does is move.' : 'The frame holds. The last day begins again, and you are in it.', 'THE ARCHIVIST', 8000);
    this.audio?.event('complete');
  }

  // ------------------------------------------------------------------ per-frame control
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    this.touchUI?.update(); this.reel?.update();
    if (this.reel?.open && !this._reelTaught) { this._reelTaught = true; this.teach('r-reel', 'THE REEL', 'One lane per recorded object. Marks: ▼ plate ◆ lever ▮ door ♪ note ◉ Eye ✦ light ⚙ machine — bigger matters more. Step , . · jump ; \''); }
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    if (this.state === 'play') this.playFrame(dt);
    else if (this.state === 'title') this.attractFrame(dt);
    else if (this.state === 'cinematic') this.cineFrame(dt);
    else if (this.state === 'pause' || this.state === 'ended') this.drawIdle(dt);
    this.input.endFrame();
  }
  drawIdle(dt) { if (this.world && this.renderer.post) this.renderFrame(dt, 0); }

  handleKeys(dt) {
    const I = this.input, w = this.world;
    if (I.hit('Escape')) { this.pause(); return; }
    if (I.hit('F3')) { this.dev = !this.dev; this.settings.devMode = this.dev; saveSettings(this.settings); }
    if (I.hit('F4')) { this.showTraj = !this.showTraj; this.showVolumes = this.showTraj; }
    if (I.hit('Tab')) this.lensFull = !this.lensFull;
    if (I.hit('KeyH')) { this.hud.showHint(!this.hud.q('#folio .hint').textContent); this.hud.pingFolio(); }
    if (I.hit('F5')) this.quickSave();
    if (I.hit('KeyK')) { if (I.held('ShiftLeft', 'ShiftRight')) this.resetSection(); else this.restartSection(); }
    if (I.hit('F6')) this.rewind();
    for (let n = 0; n < 6; n++) if (I.hit(`Digit${n + 1}`) && n < w.caps.slots) { this.selected = n; this.instr.clear(); this.instr.poke(); this.audio?.event('select'); }
    if (I.hit('KeyQ')) { this.frameMode = !this.frameMode; this.audio?.event('select'); }
    // frame: wheel resizes, click pins, right click clears
    if (this.frameMode || this.pinned) {
      if (I.wheel) {
        const k = -I.wheel * 0.5, h = this.frameHalf, mv = w.caps.maxVolume;
        if (I.held('ShiftLeft', 'ShiftRight')) h[1] = clamp(h[1] + k, 0.5, mv[1] / 2);
        else { h[0] = clamp(h[0] + k, 0.5, mv[0] / 2); h[2] = clamp(h[2] + k, 0.5, mv[2] / 2); h[1] = clamp(h[1] + k * 0.75, 0.5, mv[1] / 2); }
      }
      for (const b of I.clicks) {
        if (b === 0 && this.frameMode) { this.pinned = this.previewVolume(); this.frameMode = false; this.audio?.event('pin'); }
        if (b === 2) { this.pinned = null; this.frameMode = false; this.audio?.event('select'); }
      }
    } else if (I.clicks.includes(2)) { this.frameMode = true; }
    // recording
    if (I.hit('KeyR')) {
      if (w.recorder) { w.stopRecording(); this.audio?.event('rec-stop'); this.renderer.pulse(0.1); }
      else {
        const vol = this.pinned ?? (this.frameMode ? this.previewVolume() : this.defaultVolume());
        if (w.startRecording(this.selected, this.clampVolume(vol), `Recording ${this.selected + 1}`)) { this.pinned = vol; this.frameMode = false; this.instr.clear(); this.instr.poke(); this.audio?.event('rec-start'); this.renderer.pulse(0.14); }
      }
    }
    const pb = w.playbacks[this.selected];
    if (I.hit('KeyT')) this.instr.togglePlay();
    if (I.hit('KeyY')) { w.stop(this.selected); this.instr.clear(); this.instr.poke(); this.audio?.event('stop'); }
    if (I.hit('KeyG')) this.instr.reverse();
    if (I.hit('KeyL')) this.instr.cycleMode();
    if (I.hit('Backspace') && I.held('ShiftLeft', 'ShiftRight')) {
      const r = w.rollbackRecording(this.selected);
      this.hud.toast(r ? `Slot ${this.selected + 1}: restored “${r.name}” (${w.undo[this.selected].length} earlier take${w.undo[this.selected].length === 1 ? '' : 's'} left).` : 'No earlier take in this slot.', r ? 'good' : 'warn', 'ROLLBACK');
    } else if (I.hit('Backspace')) { if (w.recordings[this.selected]) { w.eraseRecording(this.selected); this.instr.clear(); this.hud.toast(`slot ${this.selected + 1} erased`, 'warn'); } }
    if (I.hit('BracketLeft')) this.instr.rate(-1);
    if (I.hit('BracketRight')) this.instr.rate(1);
    this.instr.keys(I, dt);
    // interact / tape pedestals
    if (I.hit('KeyE')) {
      const tape = this.director.nearbyTape();
      const aimed = w.aimedInteractable();
      if (tape && !aimed) this.director.loadTape(tape, this.selected);
      else { if (aimed?.type.name === 'ledger') this.pushRewind(); this.pendingInteract = true; }
    }
    if (I.hit('KeyU')) { const n = w.playAll({ mode: w.playbacks.find((p) => p)?.mode }); if (n) { this.audio?.event('play'); this.hud.toast(`${n} recordings started on the same tick`, 'good'); } }
    if (I.hit('KeyO')) this.selectiveKey(I.held('ShiftLeft', 'ShiftRight'));
    if (I.hit('KeyP') && this.settings.devMode) this.showVolumes = !this.showVolumes;
    if (this.level.sandbox) this.sandboxKeys();
  }
  /** O: leave the aimed object out of its echo (selective playback). Shift+O: replay only that object. */
  selectiveKey(solo) {
    const w = this.world, { o, d } = this.aimRay(), p = w.pick(o, d, 30);
    if (!p) { this.hud.toast('Aim at an object inside a recording, then press O to leave it out of the replay.', 'warn'); return; }
    const slot = p.item.echo ? p.item.layer - 1 : this.selected, id = p.item.id;
    if (!w.recordings[slot]?.tracks.has(id)) { this.hud.toast(`Recording ${slot + 1} does not contain ${id}. Select the slot whose echo holds it.`, 'warn'); return; }
    const keep = this.selected; this.selected = slot; const r = this.instr.lane(id, solo); this.selected = keep;
    this.teach('r-selective', 'SELECTIVE PLAYBACK', 'A recording is a bundle of histories, one per object. Leave one out (O) and the echo replays without it; isolate one (Shift+O) and only that object’s history returns. What is left out simply did not happen — in that echo.');
    if (solo) this.hud.toast(r ? `Recording ${slot + 1} now replays only ${id}.` : `Recording ${slot + 1} replays everything again.`, 'good', 'SELECTIVE PLAYBACK');
    else this.hud.toast(r ? `${id} is left out of recording ${slot + 1}.` : `${id} returns to recording ${slot + 1}.`, 'good', 'SELECTIVE PLAYBACK');
  }
  // ------------------------------------------------------------------ sandbox toolkit
  sandboxKeys() {
    const I = this.input, w = this.world, sb = this.sb;
    if (I.hit('KeyB')) { sb.item = (sb.item + 1) % SPAWNABLE.length; }
    if (I.hit('KeyJ')) { sb.note = (sb.note % 7) + 1; }
    if (I.hit('Enter')) {
      const hit = this.aimHit(30), item = SPAWNABLE[sb.item];
      if (hit.t !== null) { w.spawn(item.make([Math.round(hit.p[0] * 2) / 2, Math.max(0, hit.p[1]), Math.round(hit.p[2] * 2) / 2], sb.note)); this.audio?.event('pin'); }
    }
    const aimed = () => { const { o, d } = this.aimRay(); const p = w.pick(o, d, 30); return p && !p.item.echo ? p.item : null; };
    if (I.hit('Delete')) { const a = aimed(); if (a?.def.dyn) { w.removeEntity(a.id); w.refreshDerived(); this.audio?.event('stop'); } }
    if (I.hit('KeyX')) { const a = aimed(); if (a && Array.isArray(a.def.in)) { a.def.in = []; this.hud.toast(`${a.id}: inputs cleared`, ''); } }
    if (I.hit('KeyF')) {
      const a = aimed(); if (!a) return;
      if (!sb.link) { sb.link = a.id; this.hud.toast(`Link source: ${a.id}. Now aim at a sink and press F.`, 'good'); }
      else if (Array.isArray(a.def.in)) {
        const tag = I.held('ShiftLeft', 'ShiftRight') ? `!${sb.link}` : sb.link;
        if (!a.def.in.includes(tag)) a.def.in.push(tag);
        this.hud.toast(`${a.id} ← ${tag}`, 'good'); sb.link = null; this.audio?.event('lever');
      } else { this.hud.toast(`${a.id} cannot take an input.`, 'warn'); sb.link = null; }
    }
  }

  defaultVolume() {
    const p = this.world.player.st, h = this.frameHalf;
    return { x0: p[0] - h[0], x1: p[0] + h[0], y0: p[1] - 1.2, y1: p[1] - 1.2 + h[1] * 2, z0: p[2] - h[2], z1: p[2] + h[2] };
  }
  clampVolume(v) {
    const mv = this.world.caps.maxVolume, c = [(v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, (v.z0 + v.z1) / 2];
    const h = [Math.min((v.x1 - v.x0) / 2, mv[0] / 2), Math.min((v.y1 - v.y0) / 2, mv[1] / 2), Math.min((v.z1 - v.z0) / 2, mv[2] / 2)];
    return { x0: c[0] - h[0], x1: c[0] + h[0], y0: c[1] - h[1], y1: c[1] + h[1], z0: c[2] - h[2], z1: c[2] + h[2] };
  }
  aimRay() {
    const e = this.world.eye();
    const cp = Math.cos(this.pitch);
    return { o: e, d: [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp] };
  }
  aimHit(maxT = 40) {
    const { o, d } = this.aimRay();
    let bt = maxT;
    for (const s of this.world.solids) {
      if (!s.block || s.item === this.world.player) continue;
      const t = rayBox(o[0], o[1], o[2], d[0], d[1], d[2], s.b, bt);
      if (t >= 0 && t < bt) bt = t;
    }
    return { t: bt < maxT ? bt : null, p: [o[0] + d[0] * bt, o[1] + d[1] * bt, o[2] + d[2] * bt] };
  }
  previewVolume() {
    const hit = this.aimHit(30), h = this.frameHalf, sn = (v) => Math.round(v * 2) / 2;
    const cx = sn(hit.p[0]), cy = sn(Math.max(hit.p[1], 0) + h[1] * 0.55), cz = sn(hit.p[2]);
    return { x0: cx - h[0], x1: cx + h[0], y0: cy - h[1], y1: cy + h[1], z0: cz - h[2], z1: cz + h[2] };
  }

  playFrame(dt) {
    const I = this.input, w = this.world;
    // look
    const sens = 0.0022 * this.settings.sensitivity;
    this.instr.jogging = I.held('ControlLeft', 'ControlRight') && !!this.instr.rec && !w.recorder; // Ctrl turns the mouse into the jog wheel
    if (!this.instr.jogging) this.yaw -= I.dx * sens; if (!this.instr?.jogging) this.pitch = clamp(this.pitch - I.dy * sens * (this.settings.invertY ? -1 : 1), -1.45, 1.45);
    this.handleKeys(dt);
    if (this.state !== 'play') return;
    // fixed-step simulation
    this.acc += dt;
    let steps = 0;
    const mx = (I.held('KeyD') ? 1 : 0) - (I.held('KeyA') ? 1 : 0), mz = (I.held('KeyW') ? 1 : 0) - (I.held('KeyS') ? 1 : 0);
    const tone = NOTE_KEYS.findIndex((k) => I.held(k)) + 1;
    const jump = I.held('Space');
    while (!this.testHold && this.acc >= 1 / 60 && steps < 6) {
      this.prev.set(w.player.st);
      w.step({ mx, mz, jump, interact: this.pendingInteract, tone, yaw: this.yaw, pitch: this.pitch, slot: this.selected });
      this.pendingInteract = false;
      this.director.update();
      this.handleEvents();
      this.acc -= 1 / 60; steps++;
    }
    if (steps === 6) this.acc = 0;
    if (w.tick - this.lastCap >= 300 && !w.recorder) this.pushRewind();
    this.processDirector();
    this.cur.set(w.player.st);
    this.audio?.update(w, this.renderer.camera, dt, { tone });
    this.renderFrame(dt, this.acc * 60);
    this.runCoach(dt);
    this.observe();
    this.hud.update(this.hudModel(tone));
  }
  runCoach(dt) {
    if (this.level.id !== 'ch1' || !this.settings.hints || this.director.sectionIndex !== 0) return;
    const c = this.coach, w = this.world; c.t += dt;
    const say = (t) => { if (c.said !== t) { c.said = t; this.hud.say(t, 'RECOLLECTOR', 60000); } };
    if (c.step === 0) { if (c.t > 6) say('Walk to the plate. Press Q, aim at it, and click to pin a recording volume around it.'); if (this.pinned || w.recorder) c.step = 1; }
    else if (c.step === 1) { say('Stand on the plate, then press R. Everything inside the frame is being remembered.'); if (w.recorder) c.step = 2; }
    else if (c.step === 2) { say('Stay still for a few seconds, then press R again to store the recording.'); if (!w.recorder && w.recordings[0]) c.step = 3; }
    else if (c.step === 3) { say('Step off the plate, then press T to play it back. Press L first to loop.'); if (w.playbacks[0]?.active) c.step = 4; }
    else if (c.step === 4) { c.said = null; this.hud.subtitle.style.opacity = 0; c.step = 5; }
  }
  /** One-time explanations of the reconciliation rules, shown the first time the player meets each. */
  /** Visual voice of each verb: a ring and sparks where the echo is, and a wash at the edge of the view. */
  feel(kind, slot, id = null) {
    const W = { play: [0xe8c88a, 'out'], forward: [0xe8c88a, 'out'], reverse: [0xe0944a, 'in'], slow: [0x9db4c8, 'out'], fast: [0xd8d8e4, 'out'], loop: [0xf0d890, 'out'],
      freeze: [0xf2f8ff, 'out'], thaw: [0xbcd8f0, 'out'], omit: [0x8c6a8e, 'in'], unomit: [0x8c6a8e, 'out'], solo: [0xffe6a8, 'out'], mode: [0xcccccc, 'out'] }[kind];
    if (!W) return;
    const pb = this.world.playbacks[slot], it = (id && pb?.items.get(id)) || pb?.items.get('player');
    const pos = it?.alive ? [it.st[0], it.st[1] - 0.8, it.st[2]] : [...this.world.player.st.slice(0, 3)];
    this.renderer.burst(pos, { color: W[0], size: kind === 'freeze' ? 3.2 : 2.4, dur: kind === 'slow' ? 1.4 : 0.8, sparks: kind === 'freeze' ? 30 : kind === 'solo' ? 24 : 12, speed: kind === 'freeze' ? 1.4 : 3, inward: W[1] === 'in' });
    this.hud.wash(kind);
  }
  teach(key, title, text, kind = '') {
    const seen = this.progress.seen;
    if (seen[key]) return; seen[key] = 1; saveProgress(this.progress);
    this.hud.toast(text, kind || 'good', title, 14000);
  }
  /** The Archivist notices how you play. */
  react(key, text, ms = 7000) {
    const seen = this.progress.seen;
    if (seen[key]) return; seen[key] = 1; saveProgress(this.progress);
    this.hud.say(text, 'THE ARCHIVIST', ms);
  }
  observe() {
    const w = this.world; if (!w || this.level.sandbox) return;
    for (const c of w.conflicts) {
      if (c.kind === 'state') this.teach('r-state', 'RULE — RECONCILIATION', 'The same object disagrees across histories (gold outline). Doors: open in any history ⇒ open. Bridges and matter: present in any history ⇒ present. Signals: powered in any history ⇒ powered. Flywheels: histories add.', '');
      else if (c.kind === 'overlap') this.teach('r-overlap', 'RULE — TEMPORAL COLLISION', 'Two histories claim the same matter (white-hot shell). Overlap drains the recordings’ coherence; at zero an echo collapses. Cross quickly, or keep histories apart.', 'warn');
      else if (c.kind === 'displace') this.teach('r-displace', 'RULE — DISPLACEMENT', 'Echo matter is solid. A body it overlaps is shoved out along the shortest axis, and carried if it stands on it.', 'warn');
    }
    if (w.overruled.size) this.teach('r-aperture', 'RULE — APERTURES', 'A door held open by any history is open for everyone. The present door is still closed — it has simply been overruled.');
    for (const [k, v] of w.R) if (v > 1.5 && w.byId.get(k)?.def.type === 'flywheel') { this.teach('r-sum', 'RULE — SUPERPOSITION', 'Machine histories add: a flywheel at 1.0 now and 1.0 remembered reads 2.0. Governors compare the sum.'); break; }
    if (w.playbacks.some((p) => p?.active && p.mode === 'hold')) this.teach('r-hold', 'HOLD', 'A held recording keeps its final frame in the world. What was, stays.');
    const n = w.stats.recordingsMade;
    if (n >= 1) this.react('n-first', 'Your first recording. Notice that the world did not pause for it. It never does.');
    if (w.playbacks.some((p) => p?.active)) this.react('n-echo', 'That is you, a few seconds ago, still doing whatever you were doing. Try not to feel judged.');
    if (n + this.progress.stats.recordings >= 12) this.react('n-12', 'Twelve recordings. You are beginning to repeat yourself — which is, I suppose, the point.');
    if (w.playbacks.filter((p) => p?.active).length >= 3) this.react('n-three', 'Three histories at once. Some rooms are now more past than present.');
    if (this.progress.stats.deaths >= 5) this.react('n-falls', 'Falling is only a short recording you did not intend to make.');
  }
  onCanon(e) {
    if (!e.built) return; // the ledger's own interact result also surfaces as a bare 'canon' event; the real one carries what changed
    const spec = this.level.canon?.[e.source];
    if (spec) { this.progress.canon[spec.key] = spec.value; saveProgress(this.progress); }
    this.teach('r-canon', 'RULE — CANON', 'A history entered in the ledger becomes real: its final frame is now the present, and every object it touched stops listening to any other history. Only rewinding (F6) can undo it.', 'warn');
    this.hud.toast(`“${e.name}” is now the record. ${e.built.length ? `Built: ${e.built.join(', ')}. ` : ''}${e.adopted.length ? `Adopted: ${e.adopted.join(', ')}.` : ''}`, 'disc', 'CANON', 12000);
    this.audio?.event('canon'); this.renderer.pulse(0.45); this.renderer.burst([...this.world.player.st.slice(0, 3)], { color: 0xffd88a, size: 9, dur: 1.6, sparks: 60, speed: 6 }); this.hud.flash(0.3);
    if (spec) this.hud.say(spec.value === 'archive' ? 'You chose the Archive. Somewhere the Observatory is a story nobody finished.' : 'You chose the Observatory. Somewhere the Archive is a room nobody opened.', 'THE ARCHIVIST', 9000);
  }
  handleEvents() {
    for (const e of this.world.drainEvents()) {
      switch (e.type) {
        case 'fell': case 'crushed': this.progress.stats.deaths++; this.hud.toast(e.type === 'fell' ? 'Temporal shock: returned to the last checkpoint.' : 'Crushed between histories. Returned to checkpoint.', 'warn'); this.audio?.event('shock'); this.renderer.pulse(0.3); this.yaw = this.world.checkpoint.yaw; break;
        case 'collapse': this.teach('r-collapse', 'COLLAPSE', 'Coherence reached zero. The echo is gone but the recording is intact. History can be replayed; it just cannot be forced.', 'warn'); this.hud.toast(`Recording ${e.slot + 1} lost coherence and collapsed. It is still stored — replay it more carefully.`, 'warn'); this.audio?.event('collapse'); this.renderer.pulse(0.2); this.renderer.burst([...this.world.player.st.slice(0, 3)], { color: 0xff6a4a, size: 4, sparks: 24 }); break;
        case 'record-stop': this.hud.toast(`Recording ${e.slot + 1} stored — ${(e.ticks / 60).toFixed(1)} s, ${e.keyframes} keyframes.`, 'good'); break;
        case 'zapped': this.progress.stats.deaths++; this.teach('r-hazard', 'HAZARD', 'Moving hazards are matter that hurts. Echoes of hazards hurt too — history is not safer than the present.', 'warn'); this.hud.toast('Zapped. Returned to the last checkpoint.', 'warn'); this.audio?.event('shock'); this.renderer.pulse(0.3); this.yaw = this.world.checkpoint.yaw; break;
        case 'ledger-empty': this.hud.toast('The ledger needs a recording. Select a slot that holds a history (1–6) and press E again.', 'warn'); break;
        case 'ledger-refuse': this.hud.toast('This ledger does not recognise that history. It records only the charter whose bridge leads here.', 'warn', 'LEDGER'); break;
        case 'canon': this.onCanon(e); break;
        case 'reconcile': this.renderer.burst(e.pos, { color: 0xe8c88a, size: 2.2, dur: 0.8, sparks: 10, speed: 2 }); break;
        case 'shatter': this.audio?.event('collapse'); this.renderer.burst(e.pos, { color: 0xbfe4ff, size: 3.5, dur: 1.0, sparks: 40, speed: 5 }); this.renderer.pulse(0.15); this.hud.toast('The glass was only ever a note. It could not hold the pitch.', 'disc', 'SHATTERED'); break;
        case 'seen': this.teach('r-eye', 'THE EYE', 'An Eye sees any Recollector inside its gaze — you, or any echo of you. It does not see objects, and it cannot see through matter, remembered matter included. What it sees, it reports.', 'warn'); this.audio?.event('select'); break;
        case 'rollback': break;
        case 'record-empty': this.hud.toast('The volume was empty — nothing was recorded. Pin the frame around something (Q, aim, click).', 'warn'); break;
        case 'crate-lost': this.hud.toast('A crate fell out of reality and was recalled.', 'warn'); break;
        case 'lever-on': case 'lever-off': case 'mirror-turn': this.audio?.event('lever'); break;
        case 'held': case 'ended': this.audio?.event('end'); break;
        default:
      }
    }
  }
  renderFrame(dt, alpha) {
    if (this.testNoRender) return; // test hook: step the game without paying for a software-rendered frame
    const w = this.world, p = this.cur, q = this.prev;
    const cam = { x: lerp(q[0], p[0], alpha), y: lerp(q[1], p[1], alpha), z: lerp(q[2], p[2], alpha), yaw: this.yaw, pitch: this.pitch, speed: Math.hypot(p[3], p[5]), ground: p[9] > 0.5, vy: p[4], side: p[3] * Math.cos(this.yaw) - p[5] * Math.sin(this.yaw) };
    let frame = null, color = 0xffffff;
    if (w.recorder) { frame = w.recorder.rec.volume; color = 0xff8a5a; }
    else if (this.pinned) { frame = this.pinned; color = SLOT_HEX[this.selected % 6]; }
    else if (this.frameMode) { frame = this.previewVolume(); color = 0xe8c88a; }
    this.renderer.render({ world: w, dt, cam, found: this.director.found, ui: { ghost: this.instr.ghost(), frame, frameColor: color, recording: !!w.recorder, selected: this.selected, showVolumes: this.showVolumes, showTraj: this.showTraj } });
  }
  /** One line of cause for what the Recollector is looking at: what it listens to, and which history is answering. */
  whyText(x) {
    if (!x || !(x.inputs.length || x.contributions.length > 1)) return '';
    const bits = x.inputs.map((i) => {
      const src = i.layers.filter((l) => l.value > 0.5).map((l) => (l.layer === 0 ? 'now' : `rec ${l.slot + 1}`) + (l.heldBy?.length ? ` via ${l.heldBy.map((h) => (h === 0 ? 'you' : 'rec ' + h)).join('+')}` : ''));
      return `${i.negated ? '¬' : ''}${i.id} ${i.pass ? '●' : '○'}${src.length ? ' (' + src.join(', ') + ')' : ''}`;
    });
    const tags = [x.sealed && 'sealed', x.pinned !== null && x.pinned !== undefined && 'pinned', x.overruled && 'overruled', x.echoDriven && 'answered by an echo'].filter(Boolean);
    return [x.inputs.length ? `${x.logic === 'or' ? 'any of' : 'all of'}: ${bits.join(' · ')}` : '', tags.join(' · ')].filter(Boolean).join('  —  ');
  }
  hudModel(tone) {
    const w = this.world;
    const { o, d } = this.aimRay();
    const hit = this.aimHit(40);
    const pick = w.pick(o, d, hit.t ?? 40);
    let aimLabel = '', aimWhy = '', cmp = null;
    if (pick && (hit.t === null || pick.t <= hit.t + 0.05) && pick.item.def.type !== 'wall') {
      cmp = w.compare(pick.item.id);
      aimLabel = pick.item.echo ? `rec ${pick.item.layer} ▸ ${pick.item.def.type}` : pick.item.def.type;
      if (pick.item.type.interact && !pick.item.echo) aimLabel += ' — E';
      aimWhy = this.whyText(w.explain(pick.item.id));
    }
    const tape = this.director.nearbyTape();
    const legend = this.legend(tone, tape);
    return {
      world: w, level: this.level, ui: { selected: this.selected }, time: this.renderer.clock, aimDist: hit.t, aimLabel, aimWhy, aimCompare: cmp, lensFull: this.lensFull,
      idle: this.input.idleFor(), anyRec: w.recordings.some((r) => r), frameUi: this.frameMode || !!this.pinned,
      dev: this.dev, perf: { fps: this.fps, ...this.renderer.stats }, legend, sectionIndex: this.director.sectionIndex,
    };
  }
  legend(tone, tape) {
    const k = (a, b) => `<kbd>${a}</kbd>${b}`;
    const w = this.world;
    if (w.recorder) return k('R', 'stop recording') + k('1-' + w.caps.slots, 'slot');
    const parts = [k('Q', 'frame'), k('R', 'record')];
    if (this.frameMode) parts.unshift(k('LMB', 'pin volume'), k('wheel', 'size'));
    if (w.playbacks[this.selected]) parts.push(k('T', 'play/pause'), k('Y', 'stop'), k('L', 'mode'), k('G', 'reverse'), k(', .', 'step 1 tick'), k('F', 'freeze'), k('Ctrl+mouse', 'jog'));
    if (w.level.id !== 'ch1' || this.director.sectionIndex >= 0) parts.push(k('E', 'use'));
    if (w.level.sound || w.level.id !== 'ch1') parts.push(k('Z–M', `voice${tone ? ' ' + NOTE_NAMES[tone - 1] : ''}`));
    if (tape) parts.unshift(k('E', `load tape: ${tape.name}`));
    parts.push(k('F6', `rewind (${this.rewinds.length})`));
    if (this.level.sandbox) parts.push(k('B', `item: ${SPAWNABLE[this.sb.item].label}`), k('J', `note ${NOTE_NAMES[this.sb.note - 1]}`), k('Enter', 'place'), k('F', this.sb.link ? `link ${this.sb.link} →` : 'link'));
    return parts.join('');
  }
}
