// The ghost, the markers and the cursor are promises to the player. These tests hold them to those promises on recordings
// produced by real play (the campaign solutions) and by the seeded fuzzer, not on hand-made toys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { Instrument } from '../src/game/instrument.js';
import { Playback } from '../src/sim/recording.js';
import { LEVELS } from '../src/levels/index.js';
import { rig, ops, mulberry32, IN } from './helpers/temporal.js';

// every recording the campaign solutions actually make, with the world they were made in
async function campaignRecordings() {
  const out = [];
  for (const id of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']) {
    const mod = await import(`./solutions/${id}.js`), variant = (mod.variants ?? [{}])[0], level = LEVELS[id];
    const w = new World(level, { canon: variant.canon, flags: variant.flags }), dir = new Director(w, level, null, variant.flags ?? {}), bot = new Bot(level, { world: w });
    const step = w.step.bind(w); w.step = (i) => { step(i); dir.update(); };
    const stop = w.stopRecording.bind(w);
    w.stopRecording = (...a) => { const s = w.recorder?.slot; const r = stop(...a); if (r !== null && w.recordings[s]) out.push({ id, w, rec: w.recordings[s], slot: s }); return r; };
    try { mod.default(bot, dir, { variant }); } catch { /* the recordings made before any failure still count */ }
  }
  return out;
}
const fuzzRecordings = (id, seeds) => { const out = []; for (let seed = 1; seed <= seeds; seed++) { const r = rig(id), rng = mulberry32(seed * 7919 + id.length), table = ops(r, rng), names = Object.keys(table); for (let k = 0; k < 50; k++) table[names[Math.floor(rng() * names.length)]](); r.w.recordings.forEach((rec, slot) => rec && out.push({ id, w: r.w, rec, slot })); } return out; };

test('markers: every marker is a real change at exactly its tick, in the direction it claims', async () => {
  const sets = [...(await campaignRecordings()), ...fuzzRecordings('ch1', 6), ...fuzzRecordings('ch2', 4), ...fuzzRecordings('ch6', 4)];
  let checked = 0, kinds = new Set();
  for (const { rec } of sets) for (const m of rec.markers) {
    const tr = rec.tracks.get(m.id); assert.ok(tr, `marker for unknown track ${m.id}`); assert.ok(m.t >= 0 && m.t < rec.length, `marker tick ${m.t} outside [0, ${rec.length})`);
    const at = new Float64Array(tr.nch), before = new Float64Array(tr.nch), inAt = tr.sample(m.t, at), inBefore = m.t > 0 ? tr.sample(m.t - 1, before) : false;
    kinds.add(m.kind);
    if (m.kind === 'enter') { assert.ok(inAt && !inBefore, `${m.label}: not entering at ${m.t}`); }
    else if (m.kind === 'leave') { assert.ok(!inAt && inBefore, `${m.label}: not leaving at ${m.t}`); }
    else if (m.kind === 'note') { assert.ok(inAt && at[8] > 0, `${m.label}: no note at ${m.t}`); assert.ok(!inBefore || before[8] === 0, `${m.label}: note was already sounding`); }
    else if (m.kind === 'jump' || m.kind === 'move') { assert.ok(inAt, `${m.label} at ${m.t}: not present`); }
    else {
      const k = tr.def && Object.keys(LEVELS).length ? null : null; // keyCh comes from the type
      const T = (await import('../src/sim/types.js')).typeOf(tr.def).keyCh;
      assert.ok(inAt, `${m.label} at ${m.t}: object not present`);
      if (m.dir > 0) { assert.ok(at[T] >= 0.5, `${m.label} at ${m.t}: value ${at[T]} is not "on"`); if (inBefore) assert.ok(before[T] < 0.5, `${m.label} at ${m.t}: it was already on`); }
      else { assert.ok(at[T] < 0.5, `${m.label} at ${m.t}: value ${at[T]} is not "off"`); assert.ok(inBefore && before[T] >= 0.5, `${m.label} at ${m.t}: it was not on before`); }
    }
    checked++;
  }
  assert.ok(checked > 80, `only ${checked} markers examined`); assert.ok(['plate', 'door', 'leave', 'note', 'eye'].every((k) => kinds.has(k)), `kinds seen: ${[...kinds]}`);
});

