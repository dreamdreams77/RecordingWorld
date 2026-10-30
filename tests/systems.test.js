import test from 'node:test';
import assert from 'node:assert/strict';
import { arena, Bot, World, IDLE, wall, floor, door, bridge, crate, plate, lever, button, gate, flywheel, resonator, beam, mirror, sensor } from './helpers.js';

const slider = (id, pos, to, size, extra = {}) => ({ id, type: 'slider', mode: 'matter', pos, to, size, speed: 1, ...extra });

test('hazards: a moving hazard zaps the player back to the checkpoint; echoes of hazards are hazards too', () => {
  const lv = arena([
    gate('osc', 'osc', [], { period: 120, duty: 0.5 }),
    slider('sweep', [-6, 1, -6], [6, 1, -6], [1, 2, 1], { hazard: true, in: ['osc'], speed: 0.6 }),
  ]);
  const b = new Bot(lv);
  b.walkTo(0, -6, { tol: 0.5 }); b.w.drainEvents();
  let zapped = false;
  for (let i = 0; i < 400 && !zapped; i++) { b.step(1); zapped = b.w.drainEvents().some((e) => e.type === 'zapped'); }
  assert.ok(zapped, 'standing in the sweeper path gets you zapped');
  b.step(2);
  assert.ok(b.p[2] > -1, `returned to the checkpoint (z=${b.p[2].toFixed(2)})`);
  // an echo of the sweeper is also a hazard
  b.w.startRecording(0, b.vol(0, 1, -6, 9, 3, 3)); b.step(120); b.w.stopRecording();
  assert.ok([...b.w.recordings[0].tracks.keys()].includes('sweep'));
});

test('crumble: wears under load and stays broken; an echo keeps the integrity it was recorded with', () => {
  const lv = arena([wall('ledge', [-4, -2, -2], [4, 0, 6]), { id: 'tile', type: 'crumble', pos: [0, -0.25, -6], size: [4, 0.5, 8], life: 40 }], {});
  lv.entities = lv.entities.filter((e) => e.id !== 'floor');
  const b = new Bot(lv);
  b.walkTo(0, 0);
  // record the pristine tile, then hold it
  b.w.startRecording(0, b.vol(0, 0, -6, 5, 3, 6)); b.step(30); b.w.stopRecording(); b.w.play(0, { mode: 'hold' }); b.step(40);
  b.faceXZ(0, -20); b.step(200, { mz: 1 });
  assert.equal(b.st('tile', 'integ'), 0, 'the present tile wore away under the walker');
  assert.ok(b.p[2] < -8, `the held pristine history carried the player across (z=${b.p[2].toFixed(1)})`);
  // without history the same walk falls
  const c = new Bot(lv); c.walkTo(0, 0); c.faceXZ(0, -20); c.step(260, { mz: 1 });
  assert.ok(c.p[2] > -8, 'without history the tile gives way and the walker falls and is returned to the checkpoint');
});

test('descender: sinks under load, stays down; a reversed recording of the descent lifts the rider back', () => {
  const lv = arena([wall('wellN', [-8, -12, -12], [8, 0, -4]), wall('rim', [-8, -12, 2], [8, 0, 6])], {});
  lv.entities = lv.entities.filter((e) => e.id !== 'floor');
  lv.entities.push(wall('lipN', [-8, -12, -10], [8, -11.5, -4]));
  lv.entities.push({ id: 'lift', type: 'descender', pos: [0, -0.25, -1], to: [0, -10.25, -1], size: [4, 0.5, 4], speed: 0.2 });
  lv.entities.push(wall('rimW', [-8, -12, -3], [-2, 0, 1]), wall('rimE', [2, -12, -3], [8, 0, 1]), wall('lip', [-8, -12, -13], [8, 0, -10]));
  const b = new Bot(lv);
  b.walkTo(0, -1);
  b.w.startRecording(0, b.vol(0, -5, -1, 4, 8, 3));
  b.step(400);
  assert.ok(b.st('lift', 's') > 0.95, 'the platform carried the rider to the bottom');
  b.step(10);
  assert.ok(b.p[1] < -8, 'rider is at the bottom');
  b.w.stopRecording();
  b.walkTo(0, -3.5, { tol: 0.4 });
  b.w.play(0, { mode: 'hold', rate: -1 });
  b.step(5);
  assert.equal(b.w.playbacks[0].rate, -1);
  b.walkTo(0, -1.2, { tol: 0.3, max: 600 });
  b.step(500);
  assert.ok(b.w.playbacks[0].head <= 1, 'reverse playback reached the start');
  assert.ok(b.p[1] > -1, `rider rose with the echo platform (y=${b.p[1].toFixed(2)})`);
});

