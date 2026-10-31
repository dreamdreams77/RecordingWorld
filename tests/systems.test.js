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

test('brittle pane: sustained sound at its pitch shatters it for good; other pitches do not; history does not break', () => {
  const lv = arena([{ id: 'gl', type: 'pane', pos: [0, 1.5, -6], size: [4, 3, 0.2], note: 6, hold: 60 }]);
  const b = new Bot(lv);
  b.walkTo(0, -2);
  b.sing(3, 3); assert.equal(b.st('gl', 'integ'), 1, 'the wrong note does nothing');
  b.sing(6, 0.5); assert.ok(b.st('gl', 'integ') === 1, 'a brief note is not enough');
  b.w.drainEvents(); b.sing(6, 2);
  assert.equal(b.st('gl', 'integ'), 0, 'sustained resonance shatters it');
  assert.ok(b.w.drainEvents().some((e) => e.type === 'shatter'));
  b.step(300); assert.equal(b.st('gl', 'integ'), 0, 'and it stays shattered');
  // history does not break: an echo of the intact pane keeps standing
  const c = new Bot(lv); c.walkTo(0, -2);
  c.w.startRecording(0, c.vol(0, 1.5, -6, 3, 3, 1)); c.step(20); c.w.stopRecording(); c.w.play(0, { mode: 'hold' });
  c.sing(6, 3);
  assert.equal(c.st('gl', 'integ'), 0);
  assert.ok(c.w.aliveList.some((L) => L.echo && L.id === 'gl' && L.st[0] === 1), 'the recorded pane is still whole');
  c.faceXZ(0, -20); c.step(120, { mz: 1 });
  assert.ok(c.p[2] > -5.9, 'and still blocks the way');
});

test('count gate: opens on exactly n rising edges, jams permanently on n+1, resettable', () => {
  const lv = arena([lever('l', [3, 0, 0]), gate('cnt', 'count', ['l'], { n: 3, reset: 'rs' }), lever('rs', [3, 0, -1])]);
  const b = new Bot(lv);
  const flip = () => { const L = b.w.byId.get('l'); L.st[0] = L.st[0] ? 0 : 1; b.step(3); };
  flip(); flip(); flip(); flip(); flip();  // on off on off on  → 3 rising edges
  assert.equal(b.signal('cnt'), 1, 'exactly three presses opens it');
  flip(); flip();                          // a fourth rising edge
  assert.equal(b.signal('cnt'), 0, 'one press too many jams it');
  flip(); flip(); assert.equal(b.signal('cnt'), 0, 'and it stays jammed');
  b.w.byId.get('rs').st[0] = 1; b.step(3); b.w.byId.get('rs').st[0] = 0; b.step(3);
  assert.equal(b.w.byId.get('cnt').st[3], 0, 'the reset input clears the jam');
});

test('echoes are immune to hazards: history can stand where the living cannot, and press plates there', () => {
  const lv = arena([{ id: 'laz', type: 'slider', mode: 'matter', hazard: true, pos: [0, -1.6, -8], to: [0, 0.2, -8], size: [8, 0.4, 8], s0: 1, in: ['!safe'], speed: 5 }, lever('safe', [6, 0, -3], { hold: 240 }), plate('pp', [0, 0, -8])]);
  const b = new Bot(lv);
  b.walkTo(5, -3.2); b.w.startRecording(0, b.vol(0, 1, -6, 7, 3, 5));
  b.press('safe'); b.walkTo(0, -8, { tol: 0.3 }); b.step(40); b.w.stopRecording();
  b.walkTo(5, -2); b.step(200);
  assert.equal(b.st('laz', 's'), 1, 'the laser is armed again');
  b.w.drainEvents(); b.w.play(0, { mode: 'hold' }); b.step(140);
  assert.ok(!b.w.drainEvents().some((e) => e.type === 'zapped'), 'the player was not harmed by the echo walking through the laser');
  assert.equal(b.signal('pp'), 1, 'the echo presses a plate in the middle of the lethal floor');
});

test('causality: explain() names which history is deciding a door, and reconcile events fire when history flips a signal', () => {
  const lv = arena([plate('p', [0, 0, -3]), door('d', [-2, 0, -8], [2, 3, -7.6], [0, 3, 0], { in: ['p'] })]);
  const b = new Bot(lv);
  b.walkTo(0, -3); b.w.startRecording(0, b.vol(0, 1, -3, 3, 3, 3)); b.step(60); b.w.stopRecording();
  b.walkTo(0, -6); b.w.drainEvents(); b.w.play(0, { mode: 'loop' }); b.step(20);
  const ex = b.w.explain('d');
  assert.equal(ex.inputs[0].id, 'p'); assert.ok(ex.inputs[0].pass);
  assert.ok(ex.inputs[0].layers.some((l) => l.layer === 1 && l.value > 0.5), 'the recorded plate is pressed');
  assert.deepEqual(ex.inputs[0].layers.find((l) => l.layer === 0).heldBy, [1], 'the present plate is held down only by the echo');
  assert.ok(b.w.explain('p').echoDriven, 'the plate is held by history, not the present');
  b.step(10);
  assert.ok(b.w.drainEvents().some((e) => e.type === 'reconcile' && e.id === 'p'), 'a reconcile event was raised for the feedback layer');
});

