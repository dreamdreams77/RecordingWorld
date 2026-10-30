// Lifetime statistics and the clear-all-recordings verb.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { statLines, createMenu, itemsFor, activate } from '../src/menu.js';

const texts = (g) => g.events.map((e) => (typeof e === 'string' ? e : e.text));

test('saving a recording counts it; a game tick counts toward play time', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.tick();
  g.toggleRecording();
  assert.equal(g.stats.recordingsMade, 1);
  assert.equal(g.stats.playTicks, 1);
});

test('statistics are restored from saved progress, ignoring bad values', () => {
  const g = new Game(LEVELS, { stats: { recordingsMade: 4, levelsCompleted: -2, playTicks: 'lots' } });
  assert.equal(g.stats.recordingsMade, 4);
  assert.equal(g.stats.levelsCompleted, 0);
  assert.equal(g.stats.playTicks, 0);
  assert.deepEqual(g.progress.stats, g.stats);
});

test('erasing progress also clears statistics', () => {
  const g = new Game(LEVELS, { stats: { recordingsMade: 4, levelsCompleted: 2, playTicks: 900 } });
  g.eraseProgress();
  assert.deepEqual(g.stats, { recordingsMade: 0, levelsCompleted: 0, playTicks: 0 });
});

test('clearing all recordings empties the list and the selection, and stops replays', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.tick();
  g.toggleRecording();
  g.toggleRecording();
  g.tick();
  g.toggleRecording();
  g.playSelected();
  assert.equal(g.clearRecordings(), true);
  assert.equal(g.recordings.length, 0);
  assert.equal(g.selected.size, 0);
  assert.equal(g.playbacks.activeCount, 0);
  assert.ok(texts(g).includes('ALL RECORDINGS CLEARED'));
});

test('clearing is refused while a recording is in progress, and when there is nothing to clear', () => {
  const g = new Game(LEVELS);
  assert.equal(g.clearRecordings(), false, 'nothing to clear');
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  assert.equal(g.clearRecordings(), false, 'recording in progress');
  assert.ok(g.recorder, 'the recording is untouched');
});

test('the statistics lines show counts and a minutes-and-seconds play time', () => {
  const lines = statLines({ recordingsMade: 3, levelsCompleted: 2, playTicks: 60 * 125 }, 0, 7);
  assert.ok(lines[0].endsWith('3'));
  assert.ok(lines[1].endsWith('2'));
  assert.ok(lines[2].endsWith('2m 05s'));
});

test('the title offers STATISTICS, and the statistics screen only offers BACK', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: {}, armed: null };
  assert.ok(itemsFor('title', c).some((i) => i.label === 'STATISTICS'));
  const m = createMenu();
  m.index = itemsFor('title', c).findIndex((i) => i.id === 'stats');
  activate(m, c);
  assert.equal(m.screen, 'stats');
  assert.deepEqual(itemsFor('stats', c).map((i) => i.id), ['back']);
});

test('echo trails can be switched off in settings', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: { trails: true }, armed: null };
  const labels = itemsFor('settings', c).map((i) => i.label);
  assert.ok(labels.some((l) => l === 'ECHO TRAILS   ON'));
});
