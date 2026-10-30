// Simulation benchmark: how many fixed steps per second each chapter sustains, with and without live echoes.
// The budget at 60 Hz is 16.7 ms per frame; the sim should use a small fraction of that.
import { World, IDLE } from '../src/sim/world.js';
import { LEVELS } from '../src/levels/index.js';

const N = 3000;
const rows = [];
for (const [id, level] of Object.entries(LEVELS)) {
  const w = new World(level);
  for (let i = 0; i < 120; i++) w.step(IDLE); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < N; i++) w.step(IDLE);
  const idle = (performance.now() - t0) / N;
  // stress: record the area around the player for 2 s, then loop it in every slot
  const p = w.player.st, v = { x0: p[0] - 6, x1: p[0] + 6, y0: p[1] - 2, y1: p[1] + 4, z0: p[2] - 6, z1: p[2] + 6 };
  w.startRecording(0, v, 'bench'); for (let i = 0; i < 130; i++) w.step(IDLE); w.stopRecording();
  let layers = 0;
  for (let s = 0; s < 6 && w.recordings[0]; s++) { try { w.recordings[s] = w.recordings[0]; w.play(s, { mode: 'loop' }); layers++; } catch { /* slot cap */ } }
  const t1 = performance.now();
  for (let i = 0; i < N; i++) w.step(IDLE);
  const busy = (performance.now() - t1) / N;
  rows.push([id, Object.keys(level.entities ?? {}).length || w.layers?.length || '', idle, busy, layers]);
}
console.log('chapter  ms/step(idle)  ms/step(echoes)  echoes  headroom@60Hz');
for (const [id, , idle, busy, n] of rows) console.log(`${id.padEnd(8)} ${idle.toFixed(3).padStart(12)} ${busy.toFixed(3).padStart(15)} ${String(n).padStart(7)}  ${(16.7 / Math.max(busy, 1e-6)).toFixed(0)}x`);
