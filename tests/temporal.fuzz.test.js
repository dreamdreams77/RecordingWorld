// Temporal integrity: seeded random sequences of every verb of the instrument, against real levels, with hard invariants
// checked after every operation. Every failure prints the seed and the operation trail so it can be replayed exactly.
//   FUZZ_SEEDS=200 node --test tests/temporal.fuzz.test.js     (default 24 seeds per level)
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { LEVELS } from '../src/levels/index.js';
import { rig, ops, mulberry32, IN, HOMES, signature, recSum } from './helpers/temporal.js';

const SEEDS = +(process.env.FUZZ_SEEDS ?? 24);
const clone = (o) => JSON.parse(JSON.stringify(o));
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
