// The Director layers campaign logic over a World without touching simulation rules:
// sections and checkpoints, capability unlocks, discoveries, optional experiments, archive tapes
// and level completion. Pure logic (no DOM) so the headless solvers exercise exactly what players do.

import { generateArchive } from './archive.js';
import { containsPoint } from './math.js';

const bx = (a) => ({ x0: a[0], y0: a[1], z0: a[2], x1: a[3], y1: a[4], z1: a[5] });

export class Director {
  constructor(world, level, progress = null) {
    this.w = world; this.level = level;
    this.sectionIndex = -1;
    this.found = new Set(progress?.discoveries ?? []);
    this.done = new Set(progress?.experiments ?? []);
    this.completed = false;
    this.messages = [];
    this.sections = (level.sections ?? []).map((s) => ({ ...s, box: bx(s.trigger) }));
    this.discoveries = (level.discoveries ?? []).map((d) => ({ ...d }));
    this.experiments = level.experiments ?? [];
    this.tapes = level.tapes ?? [];
    this.exitBox = level.exit ? bx(level.exit.box) : null;
    this.stats = { recordings: 0, ticks: 0 };
    this.update(); // enters the first section
  }
  get section() { return this.sections[this.sectionIndex] ?? null; }
  say(kind, data) { this.messages.push({ kind, ...data }); }
  drain() { const m = this.messages; this.messages = []; return m; }

  update() {
    const w = this.w, p = w.player?.st;
    if (!p) return;
    this.stats.ticks++;
    this.stats.recordings = w.stats.recordingsMade;
    // sections: highest-index trigger the player is inside becomes current
    for (let i = this.sections.length - 1; i > this.sectionIndex; i--) {
      if (containsPoint(this.sections[i].box, p[0], p[1], p[2])) { this.enterSection(i); break; }
    }
    for (const d of this.discoveries) {
      if (this.found.has(d.id)) continue;
      if (Math.hypot(p[0] - d.pos[0], p[1] - d.pos[1], p[2] - d.pos[2]) < (d.radius ?? 1.4)) { this.found.add(d.id); this.say('discovery', { discovery: d }); }
    }
    for (const x of this.experiments) {
      if (!this.done.has(x.id) && (w.R.get(x.signal) ?? 0) > 0.5) { this.done.add(x.id); this.say('experiment', { experiment: x }); }
    }
    if (!this.completed && this.exitBox && containsPoint(this.exitBox, p[0], p[1], p[2])) { this.completed = true; this.say('complete', {}); }
  }
  enterSection(i) {
    this.sectionIndex = i;
    const s = this.sections[i];
    if (s.checkpoint) this.w.checkpoint = { pos: [...s.checkpoint.pos], yaw: s.checkpoint.yaw ?? 0 };
    if (s.caps) {
      const before = this.w.caps;
      Object.assign(this.w.caps, s.caps);
      if (s.caps.slots) this.w.setSlots(s.caps.slots);
      const gained = (s.caps.modes ?? []).filter((m) => !before.modes?.includes?.(m));
      this.say('caps', { caps: s.caps, section: s });
    }
    this.say('section', { section: s, index: i });
  }
  /** Nearest tape pedestal within reach, or null. */
  nearbyTape() {
    const p = this.w.player.st;
    for (const t of this.tapes) if (Math.hypot(p[0] - t.pos[0], p[2] - t.pos[2]) < (t.radius ?? 2.4) && Math.abs(p[1] - t.pos[1]) < 3) return t;
    return null;
  }
  loadTape(tape, slot) {
    const arch = this.level.archives.find((a) => a.id === tape.archive);
    const rec = generateArchive(this.level, arch);
    this.w.loadRecording(slot, rec);
    this.say('tape', { tape, slot });
    return rec;
  }
}
