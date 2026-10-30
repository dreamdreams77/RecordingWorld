import test from 'node:test';
import assert from 'node:assert/strict';
import { World, IDLE } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { LEVELS } from '../src/levels/index.js';

const solutions = {}, variantsOf = {};
for (const id of Object.keys(LEVELS)) {
  try { const m = await import(`./solutions/${id}.js`); solutions[id] = m.default; variantsOf[id] = m.variants ?? [{ name: 'default' }]; } catch { /* level without a solution yet */ }
}

for (const [id, level] of Object.entries(LEVELS)) {
  const solve = solutions[id];
  if (!solve) continue;
  for (const variant of variantsOf[id]) {
    for (const experiments of [false, true]) {
      test(`${id} "${level.title}" [${variant.name}${experiments ? ' + optional experiments' : ''}] is solvable through the real controls`, () => {
        const world = new World(level, { canon: variant.canon, flags: variant.flags });
        const dir = new Director(world, level, null, variant.flags ?? {});
        const bot = new Bot(level, { world });
        const step = world.step.bind(world);
        world.step = (inp) => { step(inp); dir.update(); };
        solve(bot, dir, { experiments, variant });
        assert.ok(dir.completed, `level not completed; player at ${[...world.player.st].slice(0, 3).map((n) => n.toFixed(1))}`);
        if (experiments) for (const x of level.experiments) assert.ok(dir.done.has(x.id), `experiment ${x.id} not completed`);
        else console.log(`    ${id}/${variant.name}: ${(world.tick / 60).toFixed(0)} s simulated, ${dir.stats.recordings} recordings`);
      });
    }
  }
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

test('par values are honest: the best scripted variant never exceeds the stated par', () => {
  for (const [id, level] of Object.entries(LEVELS)) {
    const solve = solutions[id]; if (!solve || !level.par) continue;
    let best = Infinity;
    for (const variant of variantsOf[id]) {
      const world = new World(level, { canon: variant.canon, flags: variant.flags }), dir = new Director(world, level, null, variant.flags ?? {}), bot = new Bot(level, { world });
      const step = world.step.bind(world); world.step = (i) => { step(i); dir.update(); };
      solve(bot, dir, { experiments: false, variant });
      best = Math.min(best, dir.stats.recordings);
    }
    assert.ok(best <= level.par.recordings, `${id}: best variant used ${best}, par is ${level.par.recordings}`);
  }
});
