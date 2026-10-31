// Entity type registry. Every simulated thing is described by a type with a fixed channel layout
// (its state vector), pure collider/readout functions, and optional present-only behaviour hooks.
//
// A state vector is the unit of recording: the recorder stores exactly these channels, and a replay
// writes them back verbatim. Anything not in a state vector is derived from it.

import { boxC, lerp, clamp, segHitsBox, containsPoint } from './math.js';
import { heardAmp } from './fields.js';

const idx = (names) => Object.fromEntries(names.map((n, i) => [n, i]));
const v3 = (a, d = [0, 0, 0]) => (a ? a : d);

export const DOOR_OPEN_THRESHOLD = 0.55;
export const PLAYER_SIZE = [0.6, 1.8, 0.6];
export const EYE_HEIGHT = 1.58;

// Sound attenuation per occluding solid (multiplicative) and beam opacity.
const SND = { wall: 0.3, glass: 0.55, door: 0.3, crate: 0.85, body: 0.92 };

function note(def) { return def.note ?? 1; }

export const TYPES = {};
function reg(name, t) {
  t.name = name;
  t.I = idx(t.ch);
  t.init ??= () => t.ch.map(() => 0);
  t.size ??= (d) => v3(d.size, [1, 1, 1]);
  t.anchor ??= (d) => d.pos;
  t.capture ??= 'center';
  t.policy ??= 'max';
  t.keyCh ??= -1;
  TYPES[name] = t;
}

// ---------------------------------------------------------------- static architecture
reg('wall', {
  ch: [], capture: 'overlap',
  colliders(d, st, push) {
    const s = d.size;
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'wall',
      snd: d.sound ?? (d.glass ? SND.glass : SND.wall), beam: d.glass ? false : d.beam !== false });
  },
});

// ---------------------------------------------------------------- sliders: doors, bridges, lifts, presses
// mode 'door'   → an APERTURE: if any history holds it open, it is open for everyone.
// mode 'matter' → MATTER: it exists wherever any history has put it.
reg('slider', {
  ch: ['s', 'tgt'], capture: 'overlap', keyCh: 0, policy: 'max',
  init: (d) => [d.s0 ?? 0, d.s0 ?? 0],
  anchor: (d, st) => [lerp(d.pos[0], d.to[0], st[0]), lerp(d.pos[1], d.to[1], st[0]), lerp(d.pos[2], d.to[2], st[0])],
  colliders(d, st, push) {
    const s = st[0], z = d.size;
    push({ b: boxC(lerp(d.pos[0], d.to[0], s), lerp(d.pos[1], d.to[1], s), lerp(d.pos[2], d.to[2], s), z[0], z[1], z[2]),
      kind: d.hazard ? 'hazard' : 'slider', hazard: !!d.hazard, aperture: !d.hazard && (d.mode ?? 'door') === 'door', open: s >= DOOR_OPEN_THRESHOLD, snd: SND.door, beam: d.glass ? false : true });
  },
  step(L, w) {
    const d = L.def, st = L.st;
    const p = w.inputOf(d);
    const pin = w.pins[d.id];
    const target = pin !== undefined ? pin : p === null ? st[1] : (p ? 1 : 0); // a canonised pin outranks any wiring
    const sp = (d.speed ?? 0.8) * w.dt;
    st[0] = clamp(st[0] + clamp(target - st[0], -sp, sp), 0, 1);
  },
  out: (d, st) => (st[0] >= 0.98 ? 1 : 0),
});

// ---------------------------------------------------------------- bodies
reg('crate', {
  ch: ['x', 'y', 'z', 'vx', 'vy', 'vz'], body: true, capture: 'center',
  init: (d) => [d.pos[0], d.pos[1], d.pos[2], 0, 0, 0],
  anchor: (d, st) => [st[0], st[1], st[2]],
  colliders(d, st, push) {
    const s = v3(d.size, [1, 1, 1]);
    push({ b: boxC(st[0], st[1], st[2], s[0], s[1], s[2]), kind: 'crate', snd: SND.crate, beam: true, body: true });
  },
});

