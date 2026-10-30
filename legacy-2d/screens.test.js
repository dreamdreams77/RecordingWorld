// The discoveries screen and the controls text, including the touch-only line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsFor, activate, createMenu, discoveryLines, menuLayout } from '../src/menu.js';
import { controlsLines } from '../src/render.js';
import { DISCOVERIES, DISCOVERY_COUNT } from '../src/game.js';

test('the title menu has a DISCOVERIES entry that opens its screen', () => {
  const c = { levelTitles: [], maxUnlocked: 0, settings: {}, armed: null };
  const m = createMenu();
  m.index = itemsFor('title', c).findIndex((i) => i.id === 'discoveries');
  assert.ok(m.index > 0);
  activate(m, c);
  assert.equal(m.screen, 'discoveries');
  assert.deepEqual(itemsFor('discoveries', c).map((i) => i.id), ['back']);
});

test('the discoveries screen sits low enough to leave room for the list', () => {
  assert.equal(menuLayout('discoveries', 1).top, 450);
});

test('each discovery shows its text once found, and a hidden marker until then', () => {
  const ids = Object.keys(DISCOVERIES);
  const found = new Set([ids[0]]);
  const lines = discoveryLines(found, DISCOVERIES);
  assert.equal(lines.length, DISCOVERY_COUNT);
  assert.equal(lines[0], `✓  ${DISCOVERIES[ids[0]]}`);
  assert.equal(lines[1], '?  hidden until you find it');
});

test('a player who has found nothing sees every discovery hidden', () => {
  const lines = discoveryLines(new Set(), DISCOVERIES);
  assert.ok(lines.every((l) => l.startsWith('?')));
});

test('the controls text names the touch controls only on a touch screen', () => {
  const desktop = controlsLines(false);
  const touch = controlsLines(true);
  assert.ok(!desktop.some((l) => l.startsWith('Touch:')));
  assert.ok(touch.some((l) => l.startsWith('Touch:')));
  assert.equal(touch.length, desktop.length + 1);
});
