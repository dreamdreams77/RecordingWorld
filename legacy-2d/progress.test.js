// Saved progress and the events that report on it: best times, erase, and messages for
// player actions that had no effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

const texts = (g) => g.events.map((e) => (typeof e === 'string' ? e : e.text));

// A stub level whose goal is always met, so completion can be triggered directly.
const alwaysDone = [{ id: 'stub', title: 'STUB', brief: [], goalText: 'x', dropZones: [], build() {}, goal: () => true, hint: '' }];

test('completing a level records its best time, and a faster run replaces it', () => {
  const g = new Game(alwaysDone);
  g.world.tick = 300;
  g.checkGoal();
  assert.equal(g.best.stub, 300);
  assert.ok(texts(g).some((t) => t.startsWith('NEW BEST')));

  g.loadLevel(0);
  g.world.tick = 400;
  g.checkGoal();
  assert.equal(g.best.stub, 300, 'a slower run does not replace the best');

  g.loadLevel(0);
  g.world.tick = 200;
  g.checkGoal();
  assert.equal(g.best.stub, 200);
});

test('best times are restored from saved progress, and unknown level ids are dropped', () => {
  const g = new Game(LEVELS, { best: { 'l1-latch': 120, 'nope': 5, 'l2-shadow': -3 } });
  assert.deepEqual(g.best, { 'l1-latch': 120 });
});

test('the progress snapshot carries unlocks, discoveries and best times', () => {
  const g = new Game(LEVELS, { maxUnlocked: 2, discoveries: ['found:ghost'], best: { 'l1-latch': 90 } });
  assert.deepEqual(g.progress, {
    maxUnlocked: 2, lastLevel: 0, discoveries: ['found:ghost'], best: { 'l1-latch': 90 },
    stats: { recordingsMade: 0, levelsCompleted: 0, playTicks: 0 },
  });
});

test('erasing progress clears unlocks, discoveries and best times, and keeps the current level', () => {
  const g = new Game(LEVELS, { maxUnlocked: 3, discoveries: ['found:ghost'], best: { 'l1-latch': 90 } });
  g.loadLevel(2);
  g.eraseProgress();
  assert.equal(g.maxUnlocked, 0);
  assert.equal(g.discoveries.size, 0);
  assert.deepEqual(g.best, {});
  assert.equal(g.levelIndex, 2, 'the current level is kept');
  assert.ok(texts(g).includes('PROGRESS ERASED'));
});

test('resetting while recording says the recording was discarded, and does not save it', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.tick();
  g.resetLevel();
  assert.equal(g.recorder, null);
  assert.equal(g.recordings.length, 0);
  assert.ok(texts(g).includes('RECORDING DISCARDED'));
});

test('a region that is too small says so instead of failing silently', () => {
  const g = new Game(LEVELS);
  assert.equal(g.setRegion(0, 0, 10, 10), false);
  assert.ok(texts(g).includes('REGION TOO SMALL'));
});

test('every world rebuild advances the generation counter', () => {
  const g = new Game(LEVELS);
  const before = g.generation;
  g.resetLevel();
  assert.ok(g.generation > before);
  const mid = g.generation;
  g.loadLevel(1);
  assert.ok(g.generation > mid);
});