reg('player', {
  ch: ['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'tone', 'ground'], body: true, capture: 'center',
  init: (d) => [d.pos[0], d.pos[1], d.pos[2], 0, 0, 0, d.yaw ?? 0, 0, 0, 0],
  size: () => PLAYER_SIZE,
  anchor: (d, st) => [st[0], st[1], st[2]],
  colliders(d, st, push) {
    push({ b: boxC(st[0], st[1], st[2], PLAYER_SIZE[0], PLAYER_SIZE[1], PLAYER_SIZE[2]), kind: 'player', snd: SND.body, beam: true, body: true });
  },
});

// ---------------------------------------------------------------- switches and sensors
reg('plate', {
  ch: ['pressed'], keyCh: 0, size: (d) => v3(d.size, [2, 0.12, 2]),
  colliders() {},
  out: (d, st) => st[0],
  post(L, w) {
    const s = v3(L.def.size, [2, 0.12, 2]), p = L.def.pos;
    const top = p[1] + s[1] / 2;
    const region = { x0: p[0] - s[0] / 2, x1: p[0] + s[0] / 2, z0: p[2] - s[2] / 2, z1: p[2] + s[2] / 2, y0: top - 0.05, y1: top + 0.3 };
    let n = 0; const by = new Set();
    for (const b of w.bodyBoxes) {
      if (b.b.x0 < region.x1 && b.b.x1 > region.x0 && b.b.z0 < region.z1 && b.b.z1 > region.z0 && b.b.y0 < region.y1 && b.b.y0 > region.y0 - 0.05) { n++; by.add(b.layer); }
    }
    L.st[0] = n >= (L.def.need ?? 1) ? 1 : 0;
    L.heldBy = by; // which histories' bodies are pressing it (runtime attribution for explain() and feedback)
  },
});

reg('lever', {
  ch: ['on', 't'], keyCh: 0, size: () => [0.5, 0.9, 0.5], colliders() {},
  init: (d) => [d.on ? 1 : 0, 0],
  out: (d, st) => st[0],
  step(L, w) { // momentary levers ("buttons") release themselves
    const hold = L.def.hold ?? 0;
    if (hold > 0 && L.st[0] > 0.5) { L.st[1] += 1; if (L.st[1] >= hold) { L.st[0] = 0; L.st[1] = 0; } }
  },
  interact(L) { L.st[0] = L.st[0] > 0.5 ? 0 : 1; L.st[1] = 0; return L.st[0] ? 'lever-on' : 'lever-off'; },
  interactBox: (d) => boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 1.3, 0.9),
});

reg('mirror', {
  ch: ['rot'], keyCh: 0, capture: 'center', size: () => [0.9, 1.4, 0.9],
  init: (d) => [d.rot ?? 0],
  colliders(d, st, push) {
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 1.4, 0.9), kind: 'mirror', rot: st[0] > 0.5 ? 1 : 0, snd: SND.crate, beam: false, mirror: true });
  },
  step(L, w) { const p = w.inputOf(L.def); if (p !== null) L.st[0] = p ? 1 : 0; },
  interact(L) { if (L.def.in?.length) return null; L.st[0] = L.st[0] > 0.5 ? 0 : 1; return 'mirror-turn'; },
  interactBox: (d) => boxC(d.pos[0], d.pos[1], d.pos[2], 1.2, 1.6, 1.2),
});

reg('beam', { // light projector: emits an axis-aligned beam that mirrors can redirect
  ch: ['on'], keyCh: 0, size: () => [0.8, 0.8, 0.8],
  init: (d) => [d.on === false ? 0 : 1],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.8, 0.8, 0.8), kind: 'wall', snd: SND.crate, beam: false }); },
  step(L, w) { const p = w.inputOf(L.def); if (p !== null) L.st[0] = p ? 1 : 0; },
  out: (d, st) => st[0],
});

reg('watcher', { // an Eye: sees any Recollector (present or echo) inside its zone, unless matter blocks the line of sight
  ch: ['sees', 'who'], keyCh: 0, size: () => [0.6, 0.6, 0.6], colliders() {},
  out: (d, st) => st[0],
  post(L, w) {
    const e = L.def.pos, z = L.def.zone, was = L.st[0];
    let who = -1;
    for (const P of w.aliveList) {
      if (P.type.name !== 'player') continue;
      const x = P.st[0], y = P.st[1], zz = P.st[2];
      if (x < z[0] || x > z[3] || y < z[1] || y > z[4] || zz < z[2] || zz > z[5]) continue;
      let blocked = false;
      for (const s of w.solids) {
        if (!s.block || s.item === P || (s.item?.type?.name === 'player')) continue;
        if (containsPoint(s.b, e[0], e[1], e[2]) || containsPoint(s.b, x, y, zz)) continue;
        if (segHitsBox(e[0], e[1], e[2], x, y, zz, s.b)) { blocked = true; break; }
      }
      if (!blocked) { who = P.layer; break; }
    }
    L.st[0] = who >= 0 ? 1 : 0; L.st[1] = who;
    if (L.st[0] && !was) w.emit('seen', { id: L.id, layer: who });
  },
});