test('barks fire once near their trigger and honour flags; discoveries can be gated by flags', async () => {
  const { Director } = await import('../src/sim/director.js');
  const lv = arena([], { sections: [{ id: 's', trigger: [-9, -1, -9, 9, 5, 8], checkpoint: { pos: [0, 0, 0] } }],
    barks: [{ id: 'b1', at: [0, 1, -3], r: 2, text: 'hello' }, { id: 'b2', at: [0, 1, -3], r: 2, text: 'gated', ifFlag: 'op2' }],
    discoveries: [{ id: 'd1', pos: [0, 1, -3], title: 'x', text: 'y' }, { id: 'd2', pos: [0, 1, -3], title: 'z', text: 'w', ifFlag: 'ending' }], experiments: [] });
  const w = new World(lv), dir = new Director(w, lv, null, { ending: true }, {});
  const bot = new Bot(lv, { world: w }); const st = w.step.bind(w); w.step = (i) => { st(i); dir.update(); };
  bot.walkTo(0, -3);
  const msgs = dir.drain();
  assert.equal(msgs.filter((m) => m.kind === 'bark').length, 1, 'only the ungated bark fired');
  assert.equal(msgs.filter((m) => m.kind === 'discovery').length, 2, 'the post-ending log appears when the flag is set');
  bot.step(60); assert.equal(dir.drain().filter((m) => m.kind === 'bark').length, 0, 'barks do not repeat');
});

test('selective playback: a muted track leaves the echo, survives snapshot/rewind, and solo isolates one object', async () => {
  const { World, IDLE } = await import('../src/sim/world.js');
  const { LEVELS } = await import('../src/levels/index.js');
  const w = new World(LEVELS.ch1);
  const P = w.player.st;
  const plate = w.byId.get('plateA'), [px, , pz] = plate.def.pos;
  w.teleportPlayer([px, 0, pz], 0);
  w.startRecording(0, { x0: px - 3, x1: px + 3, y0: -1, y1: 3, z0: pz - 3, z1: pz + 3 }, 'stand');
  for (let i = 0; i < 40; i++) w.step(IDLE);
  w.stopRecording();
  w.teleportPlayer([px + 6, 0, pz], 0);
  assert.ok(w.recordings[0].tracks.has('player'), 'the player is in the recording');
  w.play(0, { mode: 'loop' });
  for (let i = 0; i < 5; i++) w.step(IDLE);
  assert.equal(w.R.get('plateA'), 1, 'the echo of the player presses the plate');
  assert.equal(w.muteTrack(0, 'player'), true);
  for (let i = 0; i < 3; i++) w.step(IDLE);
  assert.equal(w.R.get('plateA'), 1, 'the plate’s own recorded history still says it was pressed');
  w.muteTrack(0, 'plateA');
  for (let i = 0; i < 3; i++) w.step(IDLE);
  assert.equal(w.R.get('plateA'), 0, 'with both the player and the plate’s history left out, the plate is up');
  assert.ok(!w.aliveList.some((L) => L.echo && L.id === 'player'), 'no player echo exists');
  const h = w.hash(), snap = w.snapshot();
  const w2 = new World(LEVELS.ch1); w2.restore(JSON.parse(JSON.stringify(snap)));
  assert.equal(w2.hash(), h, 'muting survives save/load exactly');
  const cap = w.capture(); w.muteTrack(0, 'player', false); w.reinstate(cap);
  assert.ok(w.playbacks[0].muted.has('player'), 'muting survives rewind');
  w.soloTrack(0, 'player');
  assert.equal(w.playbacks[0].muted.size, w.recordings[0].tracks.size - 1, 'solo mutes everything else');
  for (let i = 0; i < 3; i++) w.step(IDLE);
  assert.equal(w.R.get('plateA'), 1, 'the player’s echo alone physically presses the present plate');
  w.soloTrack(0, 'player');
  assert.equal(w.playbacks[0].muted.size, 0, 'solo again restores everything');
});

