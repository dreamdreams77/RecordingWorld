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
import { loadProgress, saveProgress, levelRecord, saveSnapshot, loadSnapshot } from './progress.js';

const NOTE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'];
const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const RATES = [0.25, 0.5, 1, 2, 4];
const SLOT_HEX = [0xffa94d, 0x62e0b4, 0xff6459, 0xb7a0ff, 0xd5f25c, 0xffc2d4];

export class Game {
  constructor(root, { audio = null, menus = null } = {}) {
    this.root = root;
    this.settings = loadSettings();
    this.progress = loadProgress();
    this.canvas = root.querySelector('canvas#view');
    this.input = new Input(this.canvas, (locked) => this.onLock(locked));
    this.hud = new HUD(root);
    this.audio = audio; this.menus = menus;
    this.state = 'boot'; // boot | menu | loading | play | pause | cinematic | ended
    this.world = null; this.director = null; this.level = null;
    this.frameHalf = [3, 2.25, 3]; this.pinned = null; this.frameMode = false; this.selected = 0;
    this.yaw = 0; this.pitch = 0; this.lensFull = false; this.showVolumes = false; this.showTraj = false; this.dev = this.settings.devMode;
    this.acc = 0; this.last = performance.now(); this.fpsAcc = 0; this.fps = 60; this.pendingInteract = false;
    this.prev = new Float64Array(10); this.cur = new Float64Array(10);
    this.renderer = new GameRenderer(this.canvas, this.settings);
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
    saveSettings(s);
  }
  onLock(locked) {
    if (!locked && this.state === 'play') this.pause();
  }