reg('sensor', { // photocell
  ch: ['lit', 'hold'], keyCh: 0, size: () => [0.8, 0.8, 0.8],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.8, 0.8, 0.8), kind: 'wall', snd: SND.crate, beam: false }); },
  out: (d, st) => (st[0] > 0.5 || st[1] > 0 ? 1 : 0),
  post(L, w) {
    const lit = w.litSensors.has(L.id);
    const hold = L.def.hold ?? 0;
    L.st[0] = lit ? 1 : 0;
    L.st[1] = lit ? hold : Math.max(0, L.st[1] - 1);
  },
});

// ---------------------------------------------------------------- logic
reg('gate', {
  ch: ['out', 'c', 'prev', 'jam'], keyCh: 0, size: () => [0.4, 0.4, 0.4], colliders() {},
  out: (d, st) => st[0],
  step(L, w) {
    const d = L.def, st = L.st, op = d.op ?? 'logic', inp = w.inputOf(d);
    const hi = inp === null ? false : inp;
    switch (op) {
      case 'logic': st[0] = hi ? 1 : 0; break;
      case 'delay': st[1] = hi ? st[1] + 1 : 0; st[0] = st[1] >= (d.ticks ?? 60) ? 1 : 0; break;
      case 'hold': if (hi) st[1] = d.ticks ?? 120; else st[1] = Math.max(0, st[1] - 1); st[0] = st[1] > 0 ? 1 : 0; break;
      case 'pulse': if (hi && !st[2]) st[1] = d.ticks ?? 60; else st[1] = Math.max(0, st[1] - 1); st[0] = st[1] > 0 ? 1 : 0; break;
      case 'count': { // opens on exactly n rising edges; one more and it jams for good (unless a reset input fires)
        if (d.reset && w.sig(d.reset) > 0.5) { st[1] = 0; st[3] = 0; }
        if (hi && !st[2]) { st[1] += 1; if (st[1] > (d.n ?? 3)) st[3] = 1; }
        st[0] = !st[3] && st[1] === (d.n ?? 3) ? 1 : 0; break;
      }
      case 'toggle': if (hi && !st[2]) st[0] = st[0] ? 0 : 1; break;
      case 'latch': { // in[0] sets, in[1] resets
        const set = w.sig(d.in[0]) > 0.5, rst = d.in[1] ? w.sig(d.in[1]) > 0.5 : false;
        if (rst) st[0] = 0; else if (set) st[0] = 1; break;
      }
      case 'osc': {
        const en = inp === null ? true : inp, per = d.period ?? 240;
        st[0] = en && ((w.tick + (d.phase ?? 0)) % per) < per * (d.duty ?? 0.5) ? 1 : 0; break;
      }
      case 'gt': { let sum = 0; for (const i of d.in) sum += w.sig(i); st[0] = sum > (d.level ?? 1.5) ? 1 : 0; break; }
      default: st[0] = hi ? 1 : 0;
    }
    st[2] = hi ? 1 : 0;
  },
});

// ---------------------------------------------------------------- machinery
reg('flywheel', { // a machine that remembers: inertia keeps it "powered" after its input is gone
  ch: ['omega', 'phase'], keyCh: 0, policy: 'sum', size: (d) => v3(d.size, [2, 2, 2]),
  colliders(d, st, push) {
    const s = v3(d.size, [2, 2, 2]);
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'wall', snd: SND.wall, beam: true });
  },
  step(L, w) {
    const d = L.def, st = L.st, p = w.inputOf(d);
    if (p) st[0] = Math.min(1, st[0] + (d.accel ?? 0.5) * w.dt);
    else st[0] = Math.max(0, st[0] - (d.drag ?? 0.12) * w.dt);
    st[1] = (st[1] + st[0] * 6.0 * w.dt) % (Math.PI * 2 * 1000);
  },
  out: (d, st) => (st[0] >= (d.thresh ?? 0.45) ? st[0] : 0),
});

