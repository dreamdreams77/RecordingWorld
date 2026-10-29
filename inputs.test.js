// The verbs behind a click and the G key, and the pure helpers for the keyboard cursor and scrubbing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { stepCursor, CURSOR_STEP } from '../src/cursor.js';
import { scrubTo } from '../src/scrub.js';

test('act drops a ball inside the drop zone and reports it', () => {
  const g = new Game(LEVELS);
  const z = g.level.dropZones[0];
  assert.equal(g.act(z.x + z.w / 2, z.y + z.h / 2), 'dropped');
  assert.equal(g.world.bodies.length, 1);
});

test('act refuses a drop outside the drop zones', () => {
  const g = new Game(LEVELS);
  assert.equal(g.act(-50, -50), 'refused');
  assert.equal(g.world.bodies.length, 0);
});

test('act removes a loose ball at the position', () => {
  const g = new Game(LEVELS);
  const z = g.level.dropZones[0];
  const x = z.x + z.w / 2, y = z.y + z.h / 2;
  g.act(x, y);
  assert.equal(g.act(x, y), 'removed');
  assert.equal(g.world.bodies.length, 0);
});

test('act toggles a door at the position, in the first level that has one', () => {
  const g = new Game(LEVELS);
  let door = null;
  for (let i = 0; i < LEVELS.length && !door; i++) {
    g.loadLevel(i);
    door = g.world.doors[0] || null;
  }
  assert.ok(door, 'some level has a door to test against');
  const before = door.open;
  assert.equal(g.act(door.x + door.w / 2, door.y + door.h / 2), 'door');
  assert.equal(door.open, !before);
});

test('the keyboard cursor moves one step per arrow and stays inside the room', () => {
  const c = { x: 100, y: 100 };
  assert.deepEqual(stepCursor(c, 'ArrowLeft', 960, 540), { x: 100 - CURSOR_STEP, y: 100 });
  assert.deepEqual(stepCursor(c, 'ArrowDown', 960, 540), { x: 100, y: 100 + CURSOR_STEP });
  assert.deepEqual(stepCursor({ x: 0, y: 0 }, 'ArrowUp', 960, 540), { x: 0, y: 0 });
  assert.deepEqual(stepCursor({ x: 960, y: 540 }, 'ArrowRight', 960, 540), { x: 960, y: 540 });
});

test('a non-arrow key leaves the cursor where it is', () => {
  assert.deepEqual(stepCursor({ x: 5, y: 7 }, 'a', 960, 540), { x: 5, y: 7 });
});

test('the timeline position is clamped between 0 and the longest recording', () => {
  assert.equal(scrubTo(0, -10, 120), 0);
  assert.equal(scrubTo(50, 10, 120), 60);
  assert.equal(scrubTo(115, 60, 120), 120);
  assert.equal(scrubTo(5, 10, 0), 0, 'with no recordings the position stays at 0');
});
