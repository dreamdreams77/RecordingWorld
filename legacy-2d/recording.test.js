// Reconciliation tests: discord (R7) and the presence and placement rules in context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addWall, addPlate, spawnBall, step, FLOOR_Y } from '../src/sim.js';
import { Recorder, Playbacks } from '../src/recording.js';

// Records one ball falling straight down at x=100 in an empty room.
function recordFall() {
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  spawnBall(w, 100, 60);
  const rec = new Recorder(w, { x: 0, y: 0, w: 300, h: 540 }, 'fall');
  for (let i = 0; i < 200; i++) { step(w); rec.sample(w); }
  return rec.finish();
}

function playInto(world, rec, ticks) {
  const pb = new Playbacks();
  pb.start(world, rec);
  for (let i = 0; i < ticks; i++) {
    world.echoLights.length = 0;
    world.conflicts.length = 0;
    pb.beginTick();
    step(world);
    pb.endTick();
  }
  return pb;
}

test('control: an unobstructed echo lands on a plate in its path', () => {
  const rec = recordFall();
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  const plate = addPlate(w, 'p', 90, FLOOR_Y - 12, 40, 12, []);
  let hit = false;
  const pb = new Playbacks();
  pb.start(w, rec);
  for (let i = 0; i < 200; i++) {
    w.echoLights.length = 0; w.conflicts.length = 0;
    pb.beginTick(); step(w); pb.endTick();
    if (plate.echoHits > 0) hit = true;
  }
  assert.equal(hit, true, 'echo should press the plate on its recorded path');
});

test('R7: an echo blocked from its memory goes ghost and can no longer press plates', () => {
  const rec = recordFall();
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  addWall(w, 60, 300, 80, 20);               // a live obstruction across the recorded path
  const plate = addPlate(w, 'p', 90, FLOOR_Y - 12, 40, 12, []);

  let pressedEver = false;
  let ghostSeen = false;
  const pb = new Playbacks();
  pb.start(w, rec);
  for (let i = 0; i < 200; i++) {
    w.echoLights.length = 0; w.conflicts.length = 0;
    pb.beginTick(); step(w); pb.endTick();
    if (plate.echoHits > 0) pressedEver = true;
    const e = pb.list[0] && pb.list[0].echoes[0];
    if (e && e.body.ghost) ghostSeen = true;
  }
  assert.equal(ghostSeen, true, 'a long-stalled echo must lose coherence');
  assert.equal(pressedEver, false, 'a ghost must not press plates');
  assert.ok(w.bodies.some((b) => b.echo && b.ghost) || ghostSeen);
});

test('R7: discord recovers when an echo returns to its memory', () => {
  const rec = recordFall();
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  const pb = new Playbacks();
  pb.start(w, rec);
  // Unobstructed: the echo stays on its path, so discord must stay at zero.
  for (let i = 0; i < 200; i++) {
    w.echoLights.length = 0; w.conflicts.length = 0;
    pb.beginTick(); step(w); pb.endTick();
  }
  const e = pb.list.length ? pb.list[0].echoes[0] : null;
  assert.ok(!e || e.discord === 0, 'an echo that follows memory accumulates no discord');
});
