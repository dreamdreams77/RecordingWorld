// Plays each level's intended solution through the public Game API,
// exactly as a player would. If a level cannot be completed this way, it is
// not finished, and these tests fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

function runUntil(game, predicate, maxTicks) {
  for (let i = 0; i < maxTicks; i++) {
    game.tick();
    if (predicate(game)) return i;
  }
  return -1;
}

test('level 1 (LATCH) is solvable: record a drop, shut the gate, replay the echo onto GOAL', () => {
  const g = new Game(LEVELS);
  assert.equal(g.level.id, 'l1-latch');

  // The region must cover the path the echo will take: only what happens inside it is remembered.
  g.setRegion(0, 0, 960, 540);
  assert.equal(g.toggleRecording(), 'started');
  g.dropAt(80, 190);                       // falls onto the belt
  for (let i = 0; i < 600; i++) g.tick(); // belt -> plate A -> gate latches open -> ball rolls to goal
  assert.equal(g.toggleRecording(), 'stopped');
  assert.equal(g.recordings.length, 1);

  // The recording itself is not the solution: the live world must be reset and the gate shut.
  g.resetLevel();
  const gate = g.world.doors.find((d) => d.name === 'gate');
  assert.equal(gate.open, false, 'gate starts shut after reset');

  g.selected.add(1);
  g.playSelected();
  const at = runUntil(g, (game) => game.completed, 900);
  assert.ok(at >= 0, 'echo should reach the GOAL plate');
  // The echo also presses plate A, which latches the gate live. Either way the replay completes;
  // level 5 is the level where memory alone must do the work.
  assert.equal(gate.open, true);
});

test('level 1: the live world alone cannot complete the level without memory', () => {
  // Without a recording there is nothing to replay: the goal must stay unmet.
  const g = new Game(LEVELS);
  g.dropAt(80, 190);
  for (let i = 0; i < 900; i++) g.tick();
  assert.equal(g.completed, false, 'live-only play must not satisfy an echo goal');
});

test('level 2 (SHADOW) is solvable: a recorded lamp lights the sensor after the lamp is dark', () => {
  const g = new Game(LEVELS);
  g.loadLevel(1);
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.dropAt(130, 230);                     // lands on plate B, lamp L2 lights
  for (let i = 0; i < 180; i++) g.tick();
  g.toggleRecording();

  g.resetLevel();
  const lamp = g.world.lamps.find((l) => l.name === 'L2');
  assert.equal(lamp.on, false, 'lamp is dark after reset');
  g.selected.add(1);
  g.playSelected();
  const at = runUntil(g, (game) => game.completed, 600);
  assert.ok(at >= 0, 'an echo light should light the sensor');
  assert.equal(lamp.on, false, 'the sensor was lit without any live lamp');
});

test('level 2: a live ball resting on plate B does not satisfy the echo-only goal', () => {
  const g = new Game(LEVELS);
  g.loadLevel(1);
  g.dropAt(130, 230);
  for (let i = 0; i < 900; i++) g.tick();
  const sensor = g.world.sensors.find((s) => s.name === 'S');
  assert.equal(sensor.litByLive, true, 'live lamp lights the sensor');
  assert.equal(g.completed, false, 'but the goal demands an echo light');
});

test('level 3 (MACHINE) is solvable: slide the emitter, then the echo lands on the far plate', () => {
  const g = new Game(LEVELS);
  g.loadLevel(2);
  g.setRegion(0, 0, 800, 540);
  g.toggleRecording();
  g.dropAt(85, 235);                      // falls onto plate C: emitter starts running
  for (let i = 0; i < 420; i++) g.tick();
  g.toggleRecording();

  g.resetLevel();
  const emitter = g.world.emitters.find((e) => e.name === 'E');
  assert.equal(emitter.running, false, 'emitter is idle after reset');
  g.moveEmitter(emitter, 720);           // the live machine moves; recorded emissions keep their path
  assert.equal(emitter.x, 720);

  g.selected.add(1);
  g.playSelected();
  const at = runUntil(g, (game) => game.completed, 1200);
  assert.ok(at >= 0, 'echo emissions shifted by the emitter should reach the GOAL plate');
});

test('the emitter rail clamps its movement', () => {
  const g = new Game(LEVELS);
  g.loadLevel(2);
  const e = g.world.emitters[0];
  g.moveEmitter(e, 5000);
  assert.equal(e.x, e.railMax);
  g.moveEmitter(e, -5000);
  assert.equal(e.x, e.railMin);
});

test('level 4 (CHORUS) is solvable only by combining two recordings', () => {
  const g = new Game(LEVELS);
  g.loadLevel(3);
  assert.equal(g.level.id, 'l4-chorus');

  g.setRegion(0, 0, 470, 540);             // the left half
  g.toggleRecording();
  g.dropAt(100, 240);
  for (let i = 0; i < 200; i++) g.tick();
  g.toggleRecording();

  g.setRegion(490, 0, 470, 540);           // the right half
  g.toggleRecording();
  g.dropAt(800, 240);
  for (let i = 0; i < 200; i++) g.tick();
  g.toggleRecording();

  g.resetLevel();
  g.selected = new Set([1]);
  g.playSelected();
  for (let i = 0; i < 600; i++) g.tick();
  assert.equal(g.completed, false, 'one half alone must not complete the chorus');

  g.resetLevel();
  g.selected = new Set([1, 2]);
  g.playSelected();
  const at = runUntil(g, (game) => game.completed, 600);
  assert.ok(at >= 0, 'both halves replayed together should complete the level');
});