test('markers are complete: every on/off change of a switch-like object has a marker', async () => {
  const { typeOf } = await import('../src/sim/types.js');
  for (const { rec } of [...(await campaignRecordings()), ...fuzzRecordings('ch1', 6)]) for (const tr of rec.tracks.values()) {
    const T = typeOf(tr.def), name = T.name; if (T.keyCh < 0 || ['player', 'crate', 'actor'].includes(name)) continue;
    const marks = new Set(rec.markers.filter((m) => m.id === tr.id).map((m) => m.t)), v = new Float64Array(tr.nch), p = new Float64Array(tr.nch);
    for (let t = 1; t < rec.length; t++) {
      const a = tr.sample(t - 1, p), b = tr.sample(t, v); if (!a || !b) continue;
      if ((p[T.keyCh] >= 0.5) !== (v[T.keyCh] >= 0.5)) assert.ok(marks.has(t), `${tr.id} (${name}) changed state at tick ${t} but has no marker`);
    }
  }
});

test('the ghost shows exactly what committing will put in the world — states, omissions and sealed history included', async () => {
  let compared = 0;
  for (const { id, w, rec, slot } of [...(await campaignRecordings()).slice(0, 14), ...fuzzRecordings('ch1', 4), ...fuzzRecordings('ch6', 3)]) {
    const g = { world: w, selected: slot, audio: null, hud: { toast() {} }, feel() {}, level: { sandbox: false }, frameMode: false, pinned: null }, I = new Instrument(g); g.instr = I;
    const ids = [...rec.tracks.keys()];
    for (const variant of ['plain', 'omit', 'sealed']) {
      w.stop(slot); w.recordings[slot] = rec; w.playbacks[slot] = new Playback(slot, rec); const pb = w.playbacks[slot];   // solutions reuse slots: examine the recording that was stored
      pb.muted = new Set(variant === 'omit' ? ids.slice(0, 1) : []); const sealed = variant === 'sealed' ? ids.slice(-1) : []; for (const s of sealed) w.sealed.add(s);
      for (const tick of [0, 1, rec.length >> 1, rec.length - 2, rec.length - 1]) {
        if (tick < 0 || tick >= rec.length) continue;
        w.stop(slot); I.cursor = { slot, tick, rec }; const gh = I.ghost(); assert.ok(gh, 'a preview exists for a stored recording');
        const preview = new Map(gh.entries.filter((e) => e.alive).map((e) => [e.id, [...e.st].join(',')]));
        w.playFrom(slot, tick, { frozen: true });
        const real = new Map(w.aliveList.filter((L) => L.echo && L.layer === slot + 1).map((L) => [L.id, [...L.st].join(',')]));
        assert.deepEqual([...preview.keys()].sort(), [...real.keys()].sort(), `${id} slot ${slot} tick ${tick} (${variant}): the ghost shows different objects than playback will create`);
        for (const [k, v] of preview) assert.equal(real.get(k), v, `${id} ${k} @${tick} (${variant}): preview state differs from committed state`);
        compared++;
      }
      for (const s of sealed) w.sealed.delete(s);
    }
    w.stop(slot);
  }
  assert.ok(compared > 100, `only ${compared} preview/commit comparisons ran`);
});

test('the cursor cannot outlive the recording it was set on', () => {
  const r = rig('ch1'), { w, I, g } = r; const p = [...w.player.st], vol = { x0: p[0] - 4, x1: p[0] + 4, y0: -1, y1: 4, z0: p[2] - 4, z1: p[2] + 4 };
  w.startRecording(0, vol, 'long'); for (let i = 0; i < 90; i++) w.step(IN({ mx: 1 })); w.stopRecording();
  I.scrubTo(80); assert.equal(I.head(), 80);
  w.startRecording(0, vol, 'short'); for (let i = 0; i < 12; i++) w.step(IN()); w.stopRecording();   // recorded over: a different, shorter take
  assert.ok(I.head() === null || I.head() <= w.recordings[0].length - 1, `stale cursor ${I.head()} on a ${w.recordings[0].length}-tick recording`);
  I.scrubTo(10); const cap = w.capture(); w.eraseRecording(0); assert.equal(I.head(), null, 'an erased recording has no cursor'); assert.equal(I.ghost(), null);
  w.reinstate(cap); assert.ok(I.head() === null || I.head() <= w.recordings[0].length - 1);
  I.scrubTo(5); w.rollbackRecording(0); assert.ok(I.head() === null || I.head() < w.recordings[0].length, 'rolling back to another take cannot leave an out-of-range cursor');
});

