// For every chapter: (1) the intended solution works, (2) it stops working when its essential ingredient is withheld,
// (3) rewinding to the start restores the exact starting state, (4) replaying the same solution reproduces the same result
// tick for tick, (5) the same solution run twice from scratch is bit-identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { LEVELS, CAMPAIGN } from '../src/levels/index.js';
import { signature } from './helpers/temporal.js';

async function attempt(id, { refuseRecording = false, refuseTapes = false, world = null } = {}) {
  const mod = await import(`./solutions/${id}.js`), variant = (mod.variants ?? [{}])[0], level = LEVELS[id];
  const w = world ?? new World(level, { canon: variant.canon, flags: variant.flags }), dir = new Director(w, level, null, variant.flags ?? {}), bot = new Bot(level, { world: w });
  const step = w.step.bind(w); w.step = (i) => { step(i); dir.update(); };
  if (refuseRecording) w.startRecording = () => false;
  if (refuseTapes) dir.loadTape = () => false;
  let threw = null; try { mod.default(bot, dir, { variant }); } catch (e) { threw = e.message; }
  return { w, dir, threw, level, variant };
}

for (const id of CAMPAIGN) {
  test(`${id}: intended solution completes; the same solution run twice is bit-identical, tick for tick`, async () => {
    const a = await attempt(id), b = await attempt(id);
    assert.ok(a.dir.completed, `${id} intended solution did not complete (${a.threw ?? 'no error'})`);
    assert.equal(a.w.tick, b.w.tick, 'same number of ticks'); assert.equal(signature(a.w), signature(b.w), 'identical final world, echoes included');
    assert.deepEqual([...a.dir.found].sort(), [...b.dir.found].sort(), 'identical discoveries'); assert.equal(a.dir.sectionIndex, b.dir.sectionIndex);
  });

  test(`${id}: withholding the essential ingredient (recordings, or tapes) means the chapter cannot be completed`, async () => {
    const needsRecordings = (LEVELS[id].par?.recordings ?? 0) > 0, needsTapes = (LEVELS[id].tapes ?? []).length > 0 && !needsRecordings;
    const r = await attempt(id, { refuseRecording: needsRecordings, refuseTapes: needsTapes });
    assert.ok(needsRecordings || needsTapes, 'every chapter depends on recording or on tapes');
    assert.match(r.threw ?? '', /could not reach/, `${id}: the attempt must be stopped by the world (a shut door, a missing stair), not by an unrelated failure`);
    assert.equal(r.dir.completed, false, `${id} was completed without ${needsRecordings ? 'any recording' : 'any archive tape'} — the same actions do not need the mechanic`);
  });

  test(`${id}: after solving, rewinding to the start restores the exact initial world, and solving again gives the identical result`, async () => {
    const mod = await import(`./solutions/${id}.js`), variant = (mod.variants ?? [{}])[0], level = LEVELS[id];
    const w = new World(level, { canon: variant.canon, flags: variant.flags }); const start = w.capture(), sig0 = signature(w);
    const first = await attempt(id, { world: w }); assert.ok(first.dir.completed); const sigEnd = signature(w), tickEnd = w.tick;
    w.reinstate(start);
    assert.equal(signature(w), sig0, 'rewinding to the beginning restores the starting world exactly (state, signals and echoes)');
    assert.equal(w.recordings.filter(Boolean).length, 0, 'and forgets the recordings made afterwards');
    const second = await attempt(id, { world: w }); assert.ok(second.dir.completed, 'the puzzle can be solved a second time after resetting');
    assert.equal(w.tick, tickEnd, 'in exactly as many ticks'); assert.equal(signature(w), sigEnd, 'with the identical final state');
  });
}

// ---- Chapter VI: the three histories the Eye distinguishes. Door g1 wants (plate pressed) AND (nobody seen).
//   plate pressed = the present plate is pressed by some body, OR a recorded plate remembers being pressed
//   somebody seen = the present Eye sees a Recollector (you, or an echo of you) in its zone, OR a recorded Eye remembers seeing
test('VI Eyes: recorded history of the OBJECT (plate), of the RECOLLECTOR (player) and of the EYE\'s perception are three independent histories, with one predictable rule', () => {
  const rows = [];
  for (const keepPlayer of [true, false]) for (const keepPlate of [true, false]) for (const keepEye of [true, false]) {
    const w = new World(LEVELS.ch6), bot = new Bot(LEVELS.ch6, { world: w }); w.teleportPlayer([6, 0, -137], 0); bot.step(10);
    w.startRecording(0, bot.vol(6, 1.5, -137, 3.5, 3, 3), 'me'); bot.step(60); w.stopRecording();
    const tracks = [...w.recordings[0].tracks.keys()]; assert.ok(['player', 'xP', 'xEye1'].every((t) => tracks.includes(t)), `the frame holds you, the plate and the Eye (${tracks})`);
    w.teleportPlayer([0, 0, -137], 0);                                  // you stand in the hall, outside the Eye's zone
    const mute = new Set(); if (!keepPlayer) mute.add('player'); if (!keepPlate) mute.add('xP'); if (!keepEye) mute.add('xEye1');
    w.play(0, { mode: 'loop' }); for (const t of mute) w.muteTrack(0, t); bot.step(240);
    const open = w.byId.get('g1').st[0] > 0.98, pressed = w.R.get('xP') === 1, seen = w.R.get('xEye1') === 1;
    // the rule, derived from the definitions above
    const expPressed = keepPlate || keepPlayer, expSeen = keepEye || keepPlayer, expOpen = expPressed && !expSeen;
    rows.push(`player ${keepPlayer ? 'kept   ' : 'omitted'} plate ${keepPlate ? 'kept   ' : 'omitted'} eye ${keepEye ? 'kept   ' : 'omitted'} → pressed ${pressed} seen ${seen} door ${open ? 'OPEN' : 'shut'}`);
    assert.equal(pressed, expPressed, `pressed: ${rows.at(-1)}`); assert.equal(seen, expSeen, `seen: ${rows.at(-1)}`); assert.equal(open, expOpen, `door: ${rows.at(-1)}`);
    if (expOpen) assert.deepEqual([keepPlayer, keepPlate, keepEye], [false, true, false], 'exactly one combination opens the door');
  }
  assert.equal(rows.filter((r) => r.includes('OPEN')).length, 1, `exactly one of the eight combinations opens the door:\n${rows.join('\n')}`);
});