  // ------------------------------------------------------------------ level lifecycle
  async startLevel(id, { snapshot = null, loadingCb = () => {} } = {}) {
    const level = LEVELS[id];
    this.state = 'loading';
    this.level = level;
    this.world = new World(level, { caps: { modes: level.caps.modes } });
    this.director = new Director(this.world, level, this.progress.levels[id]);
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
    if (!snapshot && this.director.sectionIndex <= 0) this.hud.say(level.narrative?.intro ?? this.director.section?.intro ?? '', 'THE ARCHIVIST', 8000);
    this.acc = 0; this.last = performance.now();
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

  // ------------------------------------------------------------------ director messages
  processDirector() {
    for (const m of this.director.drain()) {
      switch (m.kind) {
        case 'section': {
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
        case 'complete': this.onComplete(); break;
        default:
      }
    }
  }
  onComplete() {
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

  // ------------------------------------------------------------------ per-frame control
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.05;
    if (this.state === 'play') this.playFrame(dt);
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
    if (I.hit('KeyH')) this.hud.showHint(!this.hud.q('#folio .hint').textContent);
    if (I.hit('F5')) this.quickSave();
    if (I.hit('KeyK')) this.restartSection();
    for (let n = 0; n < 6; n++) if (I.hit(`Digit${n + 1}`) && n < w.caps.slots) { this.selected = n; this.audio?.event('select'); }
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
        if (w.startRecording(this.selected, this.clampVolume(vol), `Recording ${this.selected + 1}`)) { this.pinned = vol; this.frameMode = false; this.audio?.event('rec-start'); this.renderer.pulse(0.14); }
      }
    }
    const pb = w.playbacks[this.selected];
    if (I.hit('KeyT')) { if (pb) { w.togglePlay(this.selected); this.audio?.event('play'); } }
    if (I.hit('KeyY')) { w.stop(this.selected); this.audio?.event('stop'); }
    if (I.hit('KeyG')) w.reverse(this.selected);
    if (I.hit('KeyL')) { const m = w.cycleMode(this.selected); if (m) this.hud.toast(`slot ${this.selected + 1}: ${m}`, ''); }
    if (I.hit('Backspace')) { if (w.recordings[this.selected]) { w.eraseRecording(this.selected); this.hud.toast(`slot ${this.selected + 1} erased`, 'warn'); } }
    if (I.hit('BracketLeft') && pb) { const i = RATES.indexOf(Math.abs(pb.rate)); w.setRate(this.selected, RATES[Math.max(0, i - 1)]); }
    if (I.hit('BracketRight') && pb) { const i = RATES.indexOf(Math.abs(pb.rate)); w.setRate(this.selected, RATES[Math.min(RATES.length - 1, i + 1)]); }
    const sh = I.held('ShiftLeft', 'ShiftRight') ? 4 : 1;
    if (I.held('Comma')) w.scrub(this.selected, -2 * sh);
    if (I.held('Period')) w.scrub(this.selected, 2 * sh);
    // interact / tape pedestals
    if (I.hit('KeyE')) {
      const tape = this.director.nearbyTape();
      if (tape && !w.aimedInteractable()) this.director.loadTape(tape, this.selected);
      else this.pendingInteract = true;
    }
    if (I.hit('KeyP') && this.settings.devMode) this.showVolumes = !this.showVolumes;
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
    this.yaw -= I.dx * sens; this.pitch = clamp(this.pitch - I.dy * sens * (this.settings.invertY ? -1 : 1), -1.45, 1.45);
    this.handleKeys(dt);
    if (this.state !== 'play') return;
    // fixed-step simulation
    this.acc += dt;
    let steps = 0;
    const mx = (I.held('KeyD') ? 1 : 0) - (I.held('KeyA') ? 1 : 0), mz = (I.held('KeyW') ? 1 : 0) - (I.held('KeyS') ? 1 : 0);
    const tone = NOTE_KEYS.findIndex((k) => I.held(k)) + 1;
    const jump = I.held('Space');
    while (this.acc >= 1 / 60 && steps < 6) {
      this.prev.set(w.player.st);
      w.step({ mx, mz, jump, interact: this.pendingInteract, tone, yaw: this.yaw, pitch: this.pitch });
      this.pendingInteract = false;
      this.director.update();
      this.handleEvents();
      this.acc -= 1 / 60; steps++;
    }
    if (steps === 6) this.acc = 0;
    this.processDirector();
    this.cur.set(w.player.st);
    this.audio?.update(w, this.renderer.camera, dt, { tone });
    this.renderFrame(dt, this.acc * 60);
    this.hud.update(this.hudModel(tone));
  }
  handleEvents() {
    for (const e of this.world.drainEvents()) {
      switch (e.type) {
        case 'fell': case 'crushed': this.progress.stats.deaths++; this.hud.toast(e.type === 'fell' ? 'Temporal shock: returned to the last checkpoint.' : 'Crushed between histories. Returned to checkpoint.', 'warn'); this.audio?.event('shock'); this.renderer.pulse(0.3); this.yaw = this.world.checkpoint.yaw; break;
        case 'collapse': this.hud.toast(`Recording ${e.slot + 1} lost coherence and collapsed. It is still stored — replay it more carefully.`, 'warn'); this.audio?.event('collapse'); this.renderer.pulse(0.2); break;
        case 'record-stop': this.hud.toast(`Recording ${e.slot + 1} stored — ${(e.ticks / 60).toFixed(1)} s, ${e.keyframes} keyframes.`, 'good'); break;
        case 'crate-lost': this.hud.toast('A crate fell out of reality and was recalled.', 'warn'); break;
        case 'lever-on': case 'lever-off': case 'mirror-turn': this.audio?.event('lever'); break;
        case 'held': case 'ended': this.audio?.event('end'); break;
        default:
      }
    }
  }
  renderFrame(dt, alpha) {
    const w = this.world, p = this.cur, q = this.prev;
    const cam = { x: lerp(q[0], p[0], alpha), y: lerp(q[1], p[1], alpha), z: lerp(q[2], p[2], alpha), yaw: this.yaw, pitch: this.pitch, speed: Math.hypot(p[3], p[5]), ground: p[9] > 0.5 };
    let frame = null, color = 0xffffff;
    if (w.recorder) { frame = w.recorder.rec.volume; color = 0xff8a5a; }
    else if (this.pinned) { frame = this.pinned; color = SLOT_HEX[this.selected % 6]; }
    else if (this.frameMode) { frame = this.previewVolume(); color = 0xe8c88a; }
    this.renderer.render({ world: w, dt, cam, ui: { frame, frameColor: color, recording: !!w.recorder, selected: this.selected, showVolumes: this.showVolumes, showTraj: this.showTraj } });
  }
  hudModel(tone) {
    const w = this.world;
    const { o, d } = this.aimRay();
    const hit = this.aimHit(40);
    const pick = w.pick(o, d, hit.t ?? 40);
    let aimLabel = '', cmp = null;
    if (pick && (hit.t === null || pick.t <= hit.t + 0.05) && pick.item.def.type !== 'wall') {
      cmp = w.compare(pick.item.id);
      aimLabel = pick.item.echo ? `rec ${pick.item.layer} ▸ ${pick.item.def.type}` : pick.item.def.type;
      if (pick.item.type.interact && !pick.item.echo) aimLabel += ' — E';
    }
    const tape = this.director.nearbyTape();
    const legend = this.legend(tone, tape);
    return {
      world: w, level: this.level, ui: { selected: this.selected }, time: this.renderer.clock, aimDist: hit.t, aimLabel, aimCompare: cmp, lensFull: this.lensFull,
      dev: this.dev, perf: { fps: this.fps, ...this.renderer.stats }, legend, sectionIndex: this.director.sectionIndex,
    };
  }
  legend(tone, tape) {
    const k = (a, b) => `<kbd>${a}</kbd>${b}`;
    const w = this.world;
    if (w.recorder) return k('R', 'stop recording') + k('1-' + w.caps.slots, 'slot');
    const parts = [k('Q', 'frame'), k('R', 'record')];
    if (this.frameMode) parts.unshift(k('LMB', 'pin volume'), k('wheel', 'size'));
    if (w.playbacks[this.selected]) parts.push(k('T', 'play/pause'), k('Y', 'stop'), k('L', 'mode'), k('G', 'reverse'), k(', .', 'scrub'));
    if (w.level.id !== 'ch1' || this.director.sectionIndex >= 0) parts.push(k('E', 'use'));
    if (w.level.sound || w.level.id !== 'ch1') parts.push(k('Z–M', `voice${tone ? ' ' + NOTE_NAMES[tone - 1] : ''}`));
    if (tape) parts.unshift(k('E', `load tape: ${tape.name}`));
    return parts.join('');
  }
}
