// Temporal integrity: seeded random sequences of every verb of the instrument, against real levels, with hard invariants
// checked after every operation. Every failure prints the seed and the operation trail so it can be replayed exactly.
//   FUZZ_SEEDS=200 node --test tests/temporal.fuzz.test.js     (default 24 seeds per level)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { Instrument } from '../src/game/instrument.js';
import { LEVELS } from '../src/levels/index.js';

const SEEDS = +(process.env.FUZZ_SEEDS ?? 24);
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const IN = (o = {}) => ({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0, ...o });
const HOMES = { ch1: [-5, 0, -12], ch2: [-3, 0, -9], ch4: [0, 0, -4], ch6: [4, 0, -137], sandbox: [0, 0, 0] };

function rig(levelId) {
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
function signature(w) {
  const rows = [];
  for (const L of w.aliveList) rows.push(`${L.layer}|${L.id}|${[...L.st].map((v) => Math.fround(v)).join(',')}`);
  rows.sort();
  const R = [...w.R.entries()].sort().map(([k, v]) => `${k}=${v}`).join(';');
  const pbs = w.playbacks.map((p) => (p ? `${p.active ? 1 : 0}${p.playing ? 1 : 0}|${p.head}|${p.rate}|${p.mode}|${[...p.muted].sort()}` : '-')).join('/');
  return `${w.hash()}#${rows.join('~')}#${R}#${pbs}`;
}
const recSum = (rec) => { let s = 0; for (const t of rec.tracks.values()) { s += t.ticks.length; for (const v of t.vals) s += v * 1.000003; for (const v of t.ticks) s += v * 0.7; } return s + rec.length; };

export { rig, ops, mulberry32, IN, HOMES, signature };
function ops(r, rng) {
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

function checkInvariants(r, trail) {
  const { w } = r, fail = (m) => assert.fail(`${m}\n  level ${r.id} · tick ${w.tick} · last ops: ${trail.slice(-8).join(' → ')}`);
  for (const L of w.aliveList) for (const v of L.st) if (!Number.isFinite(v)) fail(`non-finite state on ${L.layer}|${L.id}`);
  w.playbacks.forEach((pb, s) => {
    if (!pb) return;
    if (!(pb.head >= 0 && pb.head <= pb.rec.length)) fail(`slot ${s}: head ${pb.head} outside [0, ${pb.rec.length}]`);
    if (!(pb.coherence >= 0 && pb.coherence <= 1)) fail(`slot ${s}: coherence ${pb.coherence}`);
    if (!pb.active) { if (pb.items.size) fail(`slot ${s}: inactive playback still holds ${pb.items.size} echo items`); return; }
    const tau = pb.tau, tmp = [];
    for (const tr of pb.rec.tracks.values()) {
      const it = pb.items.get(tr.id), st = new Float64Array(tr.nch), exists = tr.sample(tau, st);
      const expect = exists && !pb.muted.has(tr.id) && !w.sealed.has(tr.id);
      if (!it) { if (expect) fail(`slot ${s}: ${tr.id} should be present at tau ${tau} but has no item`); continue; }
      if (!!it.alive !== !!expect) fail(`slot ${s}: ${tr.id} alive=${it.alive}, expected ${expect} (muted ${pb.muted.has(tr.id)}, sealed ${w.sealed.has(tr.id)}) at tau ${tau}`);
      if (it.alive) for (let i = 0; i < tr.nch; i++) if (it.st[i] !== st[i]) fail(`slot ${s}: ${tr.id} channel ${i} drifted: ${it.st[i]} vs recorded ${st[i]} at tau ${tau}`);
    }
    // an omitted object must leave nothing behind: no echo solid, no echo body
    for (const id of pb.muted) {
      if (w.solids.some((o) => o.layer === s + 1 && o.id === id)) fail(`slot ${s}: omitted ${id} still has a collider`);
      if (w.aliveList.some((L) => L.echo && L.layer === s + 1 && L.id === id)) fail(`slot ${s}: omitted ${id} is still in the world`);
    }
  });
}

for (const id of Object.keys(HOMES)) {
  test(`${id}: ${SEEDS} seeded random sequences of every temporal verb keep every invariant`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = rig(id), rng = mulberry32(seed * 7919 + id.length), table = ops(r, rng), names = Object.keys(table), trail = [], sums = new Map();
      for (let k = 0; k < 70; k++) {
        if (r.maxStep > 3.05) assert.fail(`seed ${seed}: the present player was moved ${r.maxStep.toFixed(2)} m in one tick (${r.worst}) · full trail: ${trail.join(' → ')}`);
        const name = names[Math.floor(rng() * names.length)]; trail.push(name);
        try { table[name](); } catch (e) { assert.fail(`seed ${seed}: op ${name} threw ${e.stack.split('\n').slice(0, 3).join(' | ')}\n  trail: ${trail.slice(-8).join(' → ')}`); }
        try { checkInvariants(r, trail); } catch (e) { e.message = `seed ${seed}: ${e.message}`; throw e; }
        // recordings are immutable: no amount of playing, scrubbing or previewing may change one
        for (const rec of r.w.recordings) if (rec) { const s = recSum(rec); if (sums.has(rec) && sums.get(rec) !== s) assert.fail(`seed ${seed}: a recording changed after creation (${rec.name}) · ${trail.slice(-6).join(' → ')}`); sums.set(rec, s); }
      }
    }
  });
}

