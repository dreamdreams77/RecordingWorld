// Unit tests for the deterministic simulation core.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, addWall, addDoor, addPlate, addEmitter, spawnBall, step,
  EMITTER_PERIOD, FLOOR_Y, BALL_RADIUS, DT,
} from '../src/sim.js';

function floorWorld() {
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  return w;
}

test('a ball falls under gravity and comes to rest on the floor without tunnelling', () => {
  const w = floorWorld();
  const b = spawnBall(w, 200, 100);
  for (let i = 0; i < 600; i++) step(w);
  assert.ok(Math.abs(b.y + b.r - FLOOR_Y) < 0.5, `ball should rest on floor, y=${b.y}`);
  assert.ok(Math.abs(b.vy) < 20, 'ball should be (nearly) at rest vertically');
});

test('the simulation is deterministic: identical inputs give identical state', () => {
  const run = () => {
    const w = floorWorld();
    addPlate(w, 'p', 300, FLOOR_Y - 12, 40, 12, []);
    spawnBall(w, 200, 40, 30, 0);
    spawnBall(w, 210, 80, -20, 0);
    addEmitter(w, 'e', 600, 60, 400, 800).running = true;
    for (let i = 0; i < 900; i++) step(w);
    return w.bodies.map((b) => [b.x, b.y, b.vx, b.vy]);
  };
  assert.deepEqual(run(), run());
});

test('a closed door blocks a ball; an open door does not', () => {
  const closed = floorWorld();
  addDoor(closed, 'd', 400, 300, 12, FLOOR_Y - 300);
  const b1 = spawnBall(closed, 300, 400, 300, 0);
  for (let i = 0; i < 120; i++) step(closed);
  assert.ok(b1.x < 400 - b1.r + 0.01, 'ball must not pass a closed door');

  const open = floorWorld();
  const d = addDoor(open, 'd', 400, 300, 12, FLOOR_Y - 300);
  d.open = true;
  const b2 = spawnBall(open, 300, 400, 300, 0);
  for (let i = 0; i < 120; i++) step(open);
  assert.ok(b2.x > 400, 'ball must pass an open door');
});

test('a plate is pressed while a body overlaps it and reports live vs echo hits', () => {
  const w = floorWorld();
  const p = addPlate(w, 'p', 300, FLOOR_Y - 12, 40, 12, []);
  spawnBall(w, 320, FLOOR_Y - 12 - BALL_RADIUS - 2, 0, 0);
  for (let i = 0; i < 300; i++) step(w);
  assert.equal(p.pressed, true);
  assert.equal(p.liveHits, 1);
  assert.equal(p.echoHits, 0);
});

test('a plate latches its door on the rising edge only, so closing it stays closed', () => {
  const w = floorWorld();
  const d = addDoor(w, 'gate', 400, 300, 12, FLOOR_Y - 300);
  addPlate(w, 'p', 300, FLOOR_Y - 12, 40, 12, [{ type: 'door', name: 'gate' }]);
  spawnBall(w, 320, FLOOR_Y - 12 - BALL_RADIUS - 2);
  for (let i = 0; i < 300; i++) step(w);
  assert.equal(d.open, true, 'pressing the plate opens the door');
  d.open = false;             // player shuts it while the ball still rests on the plate
  for (let i = 0; i < 60; i++) step(w);
  assert.equal(d.open, false, 'a held plate must not re-latch the door');
});

test('an emitter spawns exactly one ball per period while running', () => {
  const w = floorWorld();
  const e = addEmitter(w, 'e', 200, 60, 100, 800);
  e.running = true;
  const ticks = EMITTER_PERIOD * 5;
  for (let i = 0; i < ticks; i++) step(w);
  assert.equal(w.bodies.length, 5);
  assert.ok(w.bodies.every((b) => b.source === e.id), 'spawned bodies remember their source emitter');
});

test('a stopped emitter spawns nothing', () => {
  const w = floorWorld();
  addEmitter(w, 'e', 200, 60, 100, 800);
  for (let i = 0; i < EMITTER_PERIOD * 3; i++) step(w);
  assert.equal(w.bodies.length, 0);
});

test('a tick advances time by exactly DT and the counter is authoritative', () => {
  const w = floorWorld();
  for (let i = 0; i < 42; i++) step(w);
  assert.equal(w.tick, 42);
  assert.equal(42 * DT, 42 / 60);
});

import { hashWorld } from '../src/sim.js';

// A busy scene, deterministic by construction: bodies on a jittered lattice.
function busyWorld(n) {
  const w = createWorld();
  addWall(w, 0, FLOOR_Y, 960, 40);
  addWall(w, -20, 0, 20, 540);
  addWall(w, 960, 0, 20, 540);
  let s = 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n; i++) {
    spawnBall(w, 40 + (i % 20) * 42 + rnd() * 6, 40 + Math.floor(i / 20) * 30 + rnd() * 6, rnd() * 60 - 30, 0);
  }
  return w;
}

test('hashWorld is stable across identical runs and changes when state changes', () => {
  const a = busyWorld(30), b = busyWorld(30);
  for (let t = 0; t < 120; t++) { step(a); step(b); }
  assert.equal(hashWorld(a), hashWorld(b));
  a.bodies[0].x += 1;
  assert.notEqual(hashWorld(a), hashWorld(b));
});