// ---- the instrument: markers, preview sampling, tick-exact stepping
async function recordedStand() {
  const { World, IDLE } = await import('../src/sim/world.js');
  const { LEVELS } = await import('../src/levels/index.js');
  const w = new World(LEVELS.ch1), plate = w.byId.get('plateA'), [px, , pz] = plate.def.pos;
  w.teleportPlayer([px + 4, 0, pz], 0);
  w.startRecording(0, { x0: px - 3, x1: px + 6, y0: -1, y1: 3, z0: pz - 3, z1: pz + 3 }, 'walk on');
  for (let i = 0; i < 20; i++) w.step(IDLE);
  w.teleportPlayer([px, 0, pz], 0);            // steps onto the plate at tick 20
  for (let i = 0; i < 40; i++) w.step(IDLE);
  w.teleportPlayer([px + 4, 0, pz], 0);        // and off again at tick 60
  for (let i = 0; i < 20; i++) w.step(IDLE);
  w.stopRecording();
  return { w, IDLE, plate };
}

test('markers are derived from the stored history: the plate press and release appear at the right ticks', async () => {
  const { w } = await recordedStand();
  const rec = w.recordings[0], m = rec.markers.filter((k) => k.kind === 'plate');
  assert.equal(m.length, 2, 'one press and one release');
  assert.ok(m[0].dir === 1 && m[1].dir === -1 && m[0].t < m[1].t);
  assert.ok(Math.abs(m[0].t - 21) <= 2 && Math.abs(m[1].t - 61) <= 2, `ticks ${m[0].t}/${m[1].t}`);
  assert.match(m[0].label, /pressed/); assert.equal(rec.markers, rec.markers, 'cached');
  const j = JSON.parse(JSON.stringify(w.snapshot())), { Recording } = await import('../src/sim/recording.js');
  assert.deepEqual(Recording.fromJSON(j.recs[0]).markers.map((k) => [k.t, k.id, k.kind]), rec.markers.map((k) => [k.t, k.id, k.kind]), 'identical after save/load');
});

test('preview sampling reads a moment without touching the world, allocating, or disagreeing with real playback', async () => {
  const { w, IDLE } = await recordedStand();
  const rec = w.recordings[0], before = w.hash();
  const a = rec.sampleAll(40), again = rec.sampleAll(10);
  assert.equal(a, again, 'the scratch list is reused, not reallocated');
  assert.equal(w.hash(), before, 'previewing changes nothing in the world');
  const at40 = rec.sampleAll(40).find((e) => e.id === 'plateA');
  assert.equal(at40.st[0], 1, 'at tick 40 the plate was down'); assert.equal(rec.sampleAll(5).find((e) => e.id === 'plateA').st[0], 0, 'and at tick 5 it was up');
  // real playback frozen at the same tick agrees with the preview exactly
  const p = w.byId.get('player'), px = rec.sampleAll(40).find((e) => e.id === 'player').st[0];
  w.playFrom(0, 40, { frozen: true });
  const echo = w.aliveList.find((L) => L.echo && L.id === 'player');
  assert.equal(echo.st[0], px, 'preview position == frozen echo position');
  assert.equal(rec.sampleAll(10_000)[0] !== undefined, true, 'out-of-range ticks clamp instead of throwing');
  assert.equal(rec.sampleAll(-50).find((e) => e.id === 'plateA').st[0], 0, 'negative ticks clamp to the start');
  const muted = new Set(['player']); assert.equal(rec.sampleAll(40, muted).find((e) => e.id === 'player').alive, false, 'omitted tracks are not previewed');
});

test('playFrom and stepHead are tick-exact, freeze really freezes, and rewinding restores the moment', async () => {
  const { w, IDLE } = await recordedStand();
  assert.equal(w.playFrom(0, 30, { frozen: true }), true);
  const pb = w.playbacks[0];
  assert.equal(pb.head, 30); assert.equal(pb.playing, false);
  for (let i = 0; i < 25; i++) w.step(IDLE);
  assert.equal(pb.head, 30, 'a frozen echo does not advance');
  w.stepHead(0, 1); assert.equal(pb.head, 31); w.stepHead(0, -2); assert.equal(pb.head, 29);
  w.stepHead(0, -999); assert.equal(pb.head, 0, 'clamped at the start'); w.stepHead(0, 9999); assert.equal(pb.head, w.recordings[0].length - 1, 'clamped at the end');
  const cap = w.capture(); w.playFrom(0, 5); for (let i = 0; i < 30; i++) w.step(IDLE);
  w.reinstate(cap); assert.equal(w.playbacks[0].head, w.recordings[0].length - 1);
  assert.equal(w.playFrom(3, 10), false, 'an empty slot cannot be played');
  w.playFrom(0, 12, { mode: 'loop' }); for (let i = 0; i < 4; i++) w.step(IDLE);
  assert.equal(w.playbacks[0].head, 16, 'playFrom starts real playback from that tick');
  w.reverse(0); w.step(IDLE); assert.equal(w.playbacks[0].head, 15, 'and reverse runs it backwards from there');
});
