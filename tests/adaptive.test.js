import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveRes } from '../src/render/adaptive.js';

const run = (a, ms, n) => { let changes = 0; for (let i = 0; i < n; i++) { a.sample(typeof ms === 'function' ? ms(i) : ms); if (a.changed) changes++; } return changes; };

test('a steady 60 fps leaves the resolution alone', () => { const a = new AdaptiveRes(); assert.equal(run(a, 16.7, 2000), 0); assert.equal(a.scale, 1); });
test('sustained slowness lowers the scale step by step, and never below the floor', () => {
  const a = new AdaptiveRes({ min: 0.5 }); const seen = [];
  for (let i = 0; i < 3000; i++) { a.sample(33); if (a.changed) seen.push(a.scale); }
  assert.ok(seen.length >= 3, 'it steps down gradually'); assert.ok(seen.every((v, i) => i === 0 || v < seen[i - 1]), 'monotonically'); assert.equal(a.scale, 0.5); assert.ok(Math.min(...seen) >= 0.5);
});
test('hitches (a tab switch, a level load) are not a trend', () => { const a = new AdaptiveRes(); assert.equal(run(a, (i) => (i % 40 === 0 ? 600 : 16), 2000), 0); assert.equal(a.scale, 1); });
test('headroom brings resolution back, more slowly than it was lost', () => {
  const a = new AdaptiveRes(); run(a, 33, 800); const low = a.scale; assert.ok(low < 0.75);
  const framesDown = (() => { const b = new AdaptiveRes(); let f = 0; while (b.scale > low && f < 5000) { b.sample(33); f++; } return f; })();
  let framesUp = 0; while (a.scale < 1 && framesUp < 20000) { a.sample(8); framesUp++; }
  assert.equal(a.scale, 1); assert.ok(framesUp > framesDown, `recovering (${framesUp}) takes longer than degrading (${framesDown})`);
});
test('no oscillation: an average near the target does not flip the scale back and forth', () => { const a = new AdaptiveRes(); assert.equal(run(a, (i) => (i % 2 ? 22 : 12), 4000), 0); });
test('a recovery that sits between the thresholds holds steady', () => { const a = new AdaptiveRes(); run(a, 33, 600); const s = a.scale; assert.equal(run(a, 17, 3000), 0); assert.equal(a.scale, s); });
test('turning it off restores full resolution immediately', () => { const a = new AdaptiveRes(); run(a, 33, 800); assert.ok(a.scale < 1); a.enabled = false; a.sample(33); assert.equal(a.scale, 1); assert.ok(a.changed); });
test('bad input is ignored', () => { const a = new AdaptiveRes(); for (const v of [NaN, -5, 0, Infinity, undefined]) a.sample(v); assert.equal(a.scale, 1); });
test('a device that is consistently very slow still adapts (slow is a trend, not a hitch)', () => { const a = new AdaptiveRes(); run(a, 300, 800); assert.equal(a.scale, 0.5); });
test('a load screen (seconds-long frame) is ignored entirely', () => { const a = new AdaptiveRes(); a.sample(5000); a.sample(16); assert.equal(a.scale, 1); assert.equal(a.n, 1); });
