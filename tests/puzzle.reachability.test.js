// Bypass hunt: with every door closed and nothing recorded, the player must not be able to reach the next section by
// walking, jumping, or (where a crate is at hand) jumping from a crate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, CAMPAIGN } from '../src/levels/index.js';
import { reachable } from './helpers/reach.js';

const goalOf = (level, i) => { const next = level.sections[i + 1]; if (next) return { box: next.trigger, name: `section ${next.id}` }; const ex = level.exit?.box ?? level.exits?.[0]?.box; return ex ? { box: ex, name: 'the exit' } : null; };
export const transitions = (id) => { const level = LEVELS[id]; return level.sections.map((s, i) => ({ level, from: s.checkpoint.pos, fromName: s.id, goal: goalOf(level, i) })).filter((t) => t.goal); };

for (const id of CAMPAIGN) {
  test(`${id}: nothing can be bypassed by walking and jumping — every section gate holds`, () => {
    const bad = [];
    for (const t of transitions(id)) {
      const r = reachable(t.level, t.from, t.goal.box, { jump: 1.1 });
      if (r.reached) bad.push(`${t.fromName} → ${t.goal.name}: reachable at ${r.at.map((v) => v.toFixed(1))} (${r.nodes} nodes)`);
    }
    assert.deepEqual(bad, [], `possible bypasses in ${id}:\n  ${bad.join('\n  ')}`);
  });
}

test('the bypass analysis itself works: remove a door and it finds the way through; hazards and walls still block', () => {
  const level = LEVELS.ch1, t = transitions('ch1')[0];
  assert.equal(reachable(level, t.from, t.goal.box, { jump: 1.1 }).reached, false, 'closed: unreachable');
  const doorId = level.entities.find((e) => e.type === 'slider' && e.mode === 'door' && e.pos[2] < t.from[2] && e.pos[2] > t.goal.box[2] - 2)?.id;
  assert.ok(doorId, 'found the section\'s door');
  const holed = { ...level, entities: level.entities.filter((e) => e.id !== doorId) };
  assert.equal(reachable(holed, t.from, t.goal.box, { jump: 1.1 }).reached, true, `without ${doorId} the next section is reachable — the analysis can see a hole`);
  const ch2 = LEVELS.ch2, d = transitions('ch2').find((x) => x.fromName === 'd');
  const noLaser = { ...ch2, entities: ch2.entities.filter((e) => e.id !== 'laser') };
  assert.equal(reachable(noLaser, d.from, d.goal.box, { jump: 1.1 }).reached, true, 'without the laser floor the Dead Field is just a hall');
});

for (const id of CAMPAIGN) {
  test(`${id}: even jumping from a 1 m crate (reach 2.1 m) no section gate can be cleared without its mechanism`, () => {
    const bad = [];
    for (const t of transitions(id)) { const r = reachable(t.level, t.from, t.goal.box, { jump: 2.1 }); if (r.reached) bad.push(`${t.fromName} → ${t.goal.name}: reachable at ${r.at.map((v) => v.toFixed(1))}`); }
    assert.deepEqual(bad, [], `crate-assisted bypasses in ${id}:\n  ${bad.join('\n  ')}`);
  });
}
