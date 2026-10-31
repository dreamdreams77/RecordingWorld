// Hand-built temporal edge cases that random sequences rarely reach: objects removed, replaced or created while history
// is recorded and replayed; freezing; recording over a live echo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { LEVELS } from '../src/levels/index.js';

const IN = (o = {}) => ({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0, ...o });
const run = (w, n, inp) => { for (let i = 0; i < n; i++) w.step(inp ?? IN()); };
const sandbox = () => { const w = new World(LEVELS.sandbox); w.caps.modes = ['once', 'loop', 'pingpong', 'hold']; w.teleportPlayer([0, 0, 6], 0); return w; };
const crate = (w, id = 'c1', pos = [0, 0.5, 0]) => w.addEntity({ id, type: 'crate', pos, size: [1, 1, 1], dyn: true });
const VOL = { x0: -4, x1: 4, y0: -1, y1: 4, z0: -4, z1: 8 };
const echoOf = (w, id, layer = 1) => w.aliveList.find((L) => L.echo && L.id === id && L.layer === layer);

test('an object removed from the present is still there when its history returns — and leaves with it', () => {
  const w = sandbox(); crate(w); run(w, 20); w.startRecording(0, VOL, 'crate'); run(w, 60); w.stopRecording();
  w.removeEntity('c1'); run(w, 5);
  assert.equal(w.byId.get('c1'), undefined, 'the present crate is gone');
  w.play(0, { mode: 'loop' }); run(w, 3);
  const e = echoOf(w, 'c1'); assert.ok(e, 'its recorded history comes back as an echo'); assert.ok(Math.abs(e.st[1] - 0.5) < 0.05, 'standing where it stood');
  assert.ok(w.solids.some((s) => s.layer === 1 && s.id === 'c1'), 'and it is solid');
  w.stop(0); run(w, 2); assert.equal(echoOf(w, 'c1'), undefined, 'stopping removes it completely'); assert.ok(!w.solids.some((s) => s.id === 'c1'), 'leaving no invisible collider behind');
});

test('a replacement in the present coexists with the historical version and is never altered by it', () => {
  const w = sandbox(); crate(w); run(w, 20); w.startRecording(0, VOL, 'crate'); run(w, 60); w.stopRecording();
  w.removeEntity('c1'); crate(w, 'c1', [2.5, 0.5, 2]); run(w, 30);
  const before = [...w.byId.get('c1').st];
  w.play(0, { mode: 'loop' }); run(w, 120);
  assert.ok(echoOf(w, 'c1') && w.byId.get('c1'), 'both exist at once');
  assert.ok(Math.abs(echoOf(w, 'c1').st[0]) < 0.1 && Math.abs(w.byId.get('c1').st[0] - before[0]) < 0.3, 'each where its own history put it');
  w.stop(0); run(w, 30);
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(w.byId.get('c1').st[i] - before[i]) < 0.3 || i > 2, 'the present crate is unaffected by its history coming and going');
});

test('an object removed WHILE recording is not resurrected by playback after the moment it disappeared', () => {
  const w = sandbox(); crate(w); run(w, 20); w.startRecording(0, VOL, 'vanish'); run(w, 30); w.removeEntity('c1'); run(w, 40); w.stopRecording();
  w.play(0, { mode: 'hold' }); w.setHead(0, 15); run(w, 1); assert.ok(echoOf(w, 'c1'), 'before it vanished the crate is in the echo');
  w.setHead(0, 60); run(w, 1); assert.equal(echoOf(w, 'c1'), undefined, 'after it vanished, history no longer contains it');
});

test('an object created while recording appears in the echo exactly when it was created', () => {
  const w = sandbox(); run(w, 10); w.startRecording(0, VOL, 'appear'); run(w, 30); crate(w, 'late'); run(w, 40); w.stopRecording(); w.removeEntity('late');
  w.play(0, { mode: 'hold' }); w.setHead(0, 20); run(w, 1); assert.equal(echoOf(w, 'late'), undefined, 'not yet');
  w.setHead(0, 45); run(w, 1); assert.ok(echoOf(w, 'late'), 'there once it existed');
});

test('a frozen echo preserves its selected state exactly, however long it is held, and still acts on the world', () => {
  const w = new World(LEVELS.ch1), plate = w.byId.get('plateA'), [px, , pz] = plate.def.pos;
  w.teleportPlayer([px + 4, 0, pz], 0); w.startRecording(0, { x0: px - 3, x1: px + 6, y0: -1, y1: 3, z0: pz - 3, z1: pz + 3 }, 'on'); run(w, 15);
  w.teleportPlayer([px, 0, pz], 0); run(w, 40); w.teleportPlayer([px + 4, 0, pz], 0); run(w, 15); w.stopRecording();
  w.playFrom(0, 35, { frozen: true }); const snapshotOf = () => w.aliveList.filter((L) => L.echo).map((L) => `${L.id}:${[...L.st]}`).sort().join('|');
  const first = snapshotOf(); assert.ok(first.includes('player'), 'the echo is there');
  for (let k = 0; k < 20; k++) { run(w, 50, IN({ mx: 1 })); assert.equal(snapshotOf(), first, `echo state changed while frozen (after ${(k + 1) * 50} ticks)`); assert.equal(w.R.get('plateA'), 1, 'the frozen echo keeps the plate down'); }
  w.teleportPlayer([px + 4, 0, pz], 0); run(w, 5); assert.equal(w.R.get('plateA'), 1, 'even with the present player elsewhere');
});

