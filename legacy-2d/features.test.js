// Behaviour added with the discoveries, undo, completion summary and save-code entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { statLines, itemsFor, activate, createMenu } from '../src/menu.js';
import { spawnBall } from '../src/sim.js';

const texts = (g) => g.events.map((e) => (typeof e === 'string' ? e : e.text));

test('an echo that presses a plate is discovered (level 1 solution)', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.dropAt(80, 190);
  for (let i = 0; i < 600; i++) g.tick();
  g.toggleRecording();
  g.resetLevel();
  g.selected.add(1);
  g.playSelected();
  for (let i = 0; i < 900 && !g.completed; i++) g.tick();
  assert.equal(g.completed, true);
  assert.ok(g.discoveries.has('found:echo-plate'));
});

test('an echo that lights a sensor is discovered (level 2 solution)', () => {
  const g = new Game(LEVELS);
  g.loadLevel(1);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.dropAt(130, 230);
  for (let i = 0; i < 180; i++) g.tick();
  g.toggleRecording();
  g.resetLevel();
  g.selected.add(1);
  g.playSelected();
  for (let i = 0; i < 600 && !g.completed; i++) g.tick();
  assert.equal(g.completed, true);
  assert.ok(g.discoveries.has('found:echo-light'));
});

test('undo removes the last dropped ball from the live world, once', () => {
  const g = new Game(LEVELS);
  g.dropAt(80, 190);
  assert.equal(g.world.bodies.length, 1);
  assert.equal(g.undoDrop(), true);
  assert.equal(g.world.bodies.length, 0);
  assert.equal(g.undoDrop(), false, 'a second undo has nothing to undo');
});

test('undo does nothing if the ball has already been removed', () => {
  const g = new Game(LEVELS);
  g.dropAt(80, 190);
  g.removeBodyAt(80, 190);
  assert.equal(g.undoDrop(), false);
});

test('undo never removes an echo', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.dropAt(80, 190);
  for (let i = 0; i < 60; i++) g.tick();
  g.toggleRecording();
  g.resetLevel();
  g.selected.add(1);
  g.playSelected();
  for (let i = 0; i < 60; i++) g.tick();
  const echoes = g.world.bodies.filter((b) => b.echo).length;
  g.undoDrop();
  assert.equal(g.world.bodies.filter((b) => b.echo).length, echoes);
});

test('completing a level records the result for the summary line', () => {
  const stub = [{ id: 'stub', title: 'STUB', brief: [], goalText: 'x', dropZones: [], build() {}, goal: () => true, hint: '' }];
  const g = new Game(stub);
  g.world.tick = 240;
  g.checkGoal();
  assert.deepEqual(g.lastResult, { ticks: 240, newBest: true });
  g.loadLevel(0);
  assert.equal(g.lastResult, null, 'the summary is cleared for the next attempt');
});

test('the statistics screen counts discoveries against the total', () => {
  const lines = statLines({ recordingsMade: 0, levelsCompleted: 0, playTicks: 0 }, 3, 7);
  assert.ok(lines[3].endsWith('3 / 7'));
});

test('completed levels get a tick on level select; unfinished ones do not', () => {
  const items = itemsFor('levels', { levelTitles: ['01  A', '02  B'], maxUnlocked: 1, bestTicks: [600, undefined] });
  assert.ok(items[0].label.startsWith('✓ '));
  assert.ok(!items[1].label.startsWith('✓'));
});

test('the save codes screen offers COPY and LOAD as actions, and settings links to it', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: {}, armed: null };
  const m = createMenu();
  m.screen = 'settings';
  m.index = itemsFor('settings', c).findIndex((i) => i.id === 'save-codes');
  activate(m, c);
  assert.equal(m.screen, 'save');
  const find = (id) => itemsFor('save', c).findIndex((i) => i.id === id);
  m.index = find('copy-save');
  assert.deepEqual(activate(m, c), { type: 'copy-save' });
  m.index = find('load-save');
  assert.deepEqual(activate(m, c), { type: 'load-save' });
});

test('select all picks every saved recording and refuses when there are none', () => {
  const g = new Game(LEVELS);
  assert.equal(g.selectAll(), false);
  g.setRegion(0, 0, 960, 540);
  for (let n = 0; n < 2; n++) {
    g.toggleRecording();
    g.dropAt(80, 190);
    for (let i = 0; i < 30; i++) g.tick();
    g.toggleRecording();
  }
  g.selected.clear();
  assert.equal(g.selectAll(), true);
  assert.deepEqual([...g.selected].sort(), [1, 2]);
  assert.ok(texts(g).includes('SELECTED ALL 2'));
});

test('two recordings played together are discovered as two pasts', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 960, 540);
  for (let n = 0; n < 2; n++) {
    g.toggleRecording();
    g.dropAt(80, 190);
    for (let i = 0; i < 30; i++) g.tick();
    g.toggleRecording();
  }
  g.resetLevel();
  g.selectAll();
  g.playSelected();
  g.tick();
  assert.ok(g.discoveries.has('found:two-pasts'));
});

test('a body made by an emitter discovers the emitter (rule check, not a level solution)', () => {
  const g = new Game(LEVELS);
  spawnBall(g.world, 100, 100, 0, 0, 7);
  g.tick();
  assert.ok(g.discoveries.has('found:emitter'));
});

test('REDUCE FLASHING appears in settings, shows its state, and toggles through activate', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: { reduceFlashing: false }, armed: null };
  const items = itemsFor('settings', c);
  const item = items.find((i) => i.id === 'toggle-flashes');
  assert.ok(item.label.startsWith('REDUCE FLASHING'));
  assert.ok(item.label.endsWith('OFF'));
  const m = createMenu();
  m.screen = 'settings';
  m.index = items.indexOf(item);
  assert.deepEqual(activate(m, c), { type: 'setting', key: 'reduceFlashing' });
});
