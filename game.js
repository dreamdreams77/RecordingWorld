// src/game.js
// Headless game controller. Owns the world, the recordings, the playbacks,
// the level progression, and the player's verbs. Contains no DOM code so the
// test suite can play the game exactly as the player does.

import { LEVELS, buildLevel } from './levels.js';
import { step, spawnBall, bodyTouchesRect, hashWorld, WORLD_W, WORLD_H } from './sim.js';
import { Recorder, Playbacks } from './recording.js';

const MIN_REGION = 40;

const SHORT = {
  presence: 'PRESENCE BLOCKS MEMORY',
  memory: 'MEMORY WRITE',
  contradiction: 'ECHO DRIFTS FROM MEMORY',
  ghost: 'ECHO GHOSTED',
};

// Hidden discoveries. Each is found once, the first time its trigger happens, and is kept
// between sessions by the presentation layer. They are never listed in advance.
export const DISCOVERIES = {
  'found:presence': 'The doorway waited. Memory is patient, not absent.',
  'found:memory': 'The past does not replay itself. It is written into the present, frame by frame.',
  'found:contradiction': 'An echo can disagree with the world it came from. The world usually wins.',
  'found:ghost': 'A ghost is not a bug. It is a memory that the present refused to become.',
  'found:open-lab': 'Nothing is left to solve. The lab keeps every experiment you make.',
  'found:echo-light': 'An echo can carry light as well as weight. The lamp is dark, yet the sensor still lights.',
  'found:echo-plate': 'An echo presses a plate just as a ball does. The door cannot tell them apart.',
  'found:emitter': 'Something in the room makes things on a schedule. The machine keeps its own time.',
  'found:two-pasts': 'Two pasts can share one room. Each keeps its own timing, and neither waits for the other.',
};
export const DISCOVERY_COUNT = Object.keys(DISCOVERIES).length;

const DISCOVERY_FOR_CONFLICT = {
  presence: 'found:presence',
  memory: 'found:memory',
  contradiction: 'found:contradiction',
  ghost: 'found:ghost',
};

// Shown in full the first time each kind of conflict happens in a session.
const EXPLAIN = {
  presence: 'PRESENCE: something is standing in the doorway. The memory waits until the way is clear.',
  memory: 'MEMORY: a recorded change was replayed into the world on the frame it originally happened.',
  contradiction: 'CONTRADICTION: an echo cannot follow its memory. Something in the world disagrees with it.',
  ghost: 'GHOST: an echo has lost coherence with its memory. It cannot press plates until it is back on its path.',
};

