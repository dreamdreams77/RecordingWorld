import test from 'node:test';
import assert from 'node:assert/strict';
import { World, IDLE } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { LEVELS } from '../src/levels/index.js';

const start = (id, pos, checkpoint = pos) => {
  const level = LEVELS[id], world = new World(level), dir = new Director(world, level), bot = new Bot(level, { world });
  const step = world.step.bind(world); world.step = (i) => { step(i); dir.update(); };
  world.teleportPlayer(pos, 0); world.checkpoint = { pos: [...checkpoint], yaw: 0 };
  bot.step(5);
  return { level, world, dir, bot };
};

test('Dead Field: walking in with the laser armed is lethal; the field is only crossable once something disarms it', () => {
  const { world, bot } = start('ch2', [0, 0, -112]);
  world.drainEvents();
  bot.faceXZ(0, -145);
  let zapped = false;
  for (let i = 0; i < 400 && !zapped; i++) { bot.step(1, { mz: 1 }); zapped = world.drainEvents().some((e) => e.type === 'zapped'); }
  assert.ok(zapped, 'the armed laser floor zaps the walker');
  // the remembered button disarms it; so would the crate (covered by the solver variants)
  bot.walkTo(-6, -110.2);
  world.startRecording(0, bot.vol(-5, 1.2, -110.9, 4, 2.2, 2.9)); bot.press('safeBtn'); bot.step(30); world.stopRecording();
  world.play(0, { mode: 'hold' }); bot.step(120);
  assert.ok(bot.st('laser', 's') < 0.05, 'a held recording of the pressed button keeps the laser asleep');
  world.stop(0); bot.step(200);
  assert.ok(bot.st('laser', 's') > 0.95, 're-armed as soon as the history is dismissed');
});

test('Fork: a ledger recognises only its own history; canon seals the other history out for good, and rewinding undoes it', () => {
  const { world, dir, bot } = start('ch3', [0, 0, -102]);
  dir.loadTape(dir.tapes.find((t) => t.id === 'tE'), 0); dir.loadTape(dir.tapes.find((t) => t.id === 'tW'), 1);
  world.play(0, { mode: 'hold' }); world.play(1, { mode: 'hold' }); bot.step(160);
  assert.ok(bot.st('forkE', 's') < 0.01 && world.aliveList.some((L) => L.echo && L.id === 'forkE' && L.st[0] > 0.9), 'the present bridge is down; only the echo bridge exists');
  // go to the WEST ledger holding the EAST charter (slot 0): refused
  bot.walkTo(-4, -108.5); bot.walkTo(-4, -125); bot.walkTo(-5, -131.5);
  bot.lookAt(-5, 0.6, -134); world.drainEvents();
  bot.step(1, { interact: true, slot: 0 }); bot.step(2);
  assert.ok(world.drainEvents().some((e) => e.type === 'ledger-refuse'), 'the west ledger refuses the east charter');
  const cap = world.capture(), h = world.hash();
  bot.step(1, { interact: true, slot: 1 }); bot.step(2);
  assert.equal(bot.signal('ledW'), 1, 'the west ledger accepts the west charter');
  assert.ok(world.sealed.has('forkE') && world.pins.forkE === 0 && world.pins.forkW > 0.99, 'canon: west built and pinned up, east pinned down and sealed');
  bot.step(60);
  assert.ok(!world.aliveList.some((L) => L.echo && L.id === 'forkE'), 'the east history can no longer be played');
  dir.loadTape(dir.tapes.find((t) => t.id === 'tE'), 0); world.play(0, { mode: 'hold' }); bot.step(160);
  assert.ok(!world.aliveList.some((L) => L.echo && L.id === 'forkE'), 'reloading the east tape does nothing');
  world.reinstate(cap);
  assert.equal(world.hash(), h, 'rewinding before the decision restores both histories');
  assert.equal(bot.signal('ledW'), 0);
});

test('Prism Hall: no amount of waiting lights all three colours — history is required', () => {
  const { world, bot } = start('ch5', [0, 18, -106], [0, 18, -106]);
  let seenR = false, seenAll = false;
  for (let i = 0; i < 4000; i++) { bot.step(1); seenR ||= (world.R.get('Sr') ?? 0) > 0.5; seenAll ||= (world.R.get('allLit') ?? 0) > 0.5; }
  assert.ok(seenR, 'individual colours do light up on their own schedule');
  assert.ok(!seenAll, 'but never all three together without a second history');
});

test('The Well: stepping onto the wearing floor with no history ends in a fall, and the tile stays worn', () => {
  const { world, bot } = start('ch6', [0, 0, -95], [0, 0, -92]);
  bot.walkTo(0, -101);
  for (let i = 0; i < 1200 && bot.st('P', 's') < 0.99; i++) bot.step(1);
  bot.step(20);
  world.drainEvents(); world.checkpoint = { pos: [0, -12, -101], yaw: 0 };
  bot.faceXZ(0, -118);
  let fell = false;
  for (let i = 0; i < 600 && !fell; i++) { bot.step(1, { mz: 1 }); fell = world.drainEvents().some((e) => e.type === 'fell'); }
  assert.ok(fell, 'the tile wore out under the walker and they fell');
  assert.ok(bot.st('tileT', 'integ') < 0.2, 'the present tile is worn');
});

test('The Well: the descender is one-way — it will not rise on its own', () => {
  const { bot } = start('ch6', [0, 0, -95], [0, 0, -92]);
  bot.walkTo(0, -101);
  for (let i = 0; i < 1200 && bot.st('P', 's') < 0.99; i++) bot.step(1);
  bot.walkTo(0, -99, { tol: 0.3 }); bot.step(600);
  assert.ok(bot.st('P', 's') > 0.99, 'still at the bottom');
});
