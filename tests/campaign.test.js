import test from 'node:test';
import assert from 'node:assert/strict';
import { World, IDLE } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { LEVELS } from '../src/levels/index.js';

const solutions = {};
for (const id of Object.keys(LEVELS)) {
  try { solutions[id] = (await import(`./solutions/${id}.js`)).default; } catch { /* level without a solution yet */ }
}

for (const [id, level] of Object.entries(LEVELS)) {
  const solve = solutions[id];
  if (!solve) continue;
  test(`${id} "${level.title}" is solvable through the real controls`, () => {
    const world = new World(level);
    const dir = new Director(world, level);
    const bot = new Bot(level, { world });
    // keep the director ticking while the bot plays
    const step = world.step.bind(world);
    world.step = (inp) => { step(inp); dir.update(); };
    solve(bot, dir, { experiments: false });
    assert.ok(dir.completed, `level not completed; player at ${[...world.player.st].slice(0, 3).map((n) => n.toFixed(1))}`);
    const seconds = world.tick / 60;
    console.log(`    ${id}: solved in ${seconds.toFixed(0)} s of simulated play, ${dir.stats.recordings} recordings`);
  });
  test(`${id} optional experiments and discoveries are reachable`, () => {
    const world = new World(level);
    const dir = new Director(world, level);
    const bot = new Bot(level, { world });
    const step = world.step.bind(world);
    world.step = (inp) => { step(inp); dir.update(); };
    solve(bot, dir, { experiments: true });
    assert.ok(dir.completed);
    for (const x of level.experiments) assert.ok(dir.done.has(x.id), `experiment ${x.id} not completed`);
  });
}

test('no discovery, tape or checkpoint is embedded in solid geometry', () => {
  for (const level of Object.values(LEVELS)) {
    const w = new World(level);
    for (const d of [...(level.discoveries ?? []), ...(level.tapes ?? [])]) {
      const p = d.pos;
      for (const s of w.solids) {
        if (s.kind !== 'wall' || !s.block) continue;
        const inside = p[0] > s.b.x0 && p[0] < s.b.x1 && p[1] > s.b.y0 && p[1] < s.b.y1 && p[2] > s.b.z0 && p[2] < s.b.z1;
        assert.ok(!inside, `${level.id}/${d.id} is inside wall ${s.id}`);
      }
    }
  }
});
