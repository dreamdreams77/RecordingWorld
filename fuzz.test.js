// Randomised play with a fixed seed. Any player action, in any order, must keep the simulation
// finite and inside the room. The seed is fixed, so a failure can be replayed exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { WORLD_W, WORLD_H } from '../src/sim.js';

// Linear congruential generator: small, fast, and identical on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function randomAction(g, r) {
  const roll = r();
  const zone = g.level.dropZones[0];
  if (roll < 0.05) g.setRegion(r() * 800, r() * 400, 60 + r() * 400, 60 + r() * 300);
  else if (roll < 0.10) g.toggleRecording();
  else if (roll < 0.15 && zone) g.dropAt(zone.x + r() * zone.w, zone.y + r() * zone.h);
  else if (roll < 0.18) g.resetLevel();
  else if (roll < 0.22) g.playSelected();
  else if (roll < 0.24) g.stopPlayback();
  else if (roll < 0.27) g.toggleSelect(Math.floor(r() * 9));
  else if (roll < 0.29) g.deleteLastRecording();
  else if (roll < 0.31 && g.world.emitters[0]) g.moveEmitter(g.world.emitters[0], r() * 1000);
  else if (roll < 0.33 && g.world.doors[0]) g.toggleDoor(g.world.doors[0]);
  else if (roll < 0.34) g.removeBodyAt(r() * WORLD_W, r() * WORLD_H);
  else if (roll < 0.345) g.clearRegion();
  else if (roll < 0.3475) g.clearRecordings();
  else if (roll < 0.3485) g.undoDrop();
  else if (roll < 0.3495) g.selectAll();
  else if (roll < 0.3497) g.deleteRecording(Math.floor(r() * 9));
  else if (roll < 0.35) g.advance();
}

// Invariants that must hold after every tick, whatever the player did.
function assertConsistent(g, where) {
  for (const id of g.selected) {
    assert.ok(Number.isInteger(id) && id >= 1 && id <= g.recordings.length, `selection ${id} names a real recording (${where})`);
  }
  assert.ok(g.maxUnlocked >= 0 && g.maxUnlocked < LEVELS.length, `unlock in range (${where})`);
  assert.ok(g.levelIndex <= g.maxUnlocked, `current level is unlocked (${where})`);
  assert.ok(g.lastLevel >= 0 && g.lastLevel <= g.maxUnlocked, `last level is unlocked (${where})`);
  assert.doesNotThrow(() => JSON.stringify(g.progress), `progress serialises (${where})`);
  for (const [name, v] of Object.entries(g.stats)) {
    assert.ok(Number.isFinite(v) && v >= 0, `stat ${name} is a non-negative number (${where})`);
  }
  if (g.region) assert.ok(g.region.w >= 0 && g.region.h >= 0, `region has a size (${where})`);
}

test('random play keeps every body finite and inside the room, across all levels', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const r = rng(seed);
    const g = new Game(LEVELS, { maxUnlocked: LEVELS.length - 1 });
    for (let level = 0; level < LEVELS.length; level++) {
      g.loadLevel(level);
      for (let t = 0; t < 800; t++) {
        randomAction(g, r);
        g.tick();
        assertConsistent(g, `seed ${seed} level ${level} tick ${t}`);
        for (const b of g.world.bodies) {
          const where = `seed ${seed} level ${level} tick ${t}`;
          assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `finite position (${where})`);
          assert.ok(b.x > -40 && b.x < WORLD_W + 40 && b.y > -40 && b.y < WORLD_H + 40, `inside the room (${where}, at ${b.x.toFixed(1)}, ${b.y.toFixed(1)})`);
        }
      }
    }
  }
});
