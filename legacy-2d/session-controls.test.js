// Recording deletion, speed cycling, the debug snapshot, CONTINUE resuming
// the last level, and the save file entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, nextSpeed, SPEEDS } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { itemsFor, activate, createMenu } from '../src/menu.js';

function withRecordings(n, ticks = 30) {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  for (let k = 0; k < n; k++) {
    g.toggleRecording();
    g.dropAt(80, 190);
    for (let i = 0; i < ticks; i++) g.tick();
    g.toggleRecording();
  }
  return g;
}

test('deleting a recording removes it and shifts later selections down', () => {
  const g = withRecordings(3);
  g.selected = new Set([1, 3]);
  assert.equal(g.deleteRecording(0), true);
  assert.equal(g.recordings.length, 2);
  assert.deepEqual([...g.selected], [2]);
});

test('deleting the selected recording drops it from the selection', () => {
  const g = withRecordings(2);
  g.selected = new Set([2]);
  g.deleteRecording(1);
  assert.equal(g.selected.size, 0);
});

test('deleting is refused out of range and while recording', () => {
  const g = withRecordings(1);
  assert.equal(g.deleteRecording(5), false);
  g.toggleRecording();
  assert.equal(g.deleteRecording(0), false);
  assert.equal(g.recordings.length, 1);
});

test('deleting is refused while a replay is running', () => {
  const g = withRecordings(1);
  g.selected.add(1);
  g.playSelected();
  g.tick();
  assert.equal(g.deleteRecording(0), false);
  assert.ok(g.events.some((e) => (typeof e === 'string' ? e : e.text) === 'STOP REPLAY FIRST'));
  assert.equal(g.recordings.length, 1);
});

test('Tab cycles through 1x, 2x and half speed', () => {
  assert.deepEqual(SPEEDS, [1, 2, 0.5]);
  assert.equal(nextSpeed(1), 2);
  assert.equal(nextSpeed(2), 0.5);
  assert.equal(nextSpeed(0.5), 1);
});

test('the debug snapshot describes the level, tick, world hash and recordings', () => {
  const g = withRecordings(2);
  const snap = g.debugSnapshot();
  assert.equal(snap.level, LEVELS[0].id);
  assert.equal(snap.tick, g.world.tick);
  assert.equal(typeof snap.hash, 'string');
  assert.equal(snap.recordings.length, 2);
  assert.equal(snap.recordings[0].name, g.recordings[0].name);
  assert.equal(snap.recordings[0].ticks, g.recordings[0].length);
  assert.doesNotThrow(() => JSON.stringify(snap));
});

test('CONTINUE returns to the last level started, not the furthest one', () => {
  const g = new Game(LEVELS, { maxUnlocked: 2, lastLevel: 1 });
  assert.equal(g.lastLevel, 1);
  g.jumpTo(0);
  assert.equal(g.progress.lastLevel, 0);
});

test('a saved last level beyond what is unlocked is clamped; a damaged one counts as 0', () => {
  assert.equal(new Game(LEVELS, { maxUnlocked: 1, lastLevel: 5 }).lastLevel, 1);
  assert.equal(new Game(LEVELS, { maxUnlocked: 1, lastLevel: 'x' }).lastLevel, 0);
});

test('erasing progress resets the last level, and an imported save restores it', () => {
  const g = new Game(LEVELS, { maxUnlocked: 2, lastLevel: 2 });
  g.eraseProgress();
  assert.equal(g.lastLevel, 0);
  g.importProgress({ maxUnlocked: 3, lastLevel: 3 });
  assert.equal(g.lastLevel, 3);
});

test('the save screen offers download and upload as actions', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: {}, armed: null };
  const m = createMenu();
  m.screen = 'save';
  const find = (id) => itemsFor('save', c).findIndex((i) => i.id === id);
  m.index = find('download-save');
  assert.deepEqual(activate(m, c), { type: 'download-save' });
  m.index = find('upload-save');
  assert.deepEqual(activate(m, c), { type: 'upload-save' });
});

test('CONTINUE starts at the resume level when one is given', () => {
  const c = { levelTitles: [], maxUnlocked: 3, resumeLevel: 1, settings: {}, armed: null };
  const m = createMenu();
  m.screen = 'title';
  m.index = itemsFor('title', c).findIndex((i) => i.id === 'begin');
  assert.deepEqual(activate(m, c), { type: 'begin', index: 1 });
});
