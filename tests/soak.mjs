// Performance and memory soak for the simulation and the instrument (run: node --expose-gc tests/soak.mjs).
import { World } from '../src/sim/world.js';
import { Instrument } from '../src/game/instrument.js';
import { LEVELS } from '../src/levels/index.js';
const IN = (o = {}) => ({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0, ...o });
const mb = () => { global.gc?.(); return process.memoryUsage().heapUsed / 1048576; };
const pct = (a, q) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
let bad = 0; const row = (name, v, ok, note = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(58)} ${v} ${note}`); if (!ok) bad++; };

// 1. many objects, six full-length echoes: time per step
for (const id of ['ch2', 'ch5', 'ch6']) {
  const w = new World(LEVELS[id]); w.caps.slots = 6; w.recordings = Array(6).fill(null); w.playbacks = Array(6).fill(null); w.undo = Array.from({ length: 6 }, () => []); w.caps.modes = ['once', 'loop', 'pingpong', 'hold']; w.caps.maxTicks = 600; w.caps.maxVolume = [40, 20, 60];
  const p = w.player.st, vol = { x0: p[0] - 18, x1: p[0] + 18, y0: -2, y1: 12, z0: p[2] - 28, z1: p[2] + 8 };
  for (let s = 0; s < 6; s++) { w.startRecording(s, vol, 'big'); for (let i = 0; i < 600; i++) w.step(IN({ mx: Math.sin(i / 40 + s), mz: Math.cos(i / 55) })); w.stopRecording(); }
  const tracks = w.recordings.map((r) => r.tracks.size), kf = w.recordings.reduce((a, r) => a + r.keyframes, 0), bytes = w.recordings.reduce((a, r) => a + r.bytes, 0);
  w.playAll({ mode: 'loop' }); for (let i = 0; i < 120; i++) w.step(IN());
  const t = []; for (let i = 0; i < 1500; i++) { const a = performance.now(); w.step(IN({ mx: Math.sin(i / 30) })); t.push(performance.now() - a); }
  row(`${id}: six 600-tick echoes of ${Math.max(...tracks)} objects — step p50 / p99 / max (ms)`, `${pct(t, 0.5).toFixed(2)} / ${pct(t, 0.99).toFixed(2)} / ${Math.max(...t).toFixed(2)}`, pct(t, 0.99) < 6, `(${(bytes / 1024).toFixed(0)} KB of recordings, ${kf} keyframes)`);
}
// 2. record / play / erase churn: heap must not grow
{
  const w = new World(LEVELS.ch2), p = w.player.st, vol = { x0: p[0] - 8, x1: p[0] + 8, y0: -1, y1: 6, z0: p[2] - 12, z1: p[2] + 4 }; w.caps.modes = ['once', 'loop'];
  const cycle = () => { w.startRecording(0, vol, 'c'); for (let i = 0; i < 90; i++) w.step(IN({ mx: 1 })); w.stopRecording(); w.play(0, { mode: 'loop' }); for (let i = 0; i < 20; i++) w.step(IN()); w.eraseRecording(0); w.undo[0].length = 0; w.events.length = 0; };
  for (let i = 0; i < 30; i++) cycle(); const h0 = mb(); for (let i = 0; i < 400; i++) cycle(); const h1 = mb();
  row('400 record → play → erase cycles: heap growth (MB)', (h1 - h0).toFixed(2), h1 - h0 < 8);
}
// 3. scrub / preview storm through the instrument
{
  const w = new World(LEVELS.ch1), g = { world: w, selected: 0, audio: null, hud: { toast() {} }, feel() {}, level: {}, frameMode: false, pinned: null }, I = new Instrument(g); g.instr = I;
  const p = w.player.st; w.startRecording(0, { x0: p[0] - 6, x1: p[0] + 6, y0: -1, y1: 4, z0: p[2] - 10, z1: p[2] + 4 }, 's'); for (let i = 0; i < 600; i++) w.step(IN({ mx: Math.sin(i / 30) })); w.stopRecording();
  for (let i = 0; i < 2000; i++) { I.scrubTo(i % 600); I.ghost(); } const h0 = mb(), t0 = performance.now(), N = 200000;
  for (let i = 0; i < N; i++) { I.scrubTo((i * 37) % 600, { quiet: true }); I.ghost(); if (i % 50 === 0) I.jumpMarker(1); } const dt = performance.now() - t0, h1 = mb();
  row(`${N} scrub+ghost operations: µs each / heap growth (MB)`, `${(dt / N * 1000).toFixed(1)} / ${(h1 - h0).toFixed(2)}`, dt / N < 0.05 && h1 - h0 < 6);
}
// 4. save / load churn with six echoes playing
{
  const w = new World(LEVELS.ch2); w.caps.slots = 6; w.recordings = Array(6).fill(null); w.playbacks = Array(6).fill(null); w.undo = Array.from({ length: 6 }, () => []); w.caps.modes = ['once', 'loop'];
  const p = w.player.st, vol = { x0: p[0] - 9, x1: p[0] + 9, y0: -1, y1: 8, z0: p[2] - 20, z1: p[2] + 4 };
  for (let s = 0; s < 6; s++) { w.startRecording(s, vol, 'sv'); for (let i = 0; i < 400; i++) w.step(IN({ mx: Math.sin(i / 30 + s) })); w.stopRecording(); } w.playAll({ mode: 'loop' });
  const size = JSON.stringify(w.snapshot()).length; let cur = w; const h0 = mb(), t0 = performance.now();
  for (let i = 0; i < 60; i++) { const nw = new World(LEVELS.ch2); nw.caps = { ...w.caps }; nw.recordings = Array(6).fill(null); nw.playbacks = Array(6).fill(null); nw.restore(JSON.parse(JSON.stringify(cur.snapshot()))); cur = nw; }
  const dt = (performance.now() - t0) / 60, h1 = mb();
  row('save+load with six 400-tick recordings: snapshot KB / ms per cycle', `${(size / 1024).toFixed(0)} / ${dt.toFixed(1)}`, size < 3 * 1048576 && dt < 120, `heap +${(h1 - h0).toFixed(1)} MB`);
}
console.log(bad ? `\n${bad} soak check(s) failed` : '\nsoak ok'); process.exit(bad ? 1 : 0);
