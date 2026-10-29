// Hidden discoveries: each is found once, on its trigger, and survives a restart when saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, DISCOVERIES, DISCOVERY_COUNT } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

const eventText = (e) => (typeof e === 'string' ? e : e.text);

test('a discovery is recorded once and announced in the event log', () => {
  const g = new Game(LEVELS);
  assert.equal(g.discover('found:ghost'), true);
  assert.equal(g.discover('found:ghost'), false, 'a second find is not a new discovery');
  assert.equal(g.discoveries.size, 1);
  assert.ok(g.events.some((e) => eventText(e).startsWith('FOUND') && eventText(e).includes('ghost')));
});

test('unknown discovery ids are refused', () => {
  const g = new Game(LEVELS);
  assert.equal(g.discover('found:nothing'), false);
  assert.equal(g.discoveries.size, 0);
});

test('saved discoveries are restored, and unknown saved ids are dropped', () => {
  const g = new Game(LEVELS, { discoveries: ['found:memory', 'found:bogus'] });
  assert.equal(g.discoveries.has('found:memory'), true);
  assert.equal(g.discoveries.has('found:bogus'), false);
  assert.equal(g.discover('found:memory'), false, 'restored discoveries are not announced again');
});

test('the sandbox discovery is made on entering the open lab', () => {
  const g = new Game(LEVELS, { maxUnlocked: LEVELS.length - 1 });
  assert.equal(g.discoveries.has('found:open-lab'), false);
  g.loadLevel(LEVELS.length - 1);
  assert.equal(g.isSandbox, true);
  assert.equal(g.discoveries.has('found:open-lab'), true);
});

test('the PRESENCE conflict in level 5 makes the presence discovery', () => {
  const g = new Game(LEVELS);
  g.loadLevel(4);
  const gate = g.world.doors[0];
  assert.equal(g.removeBodyAt(468, 488), true);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.toggleDoor(gate);
  g.dropAt(80, 240);
  for (let i = 0; i < 480; i++) g.tick();
  g.toggleRecording();

  g.resetLevel();
  g.selected = new Set([1]);
  g.playSelected();
  for (let i = 0; i < 700; i++) g.tick();
  assert.equal(g.discoveries.has('found:presence'), true, 'the blocked memory is a discovery');
});

test('there are as many discoveries as the count reports and every one has text', () => {
  assert.equal(Object.keys(DISCOVERIES).length, DISCOVERY_COUNT);
  for (const text of Object.values(DISCOVERIES)) assert.ok(text.length > 20);
});
