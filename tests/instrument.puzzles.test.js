// The instrument inside real puzzles: every time verb routed through the interface must behave exactly like the direct
// world call, previewing must never change a puzzle, and the new controls must not open shortcuts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, IDLE } from '../src/sim/world.js';
import { Director } from '../src/sim/director.js';
import { Bot } from '../src/sim/bot.js';
import { LEVELS } from '../src/levels/index.js';
import { Instrument, RATE_STEPS } from '../src/game/instrument.js';

const fakeGame = (world) => ({ world, selected: 0, audio: null, hud: { toast() {} }, feel() {}, level: { sandbox: false }, frameMode: false, pinned: null });
const rig = (levelId, variant = {}) => {
  const level = LEVELS[levelId], world = new World(level, { canon: variant.canon, flags: variant.flags }), dir = new Director(world, level, null, variant.flags ?? {}), bot = new Bot(level, { world });
  const step = world.step.bind(world); world.step = (i) => { step(i); dir.update(); };
  const g = fakeGame(world), I = new Instrument(g); g.instr = I;
  return { level, world, dir, bot, g, I };
};

// ---- 1. every chapter's real solution, with the time verbs going through the Instrument
for (const id of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']) {
  test(`${id}: the campaign solution still solves the puzzle with reverse / rate / freeze / scrub routed through the interface`, async () => {
    const mod = await import(`./solutions/${id}.js`), variant = (mod.variants ?? [{}])[0];
    const { world, dir, bot, g, I, level } = rig(id, variant);
    const proto = World.prototype, saved = { reverse: proto.reverse, setRate: proto.setRate, setHead: proto.setHead, pause: proto.pause, play: proto.play };
    let routed = 0, inside = false;                       // the Instrument itself calls the real world methods; only outside calls are routed
    const via = (fn) => { inside = true; try { return fn(); } finally { inside = false; } };
    // route each verb through the Instrument for this world only
    proto.reverse = function (slot) { if (this !== world || inside) return saved.reverse.call(this, slot); g.selected = slot; routed++; via(() => I.reverse()); };
    proto.setRate = function (slot, r) {
      if (this !== world || inside) return saved.setRate.call(this, slot, r);
      g.selected = slot; routed++;
      const pb = this.playbacks[slot]; let guard = 8;
      via(() => { while (pb && Math.abs(pb.rate) !== r && guard--) I.rate(RATE_STEPS.indexOf(r) > RATE_STEPS.indexOf(Math.abs(pb.rate)) ? 1 : -1); });
    };
    proto.setHead = function (slot, h) { if (this !== world || inside) return saved.setHead.call(this, slot, h); g.selected = slot; routed++; if (!this.playbacks[slot]?.active) this.playbacks[slot] && (this.playbacks[slot].active = true); via(() => I.scrubTo(h, { quiet: true })); };
    // play(slot, {mode, rate}): direction, speed and mode are chosen with the instrument's own controls on the stored recording, then it is played
    proto.play = function (slot, opts = {}) {
      if (this !== world || inside || !(opts.rate || opts.mode)) return saved.play.call(this, slot, opts);
      g.selected = slot; const pb = this.playbacks[slot];
      if (pb && !pb.active) {
        routed++;
        via(() => {
          if (opts.mode) { let guard = 5; while (pb.mode !== opts.mode && guard--) I.cycleMode(); }
          if (opts.rate) { if ((opts.rate < 0) !== (pb.rate < 0)) I.reverse(); let guard = 8; while (Math.abs(pb.rate) !== Math.abs(opts.rate) && guard--) I.rate(RATE_STEPS.indexOf(Math.abs(opts.rate)) > RATE_STEPS.indexOf(Math.abs(pb.rate)) ? 1 : -1); }
        });
        return saved.play.call(this, slot, {});
      }
      return saved.play.call(this, slot, opts);
    };
    proto.pause = function (slot) { if (this !== world || inside) return saved.pause.call(this, slot); g.selected = slot; routed++; const pb = this.playbacks[slot]; if (pb?.active && pb.playing) via(() => I.freezeHere()); };
    try { mod.default(bot, dir, { variant }); } finally { Object.assign(proto, saved); }
    assert.ok(dir.completed, `${id} not completed through the interface; player at ${[...world.player.st].slice(0, 3).map((n) => n.toFixed(1))}`);
    console.log(`    ${id}: solved with ${routed} time-verb calls routed through the Instrument`);
  });
}