test('boundaries: stepping, jumping and scrubbing at the ends, on empty slots, and during recording', () => {
  const r = rig('ch1'), { w, I, g } = r; const p = [...w.player.st], vol = { x0: p[0] - 4, x1: p[0] + 4, y0: -1, y1: 4, z0: p[2] - 4, z1: p[2] + 4 };
  g.selected = 2; assert.equal(I.scrubBy(1), false, 'an empty slot cannot be scrubbed'); assert.equal(I.jumpMarker(1), null); assert.equal(I.freezeHere(), false); assert.equal(I.playHere(), false); assert.equal(I.ghost(), null);
  g.selected = 0; w.startRecording(0, vol, 'e'); for (let i = 0; i < 50; i++) w.step(IN({ mx: 1 })); w.stopRecording(); const L = w.recordings[0].length;
  I.scrubTo(0); assert.equal(I.scrubBy(-1), true); assert.equal(I.head(), 0, 'cannot step before the first tick'); I.scrubTo(L - 1); I.scrubBy(1); assert.equal(I.head(), L - 1, 'cannot step past the last tick');
  I.scrubTo(-50); assert.equal(I.head(), 0); I.scrubTo(L + 500); assert.equal(I.head(), L - 1); I.scrubTo(Number.NaN); assert.ok(Number.isFinite(I.head() ?? 0), 'NaN cannot poison the cursor');
  const last = w.recordings[0].markers.at(-1); I.scrubTo(L - 1); assert.equal(last && I.jumpMarker(1), last ? null : null, 'no marker after the last one'); I.scrubTo(0); assert.equal(I.jumpMarker(-1), null, 'no marker before the first');
  w.startRecording(1, vol, 'r2'); g.selected = 1; assert.equal(I.scrubTo(10), false, 'cannot scrub while recording'); w.stopRecording();
  g.selected = 0; I.scrubTo(L >> 1); const cur = I.cursor; w.startRecording(1, vol, 'r3'); w.step(IN()); w.stopRecording(); assert.equal(I.cursor, cur, 'recording elsewhere leaves the cursor alone');
});

test('keyboard reach: tick-exact stepping is still fast enough for a 600-tick recording (hold Shift + ".")', () => {
  const r = rig('ch1'), { w, I, g } = r; const p = [...w.player.st], vol = { x0: p[0] - 4, x1: p[0] + 4, y0: -1, y1: 4, z0: p[2] - 4, z1: p[2] + 4 };
  w.caps.maxTicks = 600; w.startRecording(0, vol, 'long'); for (let i = 0; i < 600; i++) w.step(IN({ mx: i % 100 < 50 ? 1 : -1 })); w.stopRecording(); assert.ok(w.recordings[0].length >= 590);
  const down = new Set(), pressed = new Set(), keys = { held: (...c) => c.some((k) => down.has(k)), hit: (...c) => c.some((k) => pressed.has(k)), dx: 0, wheel: 0 };
  const frames = (n, codes, shift) => { for (let f = 0; f < n; f++) { codes.forEach((c) => down.add(c)); if (shift) down.add('ShiftLeft'); if (f === 0) codes.forEach((c) => pressed.add(c)); I.keys(keys, 1 / 60); pressed.clear(); } down.clear(); };
  frames(1, ['Period'], false); assert.equal(I.head(), 1, 'a single tap is exactly one tick');
  I.scrubTo(0); frames(90, ['Period'], false); assert.ok(I.head() > 25 && I.head() < 200, `holding "." for 1.5 s reaches tick ${I.head()}`);
  I.scrubTo(0); frames(120, ['Period'], true); assert.ok(I.head() >= 300, `holding Shift + "." for 2 s reaches tick ${I.head()} (the Prism Hall needs 300)`);
  frames(1, ['Home'], false); assert.equal(I.head(), 0); frames(1, ['End'], false); assert.equal(I.head(), w.recordings[0].length - 1);
});
