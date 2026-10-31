// Shared rig for the temporal tests: seeded RNG, the operation vocabulary (world verbs and interface verbs), a signature of
// the whole visible/physical state including echoes, and a watcher on the present player's per-tick displacement.
import { World } from '../../src/sim/world.js';
import { Instrument } from '../../src/game/instrument.js';
import { LEVELS } from '../../src/levels/index.js';

export const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const IN = (o = {}) => ({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0, ...o });
export const HOMES = { ch1: [-5, 0, -12], ch2: [-3, 0, -9], ch4: [0, 0, -4], ch6: [4, 0, -137], sandbox: [0, 0, 0] };

export function rig(levelId) {
  const level = LEVELS[levelId], w = new World(level);
  const g = { world: w, selected: 0, audio: null, hud: { toast() {} }, feel() {}, level: { sandbox: false }, frameMode: false, pinned: null };
  const I = new Instrument(g); g.instr = I; w.teleportPlayer(HOMES[levelId], 0);
  const R = { w, g, I, level, id: levelId, maxStep: 0, worst: '' };
  // watch the present player: no single tick may move them further than a body-height shove (a recorded echo of you appearing
  // on top of you legitimately shoves you out, up to the 3 m collision-clamp bound) unless the world sent them back to a checkpoint
  const step = w.step.bind(w);
  w.step = (inp) => { const a = [w.player.st[0], w.player.st[1], w.player.st[2]], ev0 = w.events.length; step(inp); const d = Math.hypot(w.player.st[0] - a[0], w.player.st[1] - a[1], w.player.st[2] - a[2]); const sent = w.events.slice(ev0).some((e) => ['fell', 'crushed', 'zapped'].includes(e.type)); if (!sent && d > R.maxStep) { R.maxStep = d; R.worst = `tick ${w.tick}, Δ(${[0, 1, 2].map((k) => (w.player.st[k] - a[k]).toFixed(2))}) from y ${a[1].toFixed(2)}, events ${w.events.slice(ev0).map((e) => e.type)}`; } };
  return R;
}
// everything that defines the visible/physical state, including the echoes (World.hash covers only the present)
export function signature(w) {
  const rows = [];
  for (const L of w.aliveList) rows.push(`${L.layer}|${L.id}|${[...L.st].map((v) => Math.fround(v)).join(',')}`);
  rows.sort();
  const R = [...w.R.entries()].sort().map(([k, v]) => `${k}=${v}`).join(';');
  const pbs = w.playbacks.map((p) => (p ? `${p.active ? 1 : 0}${p.playing ? 1 : 0}|${p.head}|${p.rate}|${p.mode}|${[...p.muted].sort()}` : '-')).join('/');
  return `${w.hash()}#${rows.join('~')}#${R}#${pbs}`;
}
export const recSum = (rec) => { let s = 0; for (const t of rec.tracks.values()) { s += t.ticks.length; for (const v of t.vals) s += v * 1.000003; for (const v of t.ticks) s += v * 0.7; } return s + rec.length; };

export function ops(r, rng) {
  const { w, I, g } = r, pick = (a) => a[Math.floor(rng() * a.length)], slot = () => Math.floor(rng() * w.caps.slots), n = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const run = (k, inp) => { for (let i = 0; i < k; i++) w.step(inp ?? IN()); };
  const wander = (k) => { const mx = pick([-1, 0, 1]), mz = pick([-1, 0, 1]); for (let i = 0; i < k; i++) w.step(IN({ mx, mz, jump: rng() < 0.03, yaw: rng() * 6 })); };
  const vol = () => { const p = w.player.st; const h = [pick([2, 4, 6]), pick([2, 3]), pick([2, 4, 6])]; return { x0: p[0] - h[0], x1: p[0] + h[0], y0: p[1] - 1.5, y1: p[1] + h[1], z0: p[2] - h[2], z1: p[2] + h[2] }; };
  const tracksOf = (s) => (w.recordings[s] ? [...w.recordings[s].tracks.keys()] : []);
  const all = {
    wander: () => wander(n(1, 40)), idle: () => run(n(1, 60)),
    record: () => { const s = slot(); if (w.startRecording(s, vol(), 'fz')) { wander(n(2, 90)); if (w.recorder) w.stopRecording(); } },
    recordAbort: () => { const s = slot(); if (w.startRecording(s, vol(), 'ab')) { run(1); if (w.recorder) w.stopRecording('abort'); } },
    play: () => w.play(slot(), pick([{}, { mode: 'loop' }, { mode: 'once' }, { rate: 2 }, { rate: -1 }, { rate: 0.25 }, { mode: 'pingpong' }, { mode: 'hold' }])),
    playAll: () => w.playAll({ mode: pick(['once', 'loop']) }), stop: () => w.stop(slot()), pause: () => w.pause(slot()), toggle: () => w.togglePlay(slot()),
    reverse: () => w.reverse(slot()), rate: () => w.setRate(slot(), pick([0.25, 0.5, 1, 2, 4])), mode: () => w.cycleMode(slot()),
    scrub: () => w.scrub(slot(), n(-30, 30)), setHead: () => w.setHead(slot(), n(-5, 700)),
    playFrom: () => w.playFrom(slot(), n(-3, 650), { frozen: rng() < 0.5 }), stepHead: () => w.stepHead(slot(), pick([-1, 1, -10, 10, -999, 999])),
    mute: () => { const s = slot(), t = tracksOf(s); if (t.length) w.muteTrack(s, pick(t)); }, solo: () => { const s = slot(), t = tracksOf(s); if (t.length) w.soloTrack(s, pick(t)); },
    erase: () => w.eraseRecording(slot()), rollback: () => w.rollbackRecording(slot()),
    // the interface path (cursor, markers, freeze) on top of the world path
    iSel: () => { g.selected = slot(); I.clear(); }, iScrub: () => I.scrubTo(n(-5, 700)), iBy: () => I.scrubBy(pick([-1, 1, -10, 10])), iJump: () => I.jumpMarker(pick([-1, 1])),
    iPlay: () => I.playHere(), iFreeze: () => I.freezeHere(), iToggle: () => I.togglePlay(), iRev: () => I.reverse(), iRate: () => I.rate(pick([-1, 1])), iMode: () => I.cycleMode(),
    iLane: () => { const t = tracksOf(g.selected); if (t.length) I.lane(pick(t), rng() < 0.4); }, iGhost: () => { I.ghost(); const rec = I.rec; if (rec) rec.sampleAll(n(-9, 999), w.playbacks[g.selected]?.muted); },
    teleport: () => w.teleportPlayer(HOMES[r.id].map((v, i) => v + (i === 1 ? 0 : n(-2, 2))), 0), interact: () => { w.step(IN({ interact: true })); },
    recall: () => w.recallCrates?.(),
  };
  return all;
}