test('level 5 (PRESENCE): a body in the doorway blocks memory until it is cleared after reset', () => {
  const g = new Game(LEVELS);
  g.loadLevel(4);
  assert.equal(g.level.id, 'l5-presence');
  const gate = g.world.doors[0]; // replaced below by the post-reset door

  // Clear the doorway first, so the recording holds no echo of the doorway ball.
  assert.equal(g.removeBodyAt(468, 488), true, 'the doorway ball can be clicked away');
  g.setRegion(0, 0, 960, 540);
  g.toggleRecording();
  g.toggleDoor(gate);                    // the player opens the gate while recording
  g.dropAt(80, 240);
  for (let i = 0; i < 480; i++) g.tick();
  g.toggleRecording();

  // After reset the doorway ball is back, so the gate's memory cannot land.
  g.resetLevel();
  const resetGate = g.world.doors[0];   // reset rebuilds the world: fetch the new door
  assert.equal(resetGate.open, false, 'gate starts shut after reset');
  g.selected = new Set([1]);
  g.playSelected();
  for (let i = 0; i < 700; i++) g.tick();
  assert.equal(g.completed, false, 'a body in the doorway must block the memory');
  assert.ok(g.events.some((e) => (typeof e === 'string' ? e : e.text).startsWith('PRESENCE:')), 'the block is explained');

  // Clear the doorway after the reset, and the memory lands.
  g.resetLevel();
  assert.equal(g.removeBodyAt(468, 488), true);
  g.selected = new Set([1]);
  g.playSelected();
  assert.ok(runUntil(g, (game) => game.completed, 700) >= 0, 'with the doorway clear the memory writes and the echo arrives');
});

test('level 6 (PHASE): a sensor light and a plate weight must coincide; two recordings supply them', () => {
  const g = new Game(LEVELS);
  g.loadLevel(5);
  assert.equal(g.level.id, 'l6-phase');

  g.setRegion(0, 0, 450, 540);
  g.toggleRecording();
  g.dropAt(230, 350);
  for (let i = 0; i < 120; i++) g.tick();
  g.toggleRecording();

  g.setRegion(480, 0, 480, 540);
  g.toggleRecording();
  g.dropAt(730, 350);
  for (let i = 0; i < 120; i++) g.tick();
  g.toggleRecording();

  g.resetLevel();
  g.selected = new Set([2]);
  g.playSelected();
  for (let i = 0; i < 300; i++) g.tick();
  assert.equal(g.completed, false, 'a weight alone cannot satisfy a goal that needs light');

  g.resetLevel();
  g.selected = new Set([1, 2]);
  g.playSelected();
  assert.ok(runUntil(g, (game) => game.completed, 300) >= 0, 'the two pulses should coincide and complete the level');
});

test('progression: the story levels advance in order and the sandbox has no goal', () => {
  const g = new Game(LEVELS);
  g.loadLevel(1);
  g.completed = true;
  assert.equal(g.advance(), true);
  assert.equal(g.level.id, 'l3-machine');
  g.completed = true;
  assert.equal(g.advance(), true);
  assert.equal(g.level.id, 'l4-chorus');
  g.completed = true;
  assert.equal(g.advance(), true);
  assert.equal(g.level.id, 'l5-presence');
  g.completed = true;
  assert.equal(g.advance(), true);
  assert.equal(g.level.id, 'l6-phase');
  g.completed = true;
  assert.equal(g.advance(), true);
  assert.equal(g.level.id, 'sandbox');
  assert.equal(g.isSandbox, true);
  for (let i = 0; i < 600; i++) g.tick();
  assert.equal(g.completed, false, 'the sandbox never completes');
  assert.equal(g.advance(), false, 'nothing follows the sandbox');
});

test('deleting the last recording removes it and its selection', () => {
  const g = new Game(LEVELS);
  g.setRegion(0, 0, 420, 540);
  g.toggleRecording();
  g.tick();
  g.toggleRecording();
  assert.equal(g.recordings.length, 1);
  assert.ok(g.selected.has(1));
  g.deleteLastRecording();
  assert.equal(g.recordings.length, 0);
  assert.equal(g.selected.has(1), false);
});

test('dropping outside a drop zone is refused', () => {
  const g = new Game(LEVELS);
  assert.equal(g.dropAt(900, 500), false);
  assert.equal(g.world.bodies.length, 0);
});

test('finishing the final story level sets the ending flag; finishing other levels does not', () => {
  const stub = (id) => ({ id, title: id, brief: [], goalText: 'x', dropZones: [], build() {}, goal: () => true, hint: '' });
  const g = new Game([stub('l5-presence'), stub('l6-phase'), stub('sandbox')]);
  g.loadLevel(0);
  g.tick();
  assert.equal(g.endingPending, false);
  g.loadLevel(1);
  g.tick();
  assert.equal(g.endingPending, true);
});
