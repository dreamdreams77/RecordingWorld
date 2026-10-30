import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, Bot, World, IDLE, plate, door, bridge, crate, lever, wall, gate } from './helpers.js';

test('player walks, stops at walls and lands on the floor', () => {
  const b = new Bot(arena([wall('w', [-3, 0, -10], [3, 4, -9])]));
  b.step(30);
  assert.ok(Math.abs(b.p[1] - 0.9) < 0.02, 'standing on floor');
  b.step(200, { mz: 1 });
  assert.ok(b.p[2] > -9 + 0.3 - 1e-3 && b.p[2] < -8, `blocked by wall at z=-9 (z=${b.p[2]})`);
});

test('pressure plate opens an aperture door; door is passable when open', () => {
  const lv = arena([plate('p', [0, 0, -3]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]);
  const b = new Bot(lv);
  b.step(10);
  assert.equal(b.w.R.get('p'), 0);
  b.walkTo(0, -3);
  b.step(120);
  assert.equal(b.w.R.get('p'), 1);
  assert.ok(b.st('d', 's') > 0.9);
});

test('crate on a plate holds it down (alternative solution to standing there)', () => {
  const lv = arena([plate('p', [0, 0, -4]), crate('c', [0, 0, -2])]);
  const b = new Bot(lv);
  b.walkTo(0, 1.5);
  b.faceXZ(0, -10);
  for (let i = 0; i < 200 && !b.w.R.get('p'); i++) b.step(1, { mz: 1 });
  assert.equal(b.w.R.get('p'), 1);
  b.step(1, {});
  b.walkTo(5, 0);
  b.step(60);
  assert.equal(b.w.R.get('p'), 1, 'the crate keeps it pressed after the player leaves');
});

test('recording captures the player standing on a plate; the echo holds the door open', () => {
  const lv = arena([plate('p', [0, 0, -3]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]);
  const b = new Bot(lv);
  b.walkTo(0, -3);
  const rec = b.record(0, b.vol(0, 1, -3, 3, 3, 3), 3);
  assert.ok(rec && rec.length >= 170);
  b.walkTo(0, -6);
  b.step(180);
  assert.equal(b.w.R.get('p') ?? 0, 0, 'door closed again once the player left');
  b.w.play(0, { mode: 'loop' });
  b.step(120);
  assert.equal(b.w.R.get('p'), 1, 'echo player presses the plate');
  assert.ok(b.st('d', 's') > 0.9, 'door open because of the echo');
  assert.equal(b.w.byId.get('p').st[0], 1);
});

test('hold mode keeps the final recorded frame alive; once mode ends', () => {
  const lv = arena([lever('lv', [3, 0, -2], { hold: 120 })]);
  const b = new Bot(lv);
  b.walkTo(2.2, -1.2);
  const rec = b.record(0, b.vol(0, 1, -4, 8, 4, 8), 0, (bot) => { bot.press('lv'); bot.seconds(1.2); });
  b.walkTo(8, 2);
  b.w.play(0, { mode: 'hold' });
  b.step(400);
  const pb = b.w.playbacks[0];
  assert.ok(pb.active && !pb.playing, 'held at the final frame');
  b.w.stop(0);
  b.w.play(0, { mode: 'once' });
  b.step(400);
  assert.ok(!b.w.playbacks[0].active, 'once-mode playback ended');
});

test('echo bridge provides a physical connection where the present bridge is gone (matter union)', () => {
  // present bridge retracted; recording made while it was extended
  const lv = arena([
    wall('ledgeN', [-4, -2, -30], [4, 0, -14]),
    wall('ledgeS', [-4, -2, -9], [4, 0, 6]),
    bridge('br', [-1.5, -3.5, -14], [1.5, -3, -9], [0, 3, 0], { s0: 1 }),
    lever('lv', [3.5, 0, -8], { hold: 300 }),
  ]);
  // make the floor only the two ledges
  lv.entities = lv.entities.filter((e) => e.id !== 'floor');
  // the bridge is wired to nothing; we directly script it: s0=1 initially, record, then retract it by hand
  const b = new Bot(lv);
  b.w.byId.get('br').st[1] = 1; // tgt=1 (no input => manual target)
  b.walkTo(3, -7);
  b.record(0, b.vol(0, -1, -11.5, 6, 4, 6), 1);
  b.w.byId.get('br').st[1] = 0; b.w.byId.get('br').st[0] = 0; // present bridge disappears
  b.step(5);
  b.walkTo(0, -3);
  // without the echo: fall
  const b2 = new Bot(lv); b2.w.byId.get('br').st[0] = 0; b2.w.byId.get('br').st[1] = 0; b2.w.refreshDerived();
  b2.walkTo(0, -7); b2.step(1, { mz: 1 }); b2.step(150, { mz: 1 });
  assert.ok(b2.p[1] < 0.5 || b2.p[2] > -14, 'player falls into the gap without history');
  // with echo (hold): walk across
  b.w.play(0, { mode: 'hold' }); b.step(90);
  b.walkTo(0, -7.5);
  b.faceXZ(0, -20);
  b.step(160, { mz: 1 });
  assert.ok(b.p[2] < -14.2 && b.p[1] > 0.8, `crossed on the echo bridge (z=${b.p[2].toFixed(2)}, y=${b.p[1].toFixed(2)})`);
});

test('door aperture rule: a door recorded open stays open though the present door is closed', () => {
  const lv = arena([door('d', [-2, 0, -6], [2, 3, -5.6], [0, 3, 0], { s0: 1 })]);
  const b = new Bot(lv);
  b.step(5);
  b.w.byId.get('d').st[1] = 1;
  b.record(0, b.vol(0, 1, -6, 4, 3, 3), 0.5);
  b.w.byId.get('d').st[0] = 0; b.w.byId.get('d').st[1] = 0; // present: closed
  b.step(2);
  b.faceXZ(0, -20);
  b.step(120, { mz: 1 });
  assert.ok(b.p[2] > -5.4, 'blocked by closed present door');
  b.w.play(0, { mode: 'loop' });
  b.step(30);
  assert.ok(b.w.overruled.has('d'), 'present door is overruled by the echo');
  b.faceXZ(0, -20);
  b.step(120, { mz: 1 });
  assert.ok(b.p[2] < -7, `passed through the remembered-open door (z=${b.p[2].toFixed(2)})`);
});

test('determinism: identical input scripts produce identical state hashes', () => {
  const run = () => {
    const b = new Bot(arena([plate('p', [0, 0, -3]), crate('c', [2, 0, -2]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]));
    b.walkTo(0, -3);
    b.record(0, b.vol(0, 1, -3, 4, 3, 4), 2);
    b.walkTo(5, 0);
    b.w.play(0, { mode: 'loop' });
    b.step(300);
    return b.w.hash();
  };
  assert.equal(run(), run());
});

test('snapshot/restore reproduces the exact future (save/load correctness)', () => {
  const mk = () => new Bot(arena([plate('p', [0, 0, -3]), crate('c', [2, 0, -2]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]));
  const a = mk();
  a.walkTo(0, -3);
  a.record(0, a.vol(0, 1, -3, 4, 3, 4), 2);
  a.w.play(0, { mode: 'loop' });
  a.step(100);
  const snap = JSON.parse(JSON.stringify(a.w.snapshot()));
  a.step(300);
  const hashA = a.w.hash();
  const b = mk();
  b.w.restore(snap);
  b.yaw = a.yaw;
  b.step(300);
  assert.equal(b.w.hash(), hashA);
});

test('recordings are change-compressed (far fewer keyframes than ticks × entities)', () => {
  const b = new Bot(arena([plate('p', [0, 0, -3]), crate('c', [2, 0, -2]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]));
  b.walkTo(0, -3);
  const rec = b.record(0, b.vol(0, 1, -3, 5, 3, 6), 5);
  const raw = rec.length * rec.tracks.size;
  assert.ok(rec.keyframes < raw * 0.5, `keyframes ${rec.keyframes} vs raw ${raw}`);
});

test('gates: latch, delay, osc and the signal network', () => {
  const lv = arena([lever('set', [3, 0, 0]), lever('rst', [3, 0, -1]),
    gate('L', 'latch', ['set', 'rst']), gate('D', 'delay', ['L'], { ticks: 30 }), gate('O', 'osc', [], { period: 60, duty: 0.5 })]);
  const b = new Bot(lv);
  b.step(5);
  assert.equal(b.signal('L'), 0);
  b.w.byId.get('set').st[0] = 1; b.step(3);
  assert.equal(b.signal('L'), 1);
  b.w.byId.get('set').st[0] = 0; b.step(40);
  assert.equal(b.signal('L'), 1, 'latched');
  assert.equal(b.signal('D'), 1, 'delayed');
  b.w.byId.get('rst').st[0] = 1; b.step(3);
  assert.equal(b.signal('L'), 0);
  let on = 0; for (let i = 0; i < 120; i++) { b.step(1); on += b.signal('O'); }
  assert.ok(on > 50 && on < 70, `osc duty ${on}/120`);
});

test('multi-input sinks are AND by default (regression: slider `mode` must not alter logic)', () => {
  const lv = arena([plate('p1', [-4, 0, -3]), plate('p2', [4, 0, -3]),
    door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p1', 'p2'] }),
    door('dOr', [-2, 0, -12], [2, 3, -11.6], [0, 3, 0], { in: ['p1', 'p2'], logic: 'or' })]);
  const b = new Bot(lv);
  b.walkTo(-4, -3); b.step(120);
  assert.ok(b.st('d', 's') < 0.05, 'one plate must not open an AND door');
  assert.ok(b.st('dOr', 's') > 0.9, 'logic:or opens with one plate');
});

test('beams: mirror reflection, sensors, and an echo mirror in another state does not trap the beam', async () => {
  const { beam, mirror, sensor } = await import('./helpers.js');
  const lv = arena([beam('B', [-6, 1.2, -10], 0), mirror('M', [0, 1.2, -10], 0), sensor('S1', [0, 1.2, -4], { facing: 0 }), sensor('S2', [0, 1.2, -16], { facing: 0 })]);
  const b = new Bot(lv);
  b.step(3);
  assert.equal(b.signal('S1'), 1); assert.equal(b.signal('S2'), 0);
  b.walkTo(2.5, -8);
  b.w.startRecording(0, b.vol(-2, 1.5, -10, 8, 3, 8), 0.2 * 0 + undefined); b.step(30); b.w.stopRecording();
  b.w.play(0, { mode: 'hold' }); b.step(3);
  b.press('M'); b.step(5);
  assert.equal(b.signal('S1'), 1, 'echo sensor stays lit');
  assert.equal(b.signal('S2'), 1, 'present mirror now lights the other sensor');
  for (const bm of b.w.beams) assert.ok(bm.pts.length <= 4, `beam polyline stays short (${bm.pts.length})`);
});

test('sound: resonators hear notes through range and occlusion; recorded voice is heard', async () => {
  const { resonator, wall: w2 } = await import('./helpers.js');
  const lv = arena([resonator('R', [0, 1.4, -8], { want: [3], charge: 20, hold: 0, decay: 30 }), w2('blocker', [-6, 0, -14], [6, 4, -13])]);
  const b = new Bot(lv);
  b.walkTo(3, -4);
  b.sing(3, 1); assert.equal(b.signal('R'), 1, 'heard at 5 m');
  b.step(60); assert.equal(b.signal('R'), 0);
  b.walkTo(8, -12); b.walkTo(8, -20); b.walkTo(0, -20); b.sing(3, 1.5); assert.equal(b.signal('R'), 0, 'occluded by a wall');
  b.walkTo(8, -20); b.walkTo(8, -8); b.walkTo(3, -4);
  b.w.startRecording(0, b.vol(3, 1.5, -4, 3, 3, 3)); b.sing(3, 1); b.w.stopRecording();
  b.walkTo(8, 4); b.step(10);
  assert.equal(b.signal('R'), 0);
  b.w.play(0, { mode: 'loop' }); b.step(50);
  assert.equal(b.signal('R'), 1, 'the echo sings; the resonator hears history');
});

test('superposition: flywheel histories add (sum policy)', async () => {
  const { flywheel, button } = await import('./helpers.js');
  const lv = arena([flywheel('F', [-6, 0, -8], ['btn'], {}), button('btn', [-3, 0, -8], 120)]);
  const b = new Bot(lv);
  b.walkTo(-3, -6);
  b.w.startRecording(0, b.vol(-5, 1.5, -8, 5, 3, 4)); b.press('btn'); b.seconds(2.6); b.w.stopRecording();
  b.w.play(0, { mode: 'hold' }); b.step(900);
  const echoOnly = b.w.R.get('F');
  assert.ok(echoOnly > 0.9 && echoOnly < 1.1, `echo alone ≈ 1 (${echoOnly})`);
  b.press('btn'); b.seconds(2.5);
  assert.ok(b.w.R.get('F') > 1.7, `echo + live > 1.7 (${b.w.R.get('F')})`);
});