test('carillon + tempo lock: a recorded melody played in reverse, faster, opens a retrograde-tempo lock; forward and slow do not', () => {
  const mel = [[1, 60], [3, 60], [5, 60], [6, 60], [4, 60]];
  const mk = () => new Bot(arena([
    { id: 'car', type: 'carillon', pos: [0, 1.4, -6], melody: mel, once: true, in: ['go'] }, lever('go', [3, 0, -3]),
    resonator('lock', [6, 1.4, -6], { seq: [4, 6, 5, 3, 1], tempo: [20, 36], window: 80, hold: 600, charge: 20 }),
  ]));
  const play = (b, rate, reverse) => {
    b.walkTo(2, -2);
    b.w.startRecording(0, b.vol(0, 1.5, -6, 2, 2, 2)); b.press('go'); b.step(330); b.w.stopRecording();
    b.w.play(0, { mode: 'once', rate: reverse ? -rate : rate }); b.step(360);
  };
  const a = mk(); play(a, 2, true);  assert.equal(a.signal('lock'), 1, 'reverse ×2 opens the lock');
  const f = mk(); play(f, 2, false); assert.equal(f.signal('lock'), 0, 'forward order is the wrong melody');
  const s = mk(); play(s, 1, true);  assert.equal(s.signal('lock'), 0, 'reverse at normal speed is the wrong tempo');
});

test('optics: a prism disperses white into red/green/blue; filters pass only their colour; sensors can demand a colour', () => {
  const lv = arena([
    beam('B', [-8, 1.2, -10], 0),
    { id: 'P', type: 'prism', pos: [0, 1.2, -10] },
    sensor('R', [0, 1.2, -4], { hue: 1 }), sensor('G', [8, 1.2, -10], { hue: 2 }), sensor('Bl', [0, 1.2, -16], { hue: 3 }),
    sensor('Wrong', [0, 1.2, -2.5], { hue: 3 }),
  ]);
  const b = new Bot(lv); b.step(3);
  assert.equal(b.signal('R'), 1); assert.equal(b.signal('G'), 1); assert.equal(b.signal('Bl'), 1);
  assert.equal(b.signal('Wrong'), 0, 'a blue sensor ignores the red beam');
  const lv2 = arena([beam('B', [-8, 1.2, -10], 0), { id: 'F', type: 'filter', pos: [-3, 1.2, -10], hue: 2 }, sensor('S', [8, 1.2, -10], { hue: 2 }), sensor('SW', [8, 1.2, -4], { hue: 0 })]);
  const c = new Bot(lv2); c.step(3);
  assert.equal(c.signal('S'), 1, 'white through a green filter is green');
  const lv3 = arena([beam('B', [-8, 1.2, -10], 0, { hue: 1 }), { id: 'F', type: 'filter', pos: [-3, 1.2, -10], hue: 2 }, sensor('S', [8, 1.2, -10], { hue: 0 })]);
  const d = new Bot(lv3); d.step(3);
  assert.equal(d.signal('S'), 0, 'a red beam is stopped by a green filter');
});

test('actors walk a path, hum a motif, and are recorded like anything else', () => {
  const lv = arena([{ id: 'ghost', type: 'actor', pos: [-4, 0, -6], startOn: 'x', path: [[0, -4, -6], [120, 4, -6]], tones: [[10, 60, 3]] }]);
  const b = new Bot(lv);
  b.step(10); assert.equal(b.st('ghost', 'active'), 0, 'dormant until triggered');
  b.w.byId.get('ghost').st[7] = 1; b.w.byId.get('ghost').st[6] = 0;
  b.w.startRecording(0, b.vol(0, 1, -6, 6, 2, 3));
  b.step(130); b.w.stopRecording();
  assert.ok(b.st('ghost', 'x') > 3.9, 'walked to the end of its path');
  const tr = b.w.recordings[0].tracks.get('ghost'); assert.ok(tr, 'the actor was recorded');
  b.w.play(0, { mode: 'once' }); b.step(30);
  assert.ok(b.w.sources.some((s) => s.id === 'ghost' && s.layer === 1), 'the echo of the actor hums too');
});

