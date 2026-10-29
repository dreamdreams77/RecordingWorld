// Save codes: round trip, and rejection of anything that is not one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSave, decodeSave } from '../src/save.js';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

const sample = { maxUnlocked: 2, discoveries: ['found:ghost'], best: { 'l1-latch': 300 }, stats: { recordingsMade: 3, levelsCompleted: 1, playTicks: 900 } };

test('a save code decodes back to the progress it was made from', () => {
  assert.deepEqual(decodeSave(encodeSave(sample)), sample);
});

test('surrounding whitespace is tolerated, since codes are often pasted with it', () => {
  assert.deepEqual(decodeSave(`  ${encodeSave(sample)}\n`), sample);
});

test('empty, non-base64, non-JSON and wrong-version codes are all refused', () => {
  assert.throws(() => decodeSave(''));
  assert.throws(() => decodeSave('   '));
  assert.throws(() => decodeSave('not base64 !!'));
  assert.throws(() => decodeSave(btoa('not json')));
  assert.throws(() => decodeSave(btoa(JSON.stringify({ v: 2, progress: {} }))), /not a save code/);
  assert.throws(() => decodeSave(btoa(JSON.stringify({ v: 1 }))), /not a save code/);
  assert.throws(() => decodeSave(42));
});

test('importing a hand-edited code cannot unlock beyond the last level or keep unknown discoveries', () => {
  const g = new Game(LEVELS);
  g.importProgress({ maxUnlocked: 999, discoveries: ['found:ghost', 'found:cheat'], best: { 'l1-latch': 90 } });
  assert.equal(g.maxUnlocked, LEVELS.length - 1);
  assert.deepEqual([...g.discoveries], ['found:ghost']);
  assert.equal(g.best['l1-latch'], 90);
});

test('a damaged unlock value is treated as nothing unlocked, not as NaN', () => {
  assert.equal(new Game(LEVELS, { maxUnlocked: 'x' }).maxUnlocked, 0);
  assert.equal(new Game(LEVELS, { maxUnlocked: 1.5 }).maxUnlocked, 0);
  assert.equal(new Game(LEVELS, { maxUnlocked: 2 }).maxUnlocked, 2);
});
