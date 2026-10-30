// Menu layout and tap detection. The same layout is used to draw the menu and to find the item under
// a tap, so these tests cover both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuLayout, menuItemAt } from '../src/menu.js';

test('menus sit at the layout the renderer uses', () => {
  assert.deepEqual(menuLayout('title', 5), { top: 240, spacing: 34 });
  assert.deepEqual(menuLayout('stats', 1), { top: 360, spacing: 34 });
  assert.deepEqual(menuLayout('settings', 10), { top: 200, spacing: 28 });
});

test('a tap on an item centre returns that item', () => {
  const { top, spacing } = menuLayout('title', 5);
  for (let i = 0; i < 5; i++) assert.equal(menuItemAt(480, top + i * spacing, 'title', 5), i);
});

test('a tap far to the side of the list hits nothing', () => {
  assert.equal(menuItemAt(50, 240, 'title', 5), -1);
  assert.equal(menuItemAt(900, 240, 'title', 5), -1);
});

test('a tap well above or below the list hits nothing', () => {
  assert.equal(menuItemAt(480, 40, 'title', 5), -1);
  assert.equal(menuItemAt(480, 500, 'title', 5), -1);
});

test('a tap between two items goes to the nearer one', () => {
  const { top, spacing } = menuLayout('title', 5);
  assert.equal(menuItemAt(480, top + spacing * 1.4, 'title', 5), 1);
  assert.equal(menuItemAt(480, top + spacing * 1.6, 'title', 5), 2);
});

test('a menu with no items hits nothing', () => {
  assert.equal(menuItemAt(480, 240, 'controls', 0), -1);
});