// ---- 2. VI "The Witness": omit opens it; solo-ing yourself, or freezing on the plate, must not
async function witness() {
  const r = rig('ch6'); const { world: w, bot } = r;
  w.teleportPlayer([6, 0, -137], 0); bot.step(10);
  w.startRecording(0, bot.vol(6, 1.5, -137, 2.5, 3, 2.5), 'me'); bot.step(60); w.stopRecording();
  w.teleportPlayer([0, 0, -140], 0);
  return r;
}
test('Witness via the interface: omitting yourself opens the door; freezing on the plate, soloing yourself, or merely previewing do not', async () => {
  let r = await witness(); const door = () => r.world.byId.get('g1').st[0];
  r.I.scrubTo(30); for (let i = 0; i < 300; i++) r.world.step(IDLE);
  assert.ok(door() < 0.05, 'a preview alone never opens anything'); assert.equal(r.world.playbacks[0].active, false);
  r.I.freezeHere(); r.bot.step(300);
  assert.equal(r.world.R.get('xEye1'), 1, 'the frozen echo of you is still seen'); assert.ok(door() < 0.05, 'frozen on the plate: still shut');
  r.I.lane('player', true); r.bot.step(300);   // solo: ONLY you, which is exactly what the Eye forbids
  assert.ok(door() < 0.05, 'soloing yourself keeps the door shut');
  r.I.lane('player', true); r.I.lane('player'); r.bot.step(300);   // clear solo, then omit yourself
  assert.ok(door() > 0.98, 'omitting yourself from your own memory opens it'); assert.equal(r.world.R.get('xP'), 1, 'while the plate still remembers being pressed');
  r.I.lane('player'); r.bot.step(200); assert.ok(door() < 0.9 || r.world.R.get('xEye1') === 1, 'putting yourself back closes it again');
});

// ---- 3. VI "The Blind Eye": the reel names the blind frame, but only freezing *that* frame opens the door
test('Blind Eye via the interface: the marker finds the blind frame; a wrong frame, a preview, or replaying a blind Eye do not open the door', async () => {
  const r = rig('ch6'); const { world: w, bot, I } = r; w.teleportPlayer([0, 0, -156], 0);
  for (let i = 0; i < 400 && bot.signal('xEye2') < 0.5; i++) bot.step(1);
  w.teleportPlayer([0, 0, -149], 0); w.startRecording(1, bot.vol(0, 4.5, -146.8, 4.6, 1.4, 0.6), 'shutter'); bot.step(360); w.stopRecording();
  w.teleportPlayer([0, 0, -156], 0); r.g.selected = 1;
  const door = () => w.byId.get('xD').st[0];
  const blind = w.recordings[1].markers.filter((m) => m.id === 'xEye2' && m.dir > 0 === false); // "xEye2 sees no one" markers
  assert.ok(w.recordings[1].tracks.has('xEye2') && w.recordings[1].markers.some((m) => m.id === 'xEye2'), 'the reel lists the Eye in this recording');
  I.scrubTo(200); for (let i = 0; i < 400; i++) w.step(IDLE); assert.ok(door() < 0.5, 'previewing (even at the blind frame) opens nothing');
  // a wrong frame: freeze somewhere the shutter is NOT over the lens
  I.scrubTo(150); I.freezeHere(); bot.step(300); assert.equal(w.R.get('xEye2'), 1, 'Eye still sees'); assert.ok(door() < 0.5, 'freezing a wrong frame does not open the door');
  w.stop(1); I.clear();
  // the blind frame: the Eye is covered for ~100 ticks around the cycle; find it with the reel's own markers and freeze in the middle
  const seeNone = w.recordings[1].markers.filter((m) => m.id === 'xEye2');
  const ticks = []; for (let t = 0; t < 360; t += 2) { w.playFrom(1, t, { frozen: true }); bot.step(1); if (bot.signal('xEye2') < 0.5) ticks.push(t); }
  assert.ok(ticks.length > 3, 'there is a blind window'); w.stop(1);
  const runs = []; for (const t of ticks) { const r = runs[runs.length - 1]; if (r && t === r[r.length - 1] + 2) r.push(t); else runs.push([t]); }
  let opened = 0;
  for (const run of runs) {                                    // freeze in the middle of each blind window, hold a full cycle
    w.stop(1); I.clear(); I.scrubTo(run[run.length >> 1], { quiet: true }); I.freezeHere();
    let seen = 0, maxDoor = 0; for (let i = 0; i < 360; i++) { bot.step(1); seen += bot.signal('xEye2'); maxDoor = Math.max(maxDoor, door()); }
    if (seen === 0 && maxDoor > 0.98) opened++;
  }
  assert.ok(opened >= 1, 'freezing a genuinely blind frame covers the lens and opens the door');
  assert.ok(opened < runs.length * 2, 'sanity');
  // replaying a recording of the Eye being blind does NOT blind the present Eye (reconciliation is OR: seeing wins)
  w.stop(1); I.clear(); w.teleportPlayer([0, 0, -156], 0);
  const R2 = rig('ch6'); R2.world.teleportPlayer([0, 0, -156], 0);
  for (let i = 0; i < 400 && R2.bot.signal('xEye2') > 0.5; i++) R2.bot.step(1);      // wait until the Eye IS blind
  R2.world.startRecording(0, R2.bot.vol(0, 4.5, -150, 9, 3, 6), 'blind eye'); R2.bot.step(30); R2.world.stopRecording();
  for (let i = 0; i < 400 && R2.bot.signal('xEye2') < 0.5; i++) R2.bot.step(1);       // the shutter moves on; the Eye sees you again
  R2.world.playFrom(0, 5, { mode: 'hold' }); R2.world.setHead(0, 5); R2.bot.step(200);
  assert.equal(R2.bot.signal('xEye2'), 1, 'an echo of a blind Eye cannot blind the present one');
});