// ======================================================================= stronger properties
const clone = (o) => JSON.parse(JSON.stringify(o));
function drive(r, seed, nOps, { onOp } = {}) {
  const rng = mulberry32(seed * 7919 + r.id.length), table = ops(r, rng), names = Object.keys(table), trail = [];
  const skip = new Set(['teleport']); // teleports are legal discontinuities in the player's position
  for (let k = 0; k < nOps; k++) { const name = names[Math.floor(rng() * names.length)]; trail.push(name); table[name](); onOp?.(name, k, rng, trail); }
  return trail;
}
const ticksSeq = (r, seed, nOps) => { const out = []; drive(r, seed, nOps, { onOp: () => out.push(signature(r.w)) }); return out; };

for (const id of ['ch1', 'ch2', 'ch6', 'sandbox']) {
  test(`${id}: the fuzz actually exercises the system (coverage of states the invariants are about)`, () => {
    const cov = { echoes: 0, twoEchoes: 0, frozen: 0, reversed: 0, slow: 0, muted: 0, recs: 0, loop: 0 };
    for (let seed = 1; seed <= 12; seed++) {
      const r = rig(id); drive(r, seed, 70, { onOp: () => {
        const act = r.w.playbacks.filter((p) => p?.active); if (act.length) cov.echoes++; if (act.length >= 2) cov.twoEchoes++;
        if (act.some((p) => !p.playing)) cov.frozen++; if (act.some((p) => p.rate < 0)) cov.reversed++; if (act.some((p) => Math.abs(p.rate) < 1)) cov.slow++;
        if (act.some((p) => p.muted.size)) cov.muted++; if (act.some((p) => p.mode === 'loop')) cov.loop++; cov.recs += r.w.recordings.filter(Boolean).length > 0 ? 1 : 0;
      } });
    }
    for (const [k, v] of Object.entries(cov)) assert.ok(v >= 10, `the fuzz rarely reaches "${k}" on ${id} (${v} op-states) — its invariants would prove little`);
  });

  test(`${id}: determinism — the same seed produces the identical world, echoes included, after every operation`, () => {
    for (let seed = 1; seed <= Math.min(SEEDS, 12); seed++) {
      const a = ticksSeq(rig(id), seed, 60), b = ticksSeq(rig(id), seed, 60);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) assert.fail(`${id} seed ${seed}: runs diverge after op ${i}`);
    }
  });

  test(`${id}: save → load in the middle of any playback state continues exactly as if nothing had happened`, () => {
    for (let seed = 1; seed <= Math.min(SEEDS, 14); seed++) {
      const r = rig(id); let checked = 0;
      drive(r, seed, 60, { onOp: (name, k, rng, trail) => {
        if (r.w.recorder || k % 3 !== 0) return;
        const snap = clone(r.w.snapshot()), w2 = new World(r.level); w2.restore(snap);
        const here = signature(r.w), there = signature(w2);
        assert.equal(there, here, `seed ${seed}: state right after loading differs (after ${trail.slice(-5).join(' → ')})`);
        const inp = IN({ mx: rng() < 0.5 ? 1 : 0, mz: rng() < 0.5 ? -1 : 0, yaw: 0.3 });
        for (let t = 0; t < 25; t++) { r.w.step(inp); w2.step(inp); const a = signature(r.w), b = signature(w2); if (a !== b) assert.fail(`seed ${seed}: loaded world diverged ${t + 1} ticks after loading (after ${trail.slice(-5).join(' → ')})`); }
        checked++;
      } });
      assert.ok(checked >= 5, `seed ${seed}: only ${checked} save/load checks ran`);
    }
  });

  test(`${id}: rewind (F6) restores the exact earlier state and the future then unfolds identically`, () => {
    for (let seed = 1; seed <= Math.min(SEEDS, 10); seed++) {
      const r = rig(id); let cap = null, sigAt = null, ref = null, n = 0;
      drive(r, seed, 56, { onOp: (name, k, rng, trail) => {
        if (r.w.recorder) return;
        if (k % 14 === 5) { cap = r.w.capture(); sigAt = signature(r.w); const w2 = new World(r.level); w2.restore(clone(r.w.snapshot())); ref = w2; }
        if (k % 14 === 12 && cap) {
          r.w.reinstate(cap); const after = signature(r.w); assert.equal(after, sigAt, `seed ${seed}: rewinding did not restore the captured state (${trail.slice(-6).join(' → ')})`);
          for (let t = 0; t < 25; t++) { r.w.step(IN({ mx: 1 })); ref.step(IN({ mx: 1 })); if (signature(r.w) !== signature(ref)) assert.fail(`seed ${seed}: the future after a rewind differs from the original future at +${t + 1}`); }
          cap = null; n++;
        }
      } });
    }
  });
}