reg('conveyor', {
  ch: ['on'], keyCh: 0, capture: 'overlap', size: (d) => v3(d.size, [2, 0.4, 6]),
  init: () => [0],
  colliders(d, st, push) {
    const s = v3(d.size, [2, 0.4, 6]);
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'conveyor', snd: SND.wall, beam: false, conv: st[0] > 0.5 ? { dx: d.dir[0] * (d.speed ?? 1.4), dz: d.dir[1] * (d.speed ?? 1.4) } : null });
  },
  step(L, w) { const p = w.inputOf(L.def); L.st[0] = p === null ? 1 : (p ? 1 : 0); },
  out: (d, st) => st[0],
});

reg('lamp', {
  ch: ['on'], keyCh: 0, size: () => [0.4, 0.4, 0.4], colliders() {},
  init: (d) => [d.on === false ? 0 : 1],
  step(L, w) { const p = w.inputOf(L.def); if (p !== null) L.st[0] = p ? 1 : 0; },
  out: (d, st) => st[0],
});

// ---------------------------------------------------------------- sound
reg('emitter', { // a tuned sound source (7 notes)
  ch: ['on'], keyCh: 0, size: () => [0.8, 0.8, 0.8],
  init: (d) => [d.on === false ? 0 : 1],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.8, 0.8, 0.8), kind: 'wall', snd: SND.crate, beam: false }); },
  step(L, w) { const p = w.inputOf(L.def); if (p !== null) L.st[0] = p ? 1 : 0; },
  out: (d, st) => st[0],
});

reg('resonator', { // hears notes; single note, chord (all at once) or melody (in order)
  ch: ['charge', 'idx', 'timer', 'heard', 'pm', 'gap'], keyCh: 0, size: () => [0.9, 0.9, 0.9],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 0.9, 0.9), kind: 'wall', snd: SND.crate, beam: false }); },
  out: (d, st) => (d.seq ? (st[0] >= 1 ? 1 : 0) : (st[0] >= 1 || st[2] > 0 ? 1 : 0)),
  post(L, w) {
    const d = L.def, st = L.st, mask = st[3] | 0;
    const has = (n) => (mask >> n) & 1;
    if (d.seq) {
      const hold = d.hold ?? 600, win = d.window ?? 200, len = d.seq.length;
      st[5] += 1; // ticks since the last matched note
      if (st[0] >= 1) { st[2] -= 1; if (st[2] <= 0) { st[0] = 0; st[1] = 0; } st[4] = mask; return; }
      if (st[1] > 0) { st[2] -= 1; if (st[2] <= 0) st[1] = 0; }
      const prev = st[4] | 0;
      for (let n = 1; n <= 7; n++) {
        if (!has(n) || ((prev >> n) & 1)) continue; // only note onsets count
        const idx = st[1] | 0;
        if (n === d.seq[idx]) {
          if (idx > 0 && d.tempo && (st[5] < d.tempo[0] || st[5] > d.tempo[1])) { st[1] = n === d.seq[0] ? 1 : 0; } // right note, wrong tempo
          else { st[1] = idx + 1; if (st[1] >= len) { st[0] = 1; st[2] = hold; } }
          if (st[0] < 1) st[2] = win;
          st[5] = 0;
        } else if (n === d.seq[0]) { st[1] = 1; st[2] = win; st[5] = 0; }
      }
      st[4] = mask;
      return;
    }
    const want = d.want ?? [note(d)];
    const ok = want.every(has);
    const up = 1 / (d.charge ?? 40), down = 1 / (d.decay ?? 90);
    st[0] = clamp(st[0] + (ok ? up : -down), 0, 1);
    if (st[0] >= 1) st[2] = d.hold ?? 0; else if (st[2] > 0) st[2] -= 1; // afterglow after the sound stops
  },
});


// ---------------------------------------------------------------- hazards and degrading matter
const loadedBy = (w, top, x0, x1, z0, z1) => {
  for (const b of w.bodyBoxes) {
    if (Math.abs(b.b.y0 - top) < 0.14 && b.b.x0 < x1 && b.b.x1 > x0 && b.b.z0 < z1 && b.b.z1 > z0) return true;
  }
  return false;
};

