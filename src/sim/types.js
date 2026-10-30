// Entity type registry. Every simulated thing is described by a type with a fixed channel layout
// (its state vector), pure collider/readout functions, and optional present-only behaviour hooks.
//
// A state vector is the unit of recording: the recorder stores exactly these channels, and a replay
// writes them back verbatim. Anything not in a state vector is derived from it.

import { boxC, lerp, clamp } from './math.js';

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
      kind: 'slider', aperture: (d.mode ?? 'door') === 'door', open: s >= DOOR_OPEN_THRESHOLD, snd: SND.door, beam: d.glass ? false : true });
  },
  step(L, w) {
    const d = L.def, st = L.st;
    const p = w.inputOf(d);
    const target = p === null ? st[1] : (p ? 1 : 0);
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
    let n = 0;
    for (const b of w.bodyBoxes) {
      if (b.b.x0 < region.x1 && b.b.x1 > region.x0 && b.b.z0 < region.z1 && b.b.z1 > region.z0 && b.b.y0 < region.y1 && b.b.y0 > region.y0 - 0.05) n++;
    }
    L.st[0] = n >= (L.def.need ?? 1) ? 1 : 0;
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
  ch: ['out', 'c', 'prev'], keyCh: 0, size: () => [0.4, 0.4, 0.4], colliders() {},
  out: (d, st) => st[0],
  step(L, w) {
    const d = L.def, st = L.st, op = d.op ?? 'logic', inp = w.inputOf(d);
    const hi = inp === null ? false : inp;
    switch (op) {
      case 'logic': st[0] = hi ? 1 : 0; break;
      case 'delay': st[1] = hi ? st[1] + 1 : 0; st[0] = st[1] >= (d.ticks ?? 60) ? 1 : 0; break;
      case 'hold': if (hi) st[1] = d.ticks ?? 120; else st[1] = Math.max(0, st[1] - 1); st[0] = st[1] > 0 ? 1 : 0; break;
      case 'pulse': if (hi && !st[2]) st[1] = d.ticks ?? 60; else st[1] = Math.max(0, st[1] - 1); st[0] = st[1] > 0 ? 1 : 0; break;
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
  ch: ['charge', 'idx', 'timer', 'heard', 'pm'], keyCh: 0, size: () => [0.9, 0.9, 0.9],
  colliders(d, st, push) { push({ b: boxC(d.pos[0], d.pos[1], d.pos[2], 0.9, 0.9, 0.9), kind: 'wall', snd: SND.crate, beam: false }); },
  out: (d, st) => (st[0] >= 1 ? 1 : 0),
  post(L, w) {
    const d = L.def, st = L.st, mask = st[3] | 0;
    const has = (n) => (mask >> n) & 1;
    if (d.seq) {
      const hold = d.hold ?? 600;
      if (st[0] >= 1) { st[2] -= 1; if (st[2] <= 0) { st[0] = 0; st[1] = 0; } return; }
      if (st[1] > 0) { st[2] -= 1; if (st[2] <= 0) st[1] = 0; }
      const want = d.seq[st[1] | 0];
      if (has(want) && !((st[4] | 0) >> want & 1)) { st[1] += 1; st[2] = d.window ?? 200; if (st[1] >= d.seq.length) { st[0] = 1; st[2] = hold; } }
      st[4] = mask;
      return;
    }
    const want = d.want ?? [note(d)];
    const ok = want.every(has);
    const up = 1 / (d.charge ?? 40), down = 1 / (d.decay ?? 90);
    st[0] = clamp(st[0] + (ok ? up : -down), 0, 1);
  },
});

export function typeOf(def) {
  const t = TYPES[def.type];
  if (!t) throw new Error(`Unknown entity type '${def.type}' (id ${def.id})`);
  return t;
}
