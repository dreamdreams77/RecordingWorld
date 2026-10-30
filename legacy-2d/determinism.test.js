// Whole-game determinism: the same inputs at the same ticks produce the same state hash on
// every tick. This is the property that makes recordings reproducible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { hashWorld } from '../src/sim.js';

// A scripted session: region, record, drop, stop, reset, replay. Returns the hash trace.
function session(levelIndex) {
  const g = new Game(LEVELS);
  g.loadLevel(levelIndex);
  const trace = [];
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  const drop = g.level.dropZones[0];
  g.dropAt(drop.x + drop.w / 2, drop.y + drop.h / 2);
  for (let i = 0; i < 400; i++) { g.tick(); trace.push(hashWorld(g.world)); }
  g.toggleRecording();
  g.resetLevel();
  g.selected = new Set([1]);
  g.playSelected();
  for (let i = 0; i < 400; i++) { g.tick(); trace.push(hashWorld(g.world)); }
  return trace;
}

for (const idx of [0, 1, 2, 3, 4, 5]) {
  test(`level ${idx + 1} replays with an identical hash on every tick`, () => {
    assert.deepEqual(session(idx), session(idx));
  });
}
