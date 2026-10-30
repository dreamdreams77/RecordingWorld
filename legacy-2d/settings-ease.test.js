// Starting settings for narrow screens, and the easing used by the sinking plates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startingSettings, DEFAULT_SETTINGS, NARROW_SCREEN } from '../src/settings.js';
import { easeToward } from '../src/ease.js';

test('a wide screen starts with the defaults', () => {
  assert.deepEqual(startingSettings(undefined, 1280), DEFAULT_SETTINGS);
});

test('a narrow screen starts with large text on, when nothing is saved', () => {
  const s = startingSettings(undefined, NARROW_SCREEN - 1);
  assert.equal(s.largeText, true);
  assert.equal(s.trails, DEFAULT_SETTINGS.trails);
});

test('a saved large-text choice wins over the narrow-screen default, either way', () => {
  assert.equal(startingSettings({ largeText: false }, 390).largeText, false);
  assert.equal(startingSettings({ largeText: true }, 1280).largeText, true);
});

test('other saved choices are kept, and damaged ones fall back to the default', () => {
  const s = startingSettings({ muted: true, hintsOn: 'yes', reduceFlashing: true }, 1280);
  assert.equal(s.muted, true);
  assert.equal(s.hintsOn, DEFAULT_SETTINGS.hintsOn, 'a non-boolean is ignored');
  assert.equal(s.reduceFlashing, true);
});

test('easing closes the gap over time and never overshoots', () => {
  let v = 0;
  for (let i = 0; i < 120; i++) v = easeToward(v, 1, 1 / 60, false);
  assert.ok(v > 0.99 && v <= 1, `reached the target, got ${v}`);
  assert.ok(easeToward(0, 1, 1 / 60, false) < 1, 'a single frame does not jump');
});

test('easing with no elapsed time holds the current value', () => {
  assert.equal(easeToward(0.4, 1, 0, false), 0.4);
});

test('reduced motion jumps straight to the target', () => {
  assert.equal(easeToward(0, 1, 1 / 60, true), 1);
  assert.equal(easeToward(1, 0, 1 / 60, true), 0);
});