reg('crumble', { // wears out under load; history does not wear (an echo of it keeps the integrity it was recorded with)
  ch: ['integ', 'load'], capture: 'overlap', keyCh: 0,
  init: () => [1, 0],
  size: (d) => v3(d.size, [4, 0.5, 4]),
  colliders(d, st, push) {
    if (st[0] <= 0.02) return;
    const s = v3(d.size, [4, 0.5, 4]);
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'slider', snd: SND.wall, beam: true });
  },
  step(L, w) {
    const d = L.def, s = v3(d.size, [4, 0.5, 4]), p = d.pos;
    const on = L.st[0] > 0.02 && loadedBy(w, p[1] + s[1] / 2, p[0] - s[0] / 2, p[0] + s[0] / 2, p[2] - s[2] / 2, p[2] + s[2] / 2);
    L.st[1] = on ? 1 : 0;
    if (on) L.st[0] = Math.max(0, L.st[0] - 1 / (d.life ?? 60));
    else if (d.regen && L.st[0] > 0.02) L.st[0] = Math.min(1, L.st[0] + d.regen);
  },
});

reg('descender', { // a one-way platform: sinks under load; rises only when powered (or never)
  ch: ['s'], capture: 'overlap', keyCh: 0,
  init: (d) => [d.s0 ?? 0],
  anchor: (d, st) => [lerp(d.pos[0], d.to[0], st[0]), lerp(d.pos[1], d.to[1], st[0]), lerp(d.pos[2], d.to[2], st[0])],
  colliders(d, st, push) {
    const z = d.size;
    push({ b: boxC(lerp(d.pos[0], d.to[0], st[0]), lerp(d.pos[1], d.to[1], st[0]), lerp(d.pos[2], d.to[2], st[0]), z[0], z[1], z[2]), kind: 'slider', snd: SND.wall, beam: true });
  },
  step(L, w) {
    const d = L.def, st = L.st, z = d.size;
    const y = lerp(d.pos[1], d.to[1], st[0]), x = lerp(d.pos[0], d.to[0], st[0]), zc = lerp(d.pos[2], d.to[2], st[0]);
    const pin = w.pins[d.id];
    if (pin !== undefined) { st[0] = clamp(st[0] + clamp(pin - st[0], -(d.speed ?? 0.12) * w.dt, (d.speed ?? 0.12) * w.dt), 0, 1); return; }
    const powered = d.in?.length ? w.inputOf(d) : false;
    const loaded = loadedBy(w, y + z[1] / 2, x - z[0] / 2, x + z[0] / 2, zc - z[2] / 2, zc + z[2] / 2);
    if (powered) st[0] = Math.max(0, st[0] - (d.lift ?? 0.12) * w.dt);
    else if (loaded) st[0] = Math.min(1, st[0] + (d.speed ?? 0.12) * w.dt);
  },
  out: (d, st) => (st[0] >= 0.98 ? 1 : 0),
});

// ---------------------------------------------------------------- music
reg('carillon', { // a mechanism that plays a melody while powered
  ch: ['on', 'note', 'idx', 't'], keyCh: 0, size: () => [1, 1.4, 1],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 1.3, 0.9), kind: 'wall', snd: SND.crate, beam: false }); },
  step(L, w) {
    const d = L.def, st = L.st, p = w.inputOf(d), on = p === null ? true : p;
    st[0] = on ? 1 : 0;
    if (!on) { st[1] = 0; st[2] = 0; st[3] = 0; return; }
    const mel = d.melody, [n, dur] = mel[st[2] | 0];
    st[3] += 1;
    st[1] = st[3] < dur * 0.7 ? n : 0;
    if (st[3] >= dur) { st[3] = 0; st[2] += 1; if (st[2] >= mel.length) { if (d.once) { st[2] = mel.length - 1; st[3] = dur; st[1] = 0; } else st[2] = 0; } }
  },
  out: (d, st) => st[0],
});

// ---------------------------------------------------------------- sound → matter
reg('pane', { // brittle glass tuned to one note: sustained sound at its pitch shatters it, permanently. History does not break.
  ch: ['integ', 'charge'], capture: 'overlap', keyCh: 0,
  init: () => [1, 0],
  size: (d) => v3(d.size, [0.2, 3, 3]),
  colliders(d, st, push) {
    if (st[0] <= 0.02) return;
    const s = v3(d.size, [0.2, 3, 3]);
    push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'wall', snd: SND.glass, beam: false });
  },
  out: (d, st) => (st[0] <= 0.02 ? 1 : 0), // 1 once shattered
  step(L, w) {
    const d = L.def, st = L.st;
    if (st[0] <= 0.02) return;
    if (heardAmp(w, d.pos, d.note ?? 6, d.sens ?? 0.22) > 0) st[1] = Math.min(1, st[1] + 1 / (d.hold ?? 120));
    else st[1] = Math.max(0, st[1] - 1 / 90);
    if (st[1] >= 1) { st[0] = 0; w.emit('shatter', { id: L.id, pos: d.pos }); }
  },
});

