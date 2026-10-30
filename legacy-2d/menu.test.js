import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMenu, itemsFor, move, activate, escape, back, openScreen } from '../src/menu.js';

const ctx = (over = {}) => ({
  levelTitles: ['01  A', '02  B', '03  C'],
  maxUnlocked: 0,
  settings: { reducedMotion: false, colourBlind: false },
  ...over,
});

test('the title screen says BEGIN until any progress exists, then CONTINUE', () => {
  assert.equal(itemsFor('title', ctx())[0].label, 'BEGIN');
  assert.equal(itemsFor('title', ctx({ maxUnlocked: 2 }))[0].label, 'CONTINUE');
});

test('level select marks locked levels and skips them when moving', () => {
  const m = createMenu();
  openScreen(m, 'levels');
  const c = ctx({ maxUnlocked: 0 });
  assert.equal(itemsFor('levels', c)[1].disabled, true);
  move(m, 1, c);
  assert.equal(m.index, 3, 'moving down skips the two locked levels and lands on BACK');
  move(m, 1, c);
  assert.equal(m.index, 0, 'then wraps to the unlocked level');
});

test('activating a level returns the level index and enters play', () => {
  const m = createMenu();
  activate(m, ctx({ maxUnlocked: 1 })); // BEGIN/CONTINUE from the title
  assert.equal(m.screen, 'playing');
});

test('CONTINUE returns the furthest unlocked level', () => {
  const m = createMenu();
  const action = activate(m, ctx({ maxUnlocked: 2 }));
  assert.deepEqual(action, { type: 'begin', index: 2 });
});

test('Esc opens pause from play, resumes from pause, and backs out of menus', () => {
  const m = createMenu();
  activate(m, ctx());                       // enter play
  assert.equal(escape(m).type, 'paused');
  assert.equal(m.screen, 'pause');
  assert.equal(escape(m).type, 'resume');
  assert.equal(m.screen, 'playing');
});

test('settings toggles are returned as actions, not applied here', () => {
  const m = createMenu();
  openScreen(m, 'settings');
  assert.deepEqual(activate(m, ctx()), { type: 'setting', key: 'reducedMotion' });
});

test('back returns to the previous screen and the title is the floor', () => {
  const m = createMenu();
  openScreen(m, 'settings');
  back(m);
  assert.equal(m.screen, 'title');
  back(m);
  assert.equal(m.screen, 'title');
});

import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

test('progress: a saved maxUnlocked allows jumping, and finishing a level unlocks the next', () => {
  const g = new Game(LEVELS, { maxUnlocked: 1 });
  assert.equal(g.jumpTo(2), false, 'locked levels cannot be entered');
  assert.equal(g.jumpTo(1), true);
  g.completed = true;
  g.advance();
  assert.equal(g.maxUnlocked, 2, 'advancing unlocks the level just entered');
});

test('the large text setting is offered and reported as a setting action', () => {
  const c = ctx({ settings: { reducedMotion: false, colourBlind: false, largeText: true } });
  const labels = itemsFor('settings', c).map((i) => i.label);
  assert.ok(labels.some((l) => l.startsWith('LARGE TEXT') && l.endsWith('ON')));
  const m = createMenu();
  openScreen(m, 'settings');
  move(m, 2, c); // to LARGE TEXT
  assert.deepEqual(activate(m, c), { type: 'setting', key: 'largeText' });
});

test('erasing progress takes two presses, and moving the cursor cancels the first', () => {
  const c = ctx({ settings: { reducedMotion: false, colourBlind: false, largeText: false, hintsOn: false, muted: false }, armed: null });
  const m = createMenu();
  openScreen(m, 'settings');
  const eraseIndex = itemsFor('settings', c).findIndex((i) => i.id === 'erase');
  m.index = eraseIndex;
  assert.deepEqual(activate(m, c), { type: 'none' }, 'first press only arms');
  assert.equal(m.armed, 'erase');
  assert.ok(itemsFor('settings', { ...c, armed: m.armed })[eraseIndex].label.includes('AGAIN'));
  move(m, -1, c);
  assert.equal(m.armed, null, 'moving away disarms it');
  m.index = eraseIndex;
  activate(m, c);
  assert.deepEqual(activate(m, c), { type: 'erase' }, 'the second press erases');
  assert.equal(m.armed, null);
});

test('pause offers RESTART LEVEL and returns a restart action', () => {
  const m = createMenu();
  m.screen = 'pause';
  const c = ctx();
  assert.ok(itemsFor('pause', c).some((i) => i.label === 'RESTART LEVEL'));
  m.index = itemsFor('pause', c).findIndex((i) => i.id === 'restart');
  assert.deepEqual(activate(m, c), { type: 'restart' });
  assert.equal(m.screen, 'playing');
});

test('hints, sound and erase settings return the right actions', () => {
  const c = ctx({ settings: { reducedMotion: false, colourBlind: false, largeText: false, hintsOn: false, muted: false } });
  const m = createMenu();
  openScreen(m, 'settings');
  const find = (id) => itemsFor('settings', c).findIndex((i) => i.id === id);
  m.index = find('toggle-hints');
  assert.deepEqual(activate(m, c), { type: 'setting', key: 'hintsOn' });
  m.index = find('toggle-sound');
  assert.deepEqual(activate(m, c), { type: 'setting', key: 'muted' });
});

test('level select shows the best time for completed levels', () => {
  const items = itemsFor('levels', ctx({ maxUnlocked: 1, bestTicks: [600, undefined, undefined] }));
  assert.ok(items[0].label.includes('best 10.0s'));
  assert.equal(items[1].label.includes('best'), false);
});