// Simulation speeds the player can cycle through with Tab.
export const SPEEDS = [1, 2, 0.5];
export function nextSpeed(speed) {
  const i = SPEEDS.indexOf(speed);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

export class Game {
  constructor(levels = LEVELS, progress = {}) {
    this.levels = levels;
    this.levelIndex = 0;
    // The furthest level the player may enter. Saved between sessions by the presentation layer.
    // Only a whole number counts. Anything else (a damaged save, say) means nothing is unlocked.
    const unlocked = Number.isInteger(progress.maxUnlocked) ? progress.maxUnlocked : 0;
    this.maxUnlocked = Math.max(0, Math.min(levels.length - 1, unlocked));
    this.recordings = [];
    this.selected = new Set();
    this.recorder = null;
    this.region = null;
    this.completed = false;
    this.endingPending = false;
    this.events = [];           // messages for the presentation layer, drained each frame
    this.pendingImpacts = [];   // drained each frame
    this.pendingConflicts = []; // drained each frame
    this.explained = new Set(); // conflict kinds already explained in full this session
    this.discoveries = new Set(
      Array.isArray(progress.discoveries) ? progress.discoveries.filter((d) => d in DISCOVERIES) : [],
    );
    // Fastest completion per level id, in ticks from the start of that attempt.
    this.best = {};
    for (const [id, t] of Object.entries(progress.best || {})) {
      if (levels.some((l) => l.id === id) && Number.isFinite(t) && t > 0) this.best[id] = t;
    }
    // Increments whenever the world is rebuilt, so presentation can tell a fresh world from a
    // change in the old one (and avoid sounding every door and plate that starts in a new place).
    this.generation = 0;
    this.lastDrop = null;   // id of the last ball dropped into the live world, for undo
    this.lastResult = null; // { ticks, newBest } for the level just completed, shown as a summary
    // Lifetime counters, kept between sessions. playTicks counts simulated ticks while a level runs.
    this.stats = { recordingsMade: 0, levelsCompleted: 0, playTicks: 0 };
    for (const key of Object.keys(this.stats)) {
      const v = progress.stats && progress.stats[key];
      if (Number.isFinite(v) && v >= 0) this.stats[key] = Math.floor(v);
    }
    this.loadLevel(0);
    // The level the player last started, so CONTINUE can return to it. Never beyond what is unlocked.
    const lastLevel = Number.isInteger(progress.lastLevel) ? progress.lastLevel : 0;
    this.lastLevel = Math.max(0, Math.min(this.maxUnlocked, lastLevel));
  }

  // Replaces progress with a saved snapshot after checking every field, so a hand-edited or
  // damaged save code cannot put the game into an impossible state.
  importProgress(progress) {
    const clean = new Game(this.levels, progress).progress;
    this.maxUnlocked = clean.maxUnlocked;
    this.lastLevel = clean.lastLevel;
    this.discoveries = new Set(clean.discoveries);
    this.best = clean.best;
    this.stats = clean.stats;
    this.events.push('PROGRESS LOADED');
  }

  // Saved progress, in the shape the presentation layer stores.
  get progress() {
    return {
      maxUnlocked: this.maxUnlocked,
      lastLevel: this.lastLevel,
      discoveries: [...this.discoveries],
      best: { ...this.best },
      stats: { ...this.stats },
    };
  }

  // Clears saved progress: unlocks, discoveries, best times and statistics. The current level is kept.
  eraseProgress() {
    this.maxUnlocked = 0;
    this.lastLevel = 0;
    this.discoveries.clear();
    this.best = {};
    this.stats = { recordingsMade: 0, levelsCompleted: 0, playTicks: 0 };
    this.events.push('PROGRESS ERASED');
  }

  // Records a discovery. Returns true only the first time it is found.
  discover(id) {
    if (!(id in DISCOVERIES) || this.discoveries.has(id)) return false;
    this.discoveries.add(id);
    this.events.push({ text: `FOUND  ${DISCOVERIES[id]}`, ttl: 14 });
    return true;
  }

  get level() { return this.levels[this.levelIndex]; }
  get isSandbox() { return this.level.goal === null; }

  loadLevel(index) {
    if (this.recorder) this.events.push('RECORDING DISCARDED');
    this.levelIndex = index;
    this.generation++;
    this.world = buildLevel(this.level);
    this.playbacks = new Playbacks();
    this.recordings = [];
    this.selected.clear();
    this.recorder = null;
    this.region = null;
    this.completed = false;
    this.endingPending = false;
    this.lastDrop = null;
    this.lastResult = null;
    this.events.push(`LEVEL ${this.level.title.trim()}`);
    if (this.isSandbox) this.discover('found:open-lab');
  }

  // Restores the level's initial state. Recordings are kept: they are the player's
  // memory, and the level's entities have the same ids after a rebuild.
  resetLevel() {
    // A recording in progress belongs to the world being thrown away, so it cannot be saved.
    if (this.recorder) this.events.push('RECORDING DISCARDED');
    const keep = this.recordings;
    const keepSel = new Set(this.selected);
    this.generation++;
    this.world = buildLevel(this.level);
    this.playbacks = new Playbacks();
    this.recorder = null;
    this.recordings = keep;
    this.selected = keepSel;
    this.completed = false;
    this.lastDrop = null;
    this.lastResult = null;
    this.events.push('WORLD RESET');
  }

  // ---------- player verbs ----------

  setRegion(x, y, w, h) {
    if (this.recorder) return false;
    const r = normaliseRect(x, y, w, h);
    if (r.w < MIN_REGION || r.h < MIN_REGION) {
      this.region = null;
      this.events.push('REGION TOO SMALL');
      return false;
    }
    this.region = clampRect(r);
    this.events.push(`REGION ${Math.round(this.region.w)} x ${Math.round(this.region.h)}`);
    return true;
  }

  clearRegion() {
    if (this.recorder) return;
    this.region = null;
    this.events.push('REGION CLEARED');
  }

  toggleRecording() {
    if (this.recorder) {
      const name = `REC-${String(this.recordings.length + 1).padStart(2, '0')}`;
      const rec = this.recorder.finish();
      rec.name = name;
      this.recordings.push(rec);
      this.stats.recordingsMade++;
      this.recorder = null;
      this.selected.add(this.recordings.length);
      this.events.push(`SAVED ${name}  ${rec.length} ticks`);
      return 'stopped';
    }
    if (!this.region) {
      this.events.push('SELECT A REGION FIRST (DRAG)');
      return null;
    }
    this.recorder = new Recorder(this.world, this.region, `REC-${String(this.recordings.length + 1).padStart(2, '0')}`);
    this.events.push('RECORDING');
    return 'started';
  }

  // Click-to-drop, only inside the level's drop zones.
  // Clicking a loose ball removes it from the world. Echoes cannot be removed this way.
  removeBodyAt(x, y) {
    for (const b of this.world.bodies) {
      if (b.echo) continue;
      const dx = x - b.x, dy = y - b.y;
      if (dx * dx + dy * dy < (b.r + 2) * (b.r + 2)) {
        this.world.bodies.splice(this.world.bodies.indexOf(b), 1);
        b.alive = false;
        this.events.push('BALL REMOVED');
        return true;
      }
    }
    return false;
  }

  dropAt(x, y) {
    const inZone = this.level.dropZones.some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!inZone) {
      this.events.push('NO DROP HERE');
      return false;
    }
    this.lastDrop = spawnBall(this.world, x, y, 0, 0, 0).id;
    return true;
  }

  // Removes the ball dropped most recently, if it is still in the live world. Recordings keep
  // what they already captured; this only changes the world as it is now.
  undoDrop() {
    const id = this.lastDrop;
    this.lastDrop = null;
    if (id === null) return false;
    const idx = this.world.bodies.findIndex((b) => b.id === id && !b.echo);
    if (idx < 0) return false;
    const [b] = this.world.bodies.splice(idx, 1);
    b.alive = false;
    this.events.push('DROP UNDONE');
    return true;
  }

  doorAt(x, y) {
    for (const d of this.world.doors) {
      if (x >= d.x - 6 && x <= d.x + d.w + 6 && y >= d.y - 6 && y <= d.y + d.h + 6) return d;
    }
    return null;
  }

  toggleDoor(door) {
    door.open = !door.open;
    this.events.push(`${door.name.toUpperCase()} ${door.open ? 'OPEN' : 'SHUT'}`);
    return door.open;
  }

  emitterAt(x, y) {
    for (const e of this.world.emitters) {
      const dx = x - e.x, dy = y - e.y;
      if (dx * dx + dy * dy < 30 * 30) return e;
    }
    return null;
  }

  moveEmitter(emitter, x) {
    emitter.x = Math.max(emitter.railMin, Math.min(emitter.railMax, x));
  }

  // Selects every saved recording.
  selectAll() {
    if (this.recordings.length === 0) return false;
    this.selected = new Set(this.recordings.map((_, i) => i + 1));
    this.events.push(`SELECTED ALL ${this.recordings.length}`);
    return true;
  }

  // What a click (or G with the keyboard cursor) does at a world position: toggle a door, remove a
  // loose ball, or drop a new ball into the drop zone. Returns which one happened.
  act(x, y) {
    const door = this.doorAt(x, y);
    if (door) {
      this.toggleDoor(door);
      return 'door';
    }
    if (this.removeBodyAt(x, y)) return 'removed';
    return this.dropAt(x, y) ? 'dropped' : 'refused';
  }

  // Removes one saved recording. Refused while recording or while any replay is running, so no
  // playback is left holding a recording that has been taken away. Selections after it shift down.
  deleteRecording(index) {
    if (this.recorder || this.playbacks.activeCount > 0) {
      this.events.push('STOP REPLAY FIRST');
      return false;
    }
    if (index < 0 || index >= this.recordings.length) return false;
    const [gone] = this.recordings.splice(index, 1);
    const next = new Set();
    for (const id of this.selected) {
      if (id === index + 1) continue;
      next.add(id > index + 1 ? id - 1 : id);
    }
    this.selected = next;
    this.events.push(`DELETED ${gone.name}`);
    return true;
  }

  // Everything a bug report needs to reproduce a state: the level, the tick, the world hash and
  // the recordings. Plain data, so it can be copied as JSON.
  debugSnapshot() {
    return {
      level: this.level.id,
      tick: this.world.tick,
      hash: hashWorld(this.world),
      completed: this.completed,
      recordings: this.recordings.map((r, i) => ({ name: r.name, ticks: r.length, selected: this.selected.has(i + 1) })),
    };
  }

  toggleSelect(index) {
    if (index < 0 || index >= this.recordings.length) return;
    const id = index + 1;
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  // Starts every selected recording from the current tick, alongside the others.
  playSelected() {
    let n = 0;
    for (const id of this.selected) {
      const rec = this.recordings[id - 1];
      if (rec) { this.playbacks.start(this.world, rec); n++; }
    }
    if (n === 0) this.events.push('SELECT RECORDINGS WITH 1-9');
    else this.events.push(`REPLAY x${n}`);
    return n;
  }

  stopPlayback() {
    this.playbacks.clear();
    this.events.push('REPLAY STOPPED');
  }

  // Removes every saved recording. Refused while recording, because the recording in progress
  // would otherwise be saved into an empty list.
  clearRecordings() {
    if (this.recorder || this.recordings.length === 0) return false;
    this.playbacks.clear();
    this.recordings = [];
    this.selected.clear();
    this.events.push('ALL RECORDINGS CLEARED');
    return true;
  }

  deleteLastRecording() {
    if (this.recorder || this.recordings.length === 0) return;
    const rec = this.recordings.pop();
    this.selected.delete(this.recordings.length + 1);
    this.events.push(`DELETED ${rec.name}`);
  }

  // ---------- the tick ----------

  tick() {
    const w = this.world;
    this.stats.playTicks++;
    w.echoLights.length = 0;
    w.conflicts.length = 0;

    this.playbacks.beginTick();
    step(w);
    this.playbacks.endTick();

    if (this.recorder) this.recorder.sample(w);

    for (const imp of w.impacts) this.pendingImpacts.push(imp);
    for (const c of w.conflicts) {
      this.pendingConflicts.push(c);
      this.events.push(SHORT[c.type]);
      if (DISCOVERY_FOR_CONFLICT[c.type]) this.discover(DISCOVERY_FOR_CONFLICT[c.type]);
      if (!this.explained.has(c.type)) {
        this.explained.add(c.type);
        this.events.push({ text: EXPLAIN[c.type], ttl: 14 });
      }
    }

    // Discoveries that come from what the world is doing, not from a conflict.
    if (w.sensors.some((x) => x.litByEcho)) this.discover('found:echo-light');
    if (w.plates.some((x) => x.echoHits > 0)) this.discover('found:echo-plate');
    if (w.bodies.some((x) => x.source)) this.discover('found:emitter');
    if (this.playbacks.activeCount >= 2) this.discover('found:two-pasts');

    this.checkGoal();
  }

  checkGoal() {
    if (this.completed || !this.level.goal) return;
    if (this.level.goal(this.world)) {
      this.completed = true;
      this.events.push('OBJECTIVE COMPLETE');
      this.stats.levelsCompleted++;
      const ticks = this.world.tick;
      const prev = this.best[this.level.id];
      const newBest = prev === undefined || ticks < prev;
      if (newBest) {
        this.best[this.level.id] = ticks;
        this.events.push(`NEW BEST  ${(ticks / 60).toFixed(1)}s`);
      }
      this.lastResult = { ticks, newBest };
      if (this.level.id === 'l6-phase') this.endingPending = true;
    }
  }

  // Level select: any level up to the furthest one reached.
  jumpTo(index) {
    if (index < 0 || index > this.maxUnlocked || index >= this.levels.length) return false;
    this.loadLevel(index);
    this.lastLevel = index;
    return true;
  }

  advance() {
    if (!this.completed) return false;
    if (this.levelIndex + 1 < this.levels.length) {
      this.loadLevel(this.levelIndex + 1);
      this.lastLevel = this.levelIndex;
      this.maxUnlocked = Math.max(this.maxUnlocked, this.levelIndex);
      return true;
    }
    return false;
  }

  // ---------- queries for presentation and tests ----------

  // What is under a point, for the debug overlay's object-history panel.
  describeAt(x, y) {
    const w = this.world;
    const probe = { x: x - 1, y: y - 1, w: 2, h: 2 };
    for (const b of w.bodies) {
      if (!bodyTouchesRect(b, probe)) continue;
      if (!b.echo) return { kind: 'body', id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, source: b.source };
      for (const p of this.playbacks.list) {
        for (const e of p.echoes) {
          if (e.body !== b) continue;
          return {
            kind: 'echo', id: b.id, x: b.x, y: b.y, discord: e.discord, ghost: b.ghost,
            track: `frames ${e.tr.start}..${e.tr.start + e.tr.n}`, offset: [e.offX, e.offY],
          };
        }
      }
      return { kind: 'echo', id: b.id, x: b.x, y: b.y, ghost: b.ghost };
    }
    for (const d of w.doors) {
      if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) {
        return { kind: 'door', name: d.name, open: d.open, transitions: this.transitionsFor(`door:${d.id}`) };
      }
    }
    return null;
  }

  // Recorded state changes for one fixture across all saved recordings.
  transitionsFor(key) {
    const out = [];
    this.recordings.forEach((rec, ri) => {
      const tr = rec.byKey.get(key);
      if (!tr) return;
      for (let i = 1; i < tr.n; i++) {
        if (tr.at(i, 0) !== tr.at(i - 1, 0)) {
          out.push(`${rec.name} frame ${i}: ${tr.at(i, 0) > 0.5 ? 'opens' : 'shuts'}`);
        }
      }
    });
    return out;
  }

}

function normaliseRect(x, y, w, h) {
  const x0 = w < 0 ? x + w : x;
  const y0 = h < 0 ? y + h : y;
  return { x: x0, y: y0, w: Math.abs(w), h: Math.abs(h) };
}

function clampRect(r) {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(WORLD_W, r.x + r.w);
  const y1 = Math.min(WORLD_H, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