// ---------------------------------------------------------------- optics
reg('prism', { // splits a beam left/right; a white beam disperses into red (left), green (straight), blue (right)
  ch: [], size: () => [0.9, 1.0, 0.9], capture: 'center',
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 1.0, 0.9), kind: 'wall', snd: SND.crate, beam: false, prism: true }); },
});
reg('filter', { // a gel pane: white becomes its colour; its own colour passes; other colours are stopped
  ch: [], size: (d) => v3(d.size, [0.15, 2.4, 2.4]), capture: 'overlap',
  colliders(d, st, push) { const s = v3(d.size, [0.15, 2.4, 2.4]); push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], s[0], s[1], s[2]), kind: 'wall', snd: SND.glass, beam: false, filter: d.hue ?? 1 }); },
});

// ---------------------------------------------------------------- people
reg('actor', { // a scripted residual figure: walks a path, hums a motif; recordable like anything else
  ch: ['x', 'y', 'z', 'yaw', 'tone', 'pose', 't', 'active'], keyCh: 7, size: () => [0.6, 1.8, 0.6],
  init: (d) => [d.pos[0], d.pos[1] + 0.9, d.pos[2], d.yaw ?? 0, 0, 0, 0, d.startOn ? 0 : 1],
  anchor: (d, st) => [st[0], st[1], st[2]],
  colliders() {},
  step(L) {
    const d = L.def, st = L.st;
    if (st[7] < 0.5) return;
    st[6] += 1;
    const path = d.path;
    if (path?.length) {
      const end = path[path.length - 1][0];
      let t = st[6];
      if (t > end) { if (d.loop) { st[6] = 1; t = 1; } else t = end; }
      if (d.hideAt && st[6] >= d.hideAt) { st[7] = 0; st[4] = 0; return; }
      let i = 0; while (i < path.length - 2 && path[i + 1][0] < t) i++;
      const a = path[i], b = path[Math.min(i + 1, path.length - 1)], k = b[0] === a[0] ? 1 : clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
      const nx = lerp(a[1], b[1], k), nz = lerp(a[2], b[2], k);
      const mv = Math.hypot(nx - st[0], nz - st[2]);
      if (mv > 1e-4) st[3] = Math.atan2(-(nx - st[0]), -(nz - st[2]));
      st[0] = nx; st[2] = nz; st[1] = d.pos[1] + 0.9; st[5] = mv > 0.004 ? 1 : 0;
    }
    st[4] = 0;
    for (const [t0, t1, n] of d.tones ?? []) if (st[6] >= t0 && st[6] < t1) st[4] = n;
  },
});

// ---------------------------------------------------------------- consequence
reg('ledger', { // where a history is entered into the record as true (see World.canonize)
  ch: ['used'], keyCh: 0, size: () => [1, 1.2, 1],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 1.2, 0.9), kind: 'wall', snd: SND.crate, beam: true }); },
  out: (d, st) => st[0],
  interact(L, w, input) {
    if (L.st[0] > 0.5) return null;
    const slot = input?.slot ?? -1;
    if (slot < 0 || !w.recordings[slot]) return 'ledger-empty';
    if (L.def.accepts) { // this ledger only recognises one particular history
      const rec = w.recordings[slot], tr = rec.tracks.get(L.def.accepts), st = new Float64Array(tr?.nch ?? 0);
      if (!tr || !tr.sample(rec.length - 1, st) || st[0] < 0.9) return 'ledger-refuse';
    }
    const r = w.canonize(slot, L.id);
    if (!r) return 'ledger-empty';
    L.st[0] = 1;
    return 'canon';
  },
  interactBox: (d) => boxC(d.pos[0], d.pos[1], d.pos[2], 1.3, 1.6, 1.3),
});

export function typeOf(def) {
  const t = TYPES[def.type];
  if (!t) throw new Error(`Unknown entity type '${def.type}' (id ${def.id})`);
  return t;
}