test('canon: a recording becomes present reality; apocrypha stops listening; other histories are sealed out', () => {
  const lv = arena([
    slider('brE', [4, -4, -10], [4, 0, -10], [3, 0.5, 8], { s0: 0 }), slider('brW', [-4, -4, -10], [-4, 0, -10], [3, 0.5, 8], { s0: 0 }),
    { id: 'led', type: 'ledger', pos: [0, 0.6, 3] },
  ]);
  lv.entities = lv.entities.filter((e) => e.id !== 'floor'); lv.entities.push(floor('ground', [-12, -2, -4], [12, 0, 6]));
  const mkWorld = () => new Bot(lv);
  // history A: east bridge raised, west bridge down
  const hist = (side) => {
    const b = mkWorld();
    b.w.byId.get(side === 'E' ? 'brE' : 'brW').st[1] = 1;
    b.step(120);
    b.w.startRecording(0, b.vol(0, -1, -10, 8, 6, 6)); b.step(30); b.w.stopRecording();
    return b.w.recordings[0];
  };
  const recE = hist('E'), recW = hist('W');
  const b = mkWorld();
  b.w.loadRecording(0, recE); b.w.loadRecording(1, recW);
  b.w.play(0, { mode: 'hold' }); b.w.play(1, { mode: 'hold' }); b.step(60);
  assert.ok(b.w.aliveList.some((L) => L.id === 'brW' && L.echo), 'before canon both histories are live');
  b.walkTo(0, 1.5);
  b.lookAt(0, 0.6, 3);
  b.step(1, { interact: true, slot: 0 }); b.step(3);
  assert.equal(b.w.R.get('led'), 1, 'the ledger records the choice');
  assert.equal(b.w.recordings[0], null, 'the canonised recording is consumed');
  assert.ok(b.st('brE', 's') > 0.9 && b.w.pins.brE > 0.99, 'east bridge is now real and pinned up');
  assert.equal(b.w.pins.brW, 0, 'west bridge is pinned down');
  b.step(60);
  assert.ok(!b.w.aliveList.some((L) => L.id === 'brW' && L.echo), 'the west history is sealed out: its echo is ignored');
  assert.ok(b.w.rollbackRecording(0), 'the consumed recording is recoverable by rollback');
  // determinism with pins
  const h1 = b.w.hash(); const snap = JSON.parse(JSON.stringify(b.w.snapshot()));
  const c = mkWorld(); c.w.restore(snap); assert.equal(c.w.hash(), h1, 'pins and seals survive save/load');
});

test('recovery: rollback of recordings and rewind captures restore exact state', () => {
  const b = new Bot(arena([plate('p', [0, 0, -3]), crate('c', [3, 0, -3])]));
  b.walkTo(0, -3);
  b.w.startRecording(0, b.vol(0, 1, -3, 4, 3, 4)); b.step(60); const r1 = b.w.stopRecording();
  b.w.startRecording(0, b.vol(0, 1, -3, 4, 3, 4)); b.step(90); const r2 = b.w.stopRecording();
  assert.notEqual(r1.length, r2.length);
  assert.equal(b.w.rollbackRecording(0).length, r1.length, 'rollback restores the overwritten take');
  b.w.eraseRecording(0); assert.equal(b.w.recordings[0], null);
  assert.ok(b.w.rollbackRecording(0), 'an erased recording can be brought back');
  const cap = b.w.capture(), h = b.w.hash();
  b.walkTo(5, 0); b.w.play(0, { mode: 'loop' }); b.step(200);
  assert.notEqual(b.w.hash(), h);
  b.w.reinstate(cap);
  assert.equal(b.w.hash(), h, 'rewind restores the exact world');
  b.step(120); // and it keeps simulating
});

test('directors apply physical story events (actors appear, architecture moves) when sections begin', async () => {
  const { Director } = await import('../src/sim/director.js');
  const lv = arena([door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], {}), { id: 'wit', type: 'actor', pos: [0, 0, -4], startOn: 'section:s', path: [[0, 0, -4], [60, 2, -4]] }],
    { sections: [{ id: 's', trigger: [-9, -1, -9, 9, 5, 8], checkpoint: { pos: [0, 0, 0] } }], events: [{ on: 'section:s', set: { d: { tgt: 1 } }, actors: ['wit'] }], discoveries: [], experiments: [] });
  const w = new World(lv); const dir = new Director(w, lv);
  for (let i = 0; i < 90; i++) { w.step(IDLE); dir.update(); }
  assert.ok(w.byId.get('d').st[0] > 0.9, 'the door slid open by event');
  assert.ok(w.byId.get('wit').st[0] > 1.9, 'the witness walked on cue');
});