test('recording over a playing echo: the old echo is gone at once, the old take is recoverable, nothing stale remains', () => {
  const w = new World(LEVELS.ch1), p = [...w.player.st];
  const vol = { x0: p[0] - 4, x1: p[0] + 4, y0: -1, y1: 4, z0: p[2] - 4, z1: p[2] + 4 };
  w.startRecording(0, vol, 'A'); run(w, 40, IN({ mx: 1 })); w.stopRecording(); const A = w.recordings[0];
  w.play(0, { mode: 'loop' }); run(w, 10); assert.ok(w.aliveList.some((L) => L.echo));
  w.startRecording(0, vol, 'B'); assert.ok(!w.aliveList.some((L) => L.echo), 'recording over a slot removes its echo immediately'); run(w, 30, IN({ mz: -1 })); w.stopRecording();
  assert.equal(w.recordings[0].name, 'B'); assert.equal(w.playbacks[0].active, false); assert.equal(w.playbacks[0].rec, w.recordings[0], 'the new playback belongs to the new take');
  assert.equal(w.rollbackRecording(0), A, 'the old take can be recovered'); assert.equal(w.playbacks[0].rec, A); assert.equal(w.recordings[0], A);
});

test('recordings survive 50 save/load cycles bit-for-bit, markers and all', async () => {
  const { Recording } = await import('../src/sim/recording.js');
  const w = new World(LEVELS.ch1), plate = w.byId.get('plateA'), [px, , pz] = plate.def.pos;
  w.teleportPlayer([px + 4, 0, pz], 0); w.startRecording(0, { x0: px - 3, x1: px + 6, y0: -1, y1: 3, z0: pz - 3, z1: pz + 3 }, 'rt');
  for (let i = 0; i < 6; i++) { w.teleportPlayer([px, 0, pz], 0); run(w, 15, IN({ jump: i % 2 === 0 })); w.teleportPlayer([px + 4, 0, pz], 0); run(w, 15); } w.stopRecording();
  const bytes = (r) => JSON.stringify([...r.tracks.values()].map((t) => [t.id, [...t.ticks], [...t.vals]])), A = w.recordings[0], a = bytes(A), m = JSON.stringify(A.markers);
  let cur = w; for (let i = 0; i < 50; i++) { const nw = new World(LEVELS.ch1); nw.restore(JSON.parse(JSON.stringify(cur.snapshot()))); cur = nw; }
  const B = cur.recordings[0]; assert.equal(bytes(B), a, 'track data identical after 50 round trips'); assert.equal(JSON.stringify(B.markers), m, 'and so are its markers'); assert.equal(B.length, A.length); assert.equal(B.name, A.name);
  assert.equal(JSON.stringify(Recording.fromJSON(JSON.parse(JSON.stringify(A.toJSON()))).markers), m);
});

test('regression: an echo of yourself appearing on top of you while you rise never throws you through the floor or across the level', () => {
  const w = sandbox(); w.teleportPlayer([0, 0, 0], 0); run(w, 30);
  w.startRecording(0, VOL, 'self'); run(w, 10); w.stopRecording();            // an echo of you, standing exactly where you stand
  w.playFrom(0, 3, { frozen: true });
  for (let i = 0; i < 6; i++) { const a = [...w.player.st.slice(0, 3)]; w.step(IN({ jump: i === 0 })); const d = Math.hypot(...[0, 1, 2].map((k) => w.player.st[k] - a[k])); assert.ok(d < 3.05, `tick ${i}: moved ${d.toFixed(2)} m`); }
  // and moving upward from inside the echo specifically (the case that used to tunnel)
  w.player.st[4] = 5; w.step(IN());
  assert.ok(w.player.st[2] < 6 && w.player.st[1] > -1, `the player is still inside the level (z ${w.player.st[2].toFixed(2)}, y ${w.player.st[1].toFixed(2)})`);
});

test('the sandbox bounds the cost: a world of many objects with six echoes still steps inside a frame budget at the sandbox limit (60)', () => {
  const w = sandbox(); w.caps.slots = 6; w.recordings = Array(6).fill(null); w.playbacks = Array(6).fill(null); w.undo = Array.from({ length: 6 }, () => []); w.caps.maxVolume = [60, 20, 60];
  for (let i = 0; i < 60; i++) crate(w, `c${i}`, [((i % 10) - 4.5) * 1.6, 0.5, -3 - Math.floor(i / 10) * 1.6]);
  run(w, 30);
  for (let s = 0; s < 6; s++) { w.startRecording(s, { x0: -20, x1: 20, y0: -1, y1: 8, z0: -30, z1: 10 }, 'm'); run(w, 200, IN({ mx: s % 2 ? 1 : -1, mz: -1 })); w.stopRecording(); }
  w.playAll({ mode: 'loop' }); const t = []; for (let i = 0; i < 200; i++) { const a = performance.now(); w.step(IN()); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); assert.ok(t[100] < 12, `median step ${t[100].toFixed(1)} ms with 60 objects and six echoes (budget 16.7 ms)`);
});