test('playback boundaries: every mode and rate visits the first and last frame the way its definition says', () => {
  const r = rig('ch1'), w = r.w; w.caps.modes = ['once', 'loop', 'pingpong', 'hold'];
  const p0 = [...w.player.st]; w.startRecording(0, { x0: p0[0] - 6, x1: p0[0] + 6, y0: -1, y1: 4, z0: p0[2] - 6, z1: p0[2] + 6 }, 'bd');
  for (let i = 0; i < 90; i++) w.step(IN({ mx: i < 45 ? 1 : -1 })); w.stopRecording();
  const L = w.recordings[0].length, seq = (mode, rate, n = L * 3) => { const out = []; w.stop(0); w.playbacks[0].mode = mode; w.playbacks[0].rate = rate; w.play(0, {}); for (let i = 0; i < n; i++) { const pb = w.playbacks[0]; if (!pb.active) { out.push('end'); break; } out.push(pb.tau); w.step(IN()); } return out; };
  const f = seq('once', 1); assert.deepEqual(f.slice(0, L), [...Array(L).keys()], 'forward once visits 0…L-1 exactly once each, in order'); assert.equal(f[L], 'end', 'then ends');
  const b = seq('once', -1); assert.deepEqual(b.slice(0, L), [...Array(L).keys()].reverse(), 'reverse once visits L-1…0 exactly once each'); assert.equal(b[L], 'end');
  const h = seq('hold', 1); assert.equal(h[L - 1], L - 1); assert.ok(h.slice(L - 1).every((t) => t === L - 1), 'hold stays on the final frame');
  const hb = seq('hold', -1); assert.equal(hb[L - 1], 0); assert.ok(hb.slice(L - 1).every((t) => t === 0), 'reverse hold stays on the first frame');
  const lp = seq('loop', 1, L * 2 + 5); assert.equal(lp[L], 0, 'loop wraps from L-1 straight to 0'); assert.equal(lp[L - 1], L - 1);
  const lpr = seq('loop', -1, L * 2 + 5); assert.equal(lpr[0], L - 1); assert.equal(lpr[L - 1], 0); assert.equal(lpr[L], L - 1, 'reverse loop wraps from 0 to L-1');
  const pp = seq('pingpong', 1, L * 3); assert.ok(pp.includes(0) && pp.includes(L - 1) && pp.every((t, i) => i === 0 || Math.abs(t - pp[i - 1]) <= 1), 'pingpong turns at both ends without skipping a frame');
  const slow = seq('once', 0.25, L * 4 + 8); assert.deepEqual(slow.slice(0, 8), [0, 0, 0, 0, 1, 1, 1, 1], 'quarter speed holds each frame for four ticks'); assert.equal(slow[L * 4 - 1], L - 1, 'and still reaches the last frame');
  const fast = seq('once', 2, L); assert.equal(fast[0], 0); assert.ok(fast.every((t, i) => i === 0 || t === 'end' || t - fast[i - 1] === 2), 'double speed steps by two');
});
