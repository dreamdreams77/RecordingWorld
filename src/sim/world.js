// The World: the single deterministic, fixed-timestep simulation that powers the campaign, the
// sandbox, archive generation and the headless tests.
//
// A tick is:
//   1. advance playbacks and write each echo's recorded state into its layer
//   2. player control
//   3. present-only machine behaviour (sliders, gates, flywheels, ...), reading LAST tick's reconciled signals
//   4. build the reconciled solid set (union of every history, with aperture resolution)
//   5. rigid-body physics: carry, move, push, depenetrate
//   6. fields (light, sound), then sensors/plates/resonators
//   7. reconcile signals across histories  →  R
//   8. conflict analysis, coherence accounting
//   9. recorder capture
// See docs/RECONCILIATION.md for the rules.

import { DT, boxC, overlaps, overlapVolume, intersection, containsPoint, rayBox, cloneBox, Hasher, clamp } from './math.js';
import { TYPES, typeOf, PLAYER_SIZE, EYE_HEIGHT, DOOR_OPEN_THRESHOLD } from './types.js';
import { Recording, Recorder, Playback, PLAYBACK_MODES } from './recording.js';
import { traceBeams, computeSound } from './fields.js';

export const GRAVITY = 24, WALK_SPEED = 4.9, JUMP_SPEED = 7.7, MAX_FALL = 30;
export const IDLE = Object.freeze({ mx: 0, mz: 0, jump: false, interact: false, tone: 0 });

const bodyHalf = (L) => { const s = L.type.size(L.def); return [s[0] / 2, s[1] / 2, s[2] / 2]; };
export function bodyBox(L) {
  const h = bodyHalf(L), st = L.st;
  return { x0: st[0] - h[0], x1: st[0] + h[0], y0: st[1] - h[1], y1: st[1] + h[1], z0: st[2] - h[2], z1: st[2] + h[2] };
}

export class World {
  /**
   * @param {object} level  level definition (see docs/LEVEL_FORMAT.md)
   * @param {{era?:string, caps?:object, noPlayer?:boolean}} opts
   */
  constructor(level, opts = {}) {
    this.level = level;
    this.era = opts.era ?? 'present';
    this.dt = DT;
    this.tick = 0;
    this.caps = { slots: 3, maxTicks: 600, maxVolume: [10, 8, 10], modes: ['once', 'loop'], ...level.caps, ...opts.caps };
    this.items = []; this.byId = new Map();
    this.aliveList = [];
    this.R = new Map();
    this.solids = []; this.bodyBoxes = [];
    this.beams = []; this.litSensors = new Set(); this.sources = [];
    this.conflicts = []; this.events = []; this.openIds = new Set(); this.overruled = new Set();
    this.prevBoxes = new Map();
    this.recordings = new Array(this.caps.slots).fill(null);
    this.undo = Array.from({ length: this.caps.slots }, () => []);
    this.playbacks = new Array(this.caps.slots).fill(null);
    this.recorder = null;
    this.checkpoint = null;
    this.player = null;
    this.stats = { solids: 0, conflicts: 0, stepMs: 0, recordingsMade: 0 };
    this.nextDyn = 1; this.echoDriven = new Set();
    this.pins = {}; this.sealed = new Set(); // canonised state: id → pinned slider position; ids that ignore all echoes
    this.undo = [];

    for (const def of level.entities ?? []) {
      if (def.era && def.era !== this.era) continue;
      if (def.era === 'past' && opts.keep && !opts.keep.includes(def.id)) continue;
      if (def.ifCanon && opts.canon?.[def.ifCanon.key] !== def.ifCanon.is) continue; // consequences of earlier choices
      if (def.ifFlag && !opts.flags?.[def.ifFlag]) continue;
      if (def.ifNotFlag && opts.flags?.[def.ifNotFlag]) continue;
      this.addEntity(this.era === 'past' && def.past ? { ...def, ...def.past } : def);
    }
    if (!opts.noPlayer && level.spawn) {
      const p = level.spawn.pos;
      this.player = this.addEntity({ id: 'player', type: 'player', pos: [p[0], p[1] + PLAYER_SIZE[1] / 2 + 0.01, p[2]], yaw: level.spawn.yaw ?? 0 });
      this.checkpoint = { pos: [...p], yaw: level.spawn.yaw ?? 0 };
    }
    this.refreshDerived();
  }

  // ------------------------------------------------------------------ entities
  addEntity(def) {
    if (this.byId.has(def.id)) throw new Error(`Duplicate entity id '${def.id}'`);
    const type = typeOf(def);
    const L = { id: def.id, def, type, st: Float64Array.from(type.init(def)), layer: 0, echo: false, alive: true, age: 0 };
    this.items.push(L); this.byId.set(def.id, L);
    return L;
  }
  removeEntity(id) {
    const L = this.byId.get(id); if (!L) return;
    this.items.splice(this.items.indexOf(L), 1); this.byId.delete(id);
  }
  /** Spawns a sandbox entity at runtime (same simulation, same rules). */
  spawn(def) {
    const d = { ...def, id: def.id ?? `sb${this.nextDyn++}`, dyn: true };
    const L = this.addEntity(d); this.refreshDerived(); return L;
  }
  *allAlive() { yield* this.aliveList; }

  // ------------------------------------------------------------------ signals
  sig(id) {
    if (id[0] === '!') return (this.R.get(id.slice(1)) ?? 0) > 0.5 ? 0 : 1;
    return this.R.get(id) ?? 0;
  }
  /** Boolean power for a sink from its `in` list (null when it has none). */
  inputOf(def) {
    const ins = def.in;
    if (!ins || !ins.length) return null;
    const and = (def.logic ?? 'and') === 'and';
    let acc = and;
    for (const id of ins) {
      const v = this.sig(id) > 0.5;
      acc = and ? acc && v : acc || v;
    }
    return acc;
  }
  emit(type, data = {}) { if (this.events.length < 256) this.events.push({ tick: this.tick, type, ...data }); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  // ------------------------------------------------------------------ the step
  step(input = IDLE) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.tick++;
    this.conflicts.length = 0;
    this.advancePlaybacks();
    this.applyEchoStates();
    if (this.player) this.playerControl(input);
    for (const L of this.items) if (L.type.step) L.type.step(L, this);
    this.buildSolids();
    this.physics();
    this.bodyBoxes = this.collectBodyBoxes();
    this.checkHazards(this._bodies);
    traceBeams(this);
    computeSound(this);
    for (const L of this.items) if (L.type.post) L.type.post(L, this);
    this.computeSignals();
    this.analyze();
    this.prevBoxes = this.snapshotBoxes();
    if (this.recorder) {
      this.recorder.capture(this);
      if (this.recorder.full) this.stopRecording('capacity');
    }
    this.stats.stepMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  // ------------------------------------------------------------------ echoes
  advancePlaybacks() {
    for (const pb of this.playbacks) {
      if (pb && pb.active && pb.playing) {
        const r = pb.advance();
        if (r === 'ended') { this.emit('ended', { slot: pb.slot }); pb.items.clear(); }
        else if (r === 'held') this.emit('held', { slot: pb.slot });
      }
    }
  }
  applyEchoStates() {
    for (const pb of this.playbacks) {
      if (!pb || !pb.active) continue;
      const tau = pb.tau;
      for (const tr of pb.rec.tracks.values()) {
        let it = pb.items.get(tr.id);
        if (!it) {
          it = { id: tr.id, def: tr.def, type: typeOf(tr.def), st: new Float64Array(tr.nch), layer: pb.slot + 1, echo: true, pb, alive: false, age: 0 };
          pb.items.set(tr.id, it);
        }
        const was = it.alive;
        it.alive = !this.sealed.has(tr.id) && tr.sample(tau, it.st); // canon outranks apocrypha
        it.age = it.alive ? (was ? it.age + 1 : 0) : 0;
      }
    }
    this.rebuildAlive();
  }
  rebuildAlive() {
    const a = this.aliveList; a.length = 0;
    for (const L of this.items) a.push(L);
    for (const pb of this.playbacks) if (pb && pb.active) for (const it of pb.items.values()) if (it.alive) a.push(it);
  }

  // ------------------------------------------------------------------ geometry
  buildSolids() {
    const solids = this.solids; solids.length = 0;
    const open = this.openIds; open.clear();
    for (const L of this.aliveList) {
      let n = 0;
      L.type.colliders?.(L.def, L.st, (s) => {
        s.id = L.id; s.layer = L.layer; s.item = L; s.key = `${L.layer}|${L.id}|${n++}`;
        s.block = !s.hazard;
        if (s.body && !L.echo) { s.dyn = L.def.type === 'crate' ? L : null; L._solid = s; }
        if (s.aperture && s.open) open.add(L.id);
        solids.push(s);
      });
    }
    // Aperture rule: a doorway that ANY history holds open is open for every history.
    this.overruled.clear();
    for (const s of solids) if (s.aperture && open.has(s.id)) {
      s.block = false;
      if (s.layer === 0 && !s.open) this.overruled.add(s.id);
    }
    this.stats.solids = solids.length;
  }
  snapshotBoxes() {
    const m = new Map();
    for (const s of this.solids) m.set(s.key, cloneBox(s.b));
    return m;
  }
  collectBodyBoxes() {
    const out = [];
    for (const L of this.aliveList) if (L.type.body) out.push({ id: L.id, layer: L.layer, b: bodyBox(L) });
    return out;
  }
  insideVolume(L, v) {
    if (L.type.capture === 'overlap') {
      let any = false;
      L.type.colliders?.(L.def, L.st, (s) => { if (overlaps(s.b, v)) any = true; });
      if (any) return true;
    }
    const a = L.type.anchor(L.def, L.st);
    return containsPoint(v, a[0], a[1], a[2]);
  }
  refreshDerived() {
    this.applyEchoStates();
    this.buildSolids();
    this.prevBoxes = this.snapshotBoxes();
    this.bodyBoxes = this.collectBodyBoxes();
    this.computeSignals();
  }

  // ------------------------------------------------------------------ player
  playerControl(input) {
    const p = this.player, st = p.st;
    if (input.yaw !== undefined) st[6] = input.yaw;
    if (input.pitch !== undefined) st[7] = input.pitch;
    const yaw = st[6];
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let wx = fx * input.mz + rx * input.mx, wz = fz * input.mz + rz * input.mx;
    const m = Math.hypot(wx, wz); if (m > 1) { wx /= m; wz /= m; }
    const speed = WALK_SPEED * (input.sprint ? 1.0 : 1.0);
    const ground = st[9] > 0.5, acc = (ground ? 46 : 14) * this.dt;
    st[3] += clamp(wx * speed - st[3], -acc, acc);
    st[5] += clamp(wz * speed - st[5], -acc, acc);
    if (input.jump && ground) { st[4] = JUMP_SPEED; st[9] = 0; }
    st[4] = Math.max(st[4] - GRAVITY * this.dt, -MAX_FALL);
    st[8] = input.tone | 0;
    if (input.interact) this.interact(input);
  }
  eye() { const s = this.player.st; return [s[0], s[1] - 0.9 + EYE_HEIGHT, s[2]]; }
  lookDir() {
    const s = this.player.st, cp = Math.cos(s[7]);
    return [-Math.sin(s[6]) * cp, Math.sin(s[7]), -Math.cos(s[6]) * cp];
  }
  /** Nearest interactable the player is looking at (levers, mirrors). */
  aimedInteractable(maxT = 3.6) {
    const [ox, oy, oz] = this.eye(), [dx, dy, dz] = this.lookDir();
    let best = null, bt = maxT;
    for (const s of this.solids) {
      if (!s.block || s.item === this.player || s.kind === 'mirror') continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, s.b, bt);
      if (t >= 0 && t < bt) bt = t; // walls hide things behind them
    }
    for (const L of this.items) {
      if (!L.type.interact) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, L.type.interactBox(L.def), bt + 0.001);
      if (t >= 0 && t <= bt + 0.001) { best = L; bt = t; }
    }
    return best;
  }
  interact(input) {
    const L = this.aimedInteractable();
    if (!L) return null;
    const r = L.type.interact(L, this, input);
    if (r) this.emit(r, { id: L.id });
    return r;
  }
  teleportPlayer(pos, yaw) {
    const s = this.player.st;
    s[0] = pos[0]; s[1] = pos[1] + PLAYER_SIZE[1] / 2 + 0.01; s[2] = pos[2];
    s[3] = s[4] = s[5] = 0;
    if (yaw !== undefined) s[6] = yaw;
    this.player.crush = 0;
  }
  /** Returns every crate to its home position (a "recall"), resolving overlaps. */
  recallCrates() {
    for (const L of this.items) if (L.def.type === 'crate') { L.st[0] = L.def.pos[0]; L.st[1] = L.def.pos[1]; L.st[2] = L.def.pos[2]; L.st[3] = L.st[4] = L.st[5] = 0; }
    this.refreshDerived(); this.emit('recall');
  }

  // ------------------------------------------------------------------ physics
  physics() {
    const crates = this.items.filter((L) => L.def.type === 'crate');
    const bodies = this.player ? [...crates, this.player] : crates;
    const killY = this.level.killY ?? -30;
    this._bodies = bodies;
    for (const L of bodies) {
      const st = L.st, isPlayer = L === this.player;
      // 1. carried by whatever moved underneath us (lifts, echo bridges, conveyors)
      const sup = this.findSupport(L);
      if (sup) {
        const prev = this.prevBoxes.get(sup.key);
        if (prev) {
          const dx = sup.b.x0 - prev.x0, dy = sup.b.y0 - prev.y0, dz = sup.b.z0 - prev.z0;
          if ((dx || dy || dz) && Math.abs(dx) < 3 && Math.abs(dy) < 3 && Math.abs(dz) < 3) this.moveBody(L, dx, dy, dz);
        }
        if (sup.conv) this.moveBody(L, sup.conv.dx * this.dt, 0, sup.conv.dz * this.dt);
      }
      // 2. integrate
      if (!isPlayer) st[4] = Math.max(st[4] - GRAVITY * this.dt, -MAX_FALL);
      const r = this.moveBody(L, st[3] * this.dt, st[4] * this.dt, st[5] * this.dt);
      if (isPlayer) st[9] = r.landed ? 1 : 0;
      else {
        st[3] = st[5] = 0;
        if (r.landed) { // centre-of-mass rule: a crate whose centre is past its support's edge slides off and falls
          const sp = this.findSupport(L);
          if (sp) {
            const ex = st[0] < sp.b.x0 ? -1 : st[0] > sp.b.x1 ? 1 : 0, ez = st[2] < sp.b.z0 ? -1 : st[2] > sp.b.z1 ? 1 : 0;
            if (ex || ez) this.moveBody(L, ex * 0.06, 0, ez * 0.06);
          }
        }
      }
      // 3. temporal collisions with echoes / moving architecture
      this.depenetrate(L);
      if (st[1] < killY) {
        if (isPlayer) { this.emit('fell'); this.teleportPlayer(this.checkpoint.pos, this.checkpoint.yaw); }
        else { st[0] = L.def.pos[0]; st[1] = L.def.pos[1]; st[2] = L.def.pos[2]; st[4] = 0; this.emit('crate-lost', { id: L.id }); }
      }
    }
  }
  /** Moving hazards (any history's) zap present bodies on contact. */
  checkHazards(bodies) {
    for (const L of bodies) {
      const bb = bodyBox(L);
      for (const s of this.solids) {
        if (!s.hazard || !overlaps(bb, s.b)) continue;
        this.conflicts.push({ kind: 'hazard', id: s.id, layer: s.layer, body: L.id, box: intersection(bb, s.b), vol: 0 });
        if (L === this.player) { this.emit('zapped', { by: s.id, layer: s.layer }); this.teleportPlayer(this.checkpoint.pos, this.checkpoint.yaw); }
        else { L.st[0] = L.def.pos[0]; L.st[1] = L.def.pos[1]; L.st[2] = L.def.pos[2]; L.st[3] = L.st[4] = L.st[5] = 0; this.emit('crate-lost', { id: L.id }); }
        break;
      }
    }
  }
  findSupport(L) {
    const bb = bodyBox(L);
    let best = null, bv = 0;
    for (const s of this.solids) {
      if (!s.block || s.item === L) continue;
      const prev = this.prevBoxes.get(s.key) ?? s.b;
      if (Math.abs(prev.y1 - bb.y0) > 0.06) continue;
      const ox = Math.min(prev.x1, bb.x1) - Math.max(prev.x0, bb.x0), oz = Math.min(prev.z1, bb.z1) - Math.max(prev.z0, bb.z0);
      if (ox > 1e-4 && oz > 1e-4 && ox * oz > bv) { bv = ox * oz; best = s; }
    }
    return best;
  }
  moveBody(L, dx, dy, dz, depth = 0) {
    const st = L.st, res = { landed: false, blocked: false };
    const h = bodyHalf(L), dl = [dx, dy, dz];
    for (const axis of [1, 0, 2]) {
      const d = dl[axis]; if (!d) continue;
      st[axis] += d;
      for (const s of this.solids) {
        if (!s.block || s.item === L) continue;
        let bb = bodyBox(L);
        if (!overlaps(bb, s.b)) continue;
        if (axis !== 1 && s.dyn && depth < 3) { // shove a present crate
          const pen = axis === 0 ? (d > 0 ? bb.x1 - s.b.x0 : s.b.x1 - bb.x0) : (d > 0 ? bb.z1 - s.b.z0 : s.b.z1 - bb.z0);
          const dd = [0, 0, 0]; dd[axis] = (d > 0 ? 1 : -1) * (pen + 1e-4);
          this.moveBody(s.dyn, dd[0], dd[1], dd[2], depth + 1);
          bb = bodyBox(L);
          if (!overlaps(bb, s.b)) continue;
        }
        if (axis !== 1 && L === this.player && st[9] > 0.5) { // auto step-up for low ledges and stairs
          const rise = s.b.y1 - bb.y0;
          if (rise > 0.01 && rise <= 0.62) {
            const y0 = st[1]; st[1] += rise + 1e-3;
            const nb = bodyBox(L);
            let free = true;
            for (const o of this.solids) if (o.block && o.item !== L && overlaps(nb, o.b)) { free = false; break; }
            if (free) { st[4] = Math.max(st[4], 0); continue; }
            st[1] = y0;
          }
        }
        const lo = ['x0', 'y0', 'z0'][axis], hi = ['x1', 'y1', 'z1'][axis];
        if (d > 0) st[axis] = s.b[lo] - h[axis] - 1e-4; else st[axis] = s.b[hi] + h[axis] + 1e-4;
        st[3 + axis] = 0;
        res.blocked = true;
        if (axis === 1 && d < 0) res.landed = true;
      }
    }
    if (L._solid) L._solid.b = bodyBox(L);
    return res;
  }
  /** Echo/architecture overlapping a present body shoves it out; this is the "temporal collision". */
  depenetrate(L) {
    const st = L.st, h = bodyHalf(L);
    for (let iter = 0; iter < 4; iter++) {
      const bb = bodyBox(L);
      let hit = null;
      for (const s of this.solids) { if (s.block && s.item !== L && overlaps(bb, s.b)) { hit = s; break; } }
      if (!hit) { L.crush = Math.max(0, (L.crush ?? 0) - 1); return; }
      const sb = hit.b;
      const pen = [Math.min(bb.x1 - sb.x0, sb.x1 - bb.x0), Math.min(bb.y1 - sb.y0, sb.y1 - bb.y0), Math.min(bb.z1 - sb.z0, sb.z1 - bb.z0)];
      let axis = 0; if (pen[1] < pen[axis]) axis = 1; if (pen[2] < pen[axis]) axis = 2;
      const c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2];
      const sc = [(sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2, (sb.z0 + sb.z1) / 2];
      const dir = c[axis] >= sc[axis] ? 1 : -1;
      st[axis] += dir * (pen[axis] + 1e-3);
      if (axis === 1 && dir > 0) st[4] = Math.max(st[4], 0);
      this.conflicts.push({ kind: 'displace', id: hit.id, layer: hit.layer, body: L.id, box: intersection(bb, sb) });
    }
    L.crush = (L.crush ?? 0) + 1;
    this.conflicts.push({ kind: 'crush', id: L.id, layer: 0, body: L.id, box: bodyBox(L) });
    if (L.crush > 40) {
      L.crush = 0;
      if (L === this.player) { this.emit('crushed'); this.teleportPlayer(this.checkpoint.pos, this.checkpoint.yaw); }
      else { st[0] = L.def.pos[0]; st[1] = L.def.pos[1]; st[2] = L.def.pos[2]; this.emit('crate-lost', { id: L.id }); }
    }
  }

  // ------------------------------------------------------------------ reconciliation
  computeSignals() {
    const R = new Map();
    for (const L of this.aliveList) {
      const t = L.type; if (!t.out) continue;
      const v = t.out(L.def, L.st); if (v === undefined) continue;
      if (t.policy === 'sum') R.set(L.id, (R.get(L.id) ?? 0) + v);
      else R.set(L.id, Math.max(R.get(L.id) ?? 0, v));
    }
    this.R = R;
    // which signals are true ONLY because a history says so (the heart of reconciliation, surfaced for feedback)
    const driven = new Set();
    for (const [id, v] of R) {
      if (v <= 0.5) continue;
      const P = this.byId.get(id);
      const presentTrue = P?.heldBy ? P.heldBy.has(0) : (P?.type.out?.(P.def, P.st) ?? 0) > 0.5;
      if (!presentTrue) driven.add(id);
    }
    if (this.tick > 0) for (const id of driven) if (!this.echoDriven.has(id)) { const L = this.aliveList.find((x) => x.id === id); this.emit('reconcile', { id, pos: L ? L.type.anchor(L.def, L.st) : null }); }
    this.echoDriven = driven;
  }

  analyze() {
    const C = this.conflicts;
    // (a) overlapping matter from different histories
    const S = this.solids;
    for (let i = 0; i < S.length; i++) {
      const a = S[i]; if (!a.block || a.body && a.layer === 0) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j]; if (!b.block || a.layer === b.layer || a.id === b.id || (b.body && b.layer === 0)) continue;
        if (a.kind === 'wall' && b.kind === 'wall') continue;
        const v = overlapVolume(a.b, b.b);
        if (v > 0.25) C.push({ kind: 'overlap', id: a.id, other: b.id, layer: Math.max(a.layer, b.layer), layerA: a.layer, layerB: b.layer, vol: v, box: intersection(a.b, b.b) });
      }
    }
    // (b) the same entity in disagreeing histories (what the reconciliation rules arbitrate)
    for (const pb of this.playbacks) {
      if (!pb || !pb.active) continue;
      for (const it of pb.items.values()) {
        if (!it.alive) continue;
        const P = this.byId.get(it.id);
        if (!P) { C.push({ kind: 'projection', id: it.id, layer: it.layer }); continue; }
        const k = P.type.keyCh;
        if (k >= 0 && Math.abs(P.st[k] - it.st[k]) > 0.05) C.push({ kind: 'state', id: it.id, layer: it.layer, present: P.st[k], echo: it.st[k], rule: ruleName(P) });
      }
    }
    // (c) coherence accounting: echoes that fight reality lose coherence and eventually collapse
    const drain = new Float32Array(this.playbacks.length);
    for (const c of C) {
      if (c.kind === 'state' || c.kind === 'projection' || c.kind === 'hazard') continue;
      const w = Math.min(1, (c.vol ?? 3.6) / 6);
      if (c.layerA > 0) drain[c.layerA - 1] += 0.0006 + 0.001 * w;
      if (c.layerB > 0) drain[c.layerB - 1] += 0.0006 + 0.001 * w;
      if (c.layerA === undefined && c.layer > 0) drain[c.layer - 1] += 0.004;
    }
    this.playbacks.forEach((pb, i) => {
      if (!pb || !pb.active) return;
      pb.coherence = clamp(pb.coherence - drain[i] + (drain[i] === 0 ? 0.0015 : 0), 0, 1);
      if (pb.coherence <= 0) { this.deactivate(i); this.emit('collapse', { slot: i }); }
    });
    this.stats.conflicts = C.length;
  }

  // ------------------------------------------------------------------ recording / playback API
  slotCount() { return this.caps.slots; }
  setSlots(n) {
    while (this.recordings.length < n) { this.recordings.push(null); this.playbacks.push(null); this.undo.push([]); }
    this.caps.slots = n;
  }
  /** @param volume {x0,y0,z0,x1,y1,z1} */
  startRecording(slot, volume, name) {
    if (this.recorder) this.stopRecording('restart');
    if (slot < 0 || slot >= this.caps.slots) return false;
    this.deactivate(slot);
    this.pushUndo(slot);
    this.recorder = new Recorder(slot, volume, this.caps.maxTicks, name ?? `Recording ${slot + 1}`);
    this.recorder.capture(this);
    this.emit('record-start', { slot });
    return true;
  }
  stopRecording(reason = 'user') {
    const r = this.recorder; if (!r) return null;
    this.recorder = null;
    if (r.tau < 2) { this.emit('record-abort', { slot: r.slot }); return null; }
    if (r.rec.tracks.size === 0) { this.emit('record-empty', { slot: r.slot }); return null; } // nothing was inside the volume
    r.rec.finalize(r.tau);
    r.rec.uid = this.tick;
    this.stats.recordingsMade++;
    this.recordings[r.slot] = r.rec;
    this.playbacks[r.slot] = new Playback(r.slot, r.rec);
    this.emit('record-stop', { slot: r.slot, reason, ticks: r.tau, keyframes: r.rec.keyframes });
    return r.rec;
  }
  loadRecording(slot, rec) {
    this.deactivate(slot);
    this.pushUndo(slot);
    this.recordings[slot] = rec;
    this.playbacks[slot] = new Playback(slot, rec);
    this.emit('tape-loaded', { slot });
  }
  eraseRecording(slot) { this.deactivate(slot); this.pushUndo(slot); this.recordings[slot] = null; this.playbacks[slot] = null; }
  /** Overwritten or erased recordings are kept (last four per slot) so experiments can be undone. */
  pushUndo(slot) {
    const r = this.recordings[slot];
    if (r) { const u = (this.undo[slot] ??= []); u.push(r); if (u.length > 4) u.shift(); }
  }
  /** Brings back the previous recording of a slot. Returns it, or null when there is nothing to restore. */
  rollbackRecording(slot) {
    const u = this.undo[slot]; if (!u?.length) return null;
    if (this.recorder?.slot === slot) this.stopRecording('rollback');
    this.deactivate(slot);
    const rec = u.pop();
    this.recordings[slot] = rec; this.playbacks[slot] = new Playback(slot, rec);
    this.emit('rollback', { slot, remaining: u.length });
    return rec;
  }
  deactivate(slot) {
    const pb = this.playbacks[slot]; if (!pb) return;
    pb.active = false; pb.playing = false; pb.items.clear();
    this.rebuildAlive();
  }
  play(slot, { mode, rate } = {}) {
    const pb = this.playbacks[slot]; if (!pb) return false;
    if (mode && this.caps.modes.includes(mode)) pb.mode = mode;
    if (!this.caps.modes.includes(pb.mode)) pb.mode = 'once';
    if (pb.active) { pb.playing = true; if (rate) pb.rate = rate; if (pb.mode === 'hold' && pb.head >= pb.rec.length - 1 && pb.rate > 0) pb.head = 0; }
    else pb.start(rate ?? pb.rate ?? 1);
    this.emit('play', { slot });
    return true;
  }
  /** Start every stored recording on the same tick (so histories stay in the phase they were recorded in). */
  playAll(opts = {}) {
    let n = 0;
    this.recordings.forEach((r, i) => { if (r && this.play(i, opts)) { const pb = this.playbacks[i]; if (pb.active) { pb.head = pb.rate < 0 ? r.length - 1 : 0; pb.playing = true; n++; } } });
    return n;
  }
  pause(slot) { const pb = this.playbacks[slot]; if (pb && pb.active) pb.playing = false; }
  togglePlay(slot) {
    const pb = this.playbacks[slot]; if (!pb) return;
    if (pb.active && pb.playing) this.pause(slot); else this.play(slot);
  }
  stop(slot) { this.deactivate(slot); this.emit('stop', { slot }); }
  reverse(slot) { const pb = this.playbacks[slot]; if (pb) pb.rate = -pb.rate; }
  setRate(slot, r) { const pb = this.playbacks[slot]; if (pb) pb.rate = (pb.rate < 0 ? -1 : 1) * r; }
  cycleMode(slot) {
    const pb = this.playbacks[slot]; if (!pb) return null;
    const modes = PLAYBACK_MODES.filter((m) => this.caps.modes.includes(m));
    pb.mode = modes[(modes.indexOf(pb.mode) + 1) % modes.length];
    return pb.mode;
  }
  scrub(slot, ticks) {
    const pb = this.playbacks[slot]; if (!pb) return;
    if (!pb.active) { pb.active = true; pb.playing = false; pb.coherence = 1; pb.age = 0; pb.head = 0; }
    pb.head = clamp(pb.head + ticks, 0, pb.rec.length - 1);
    pb.playing = false;
  }
  setHead(slot, head) {
    const pb = this.playbacks[slot]; if (!pb) return;
    if (!pb.active) { pb.active = true; pb.coherence = 1; pb.age = 0; }
    pb.head = clamp(head, 0, pb.rec.length - 1); pb.playing = false;
  }

  // ------------------------------------------------------------------ consequence: canon
  /**
   * Enters a recording into the record as true. Its final frame becomes present reality:
   * tracked present entities adopt their recorded state (sliders are pinned there, even if that means
   * pinned shut), history-only matter is built for real, and every id the recording touched stops
   * listening to any echo (rule R9: canon outranks apocrypha). It cannot be undone except by rewinding.
   */
  canonize(slot, source = null) {
    const rec = this.recordings[slot]; if (!rec) return null;
    const tau = rec.length - 1, adopted = [], built = [];
    for (const tr of rec.tracks.values()) {
      const st = new Float64Array(tr.nch);
      if (!tr.sample(tau, st)) continue;
      const kind = tr.def.type;
      if (kind === 'player' || kind === 'actor') continue;
      const P = this.byId.get(tr.id);
      if (P) {
        if (kind === 'slider' || kind === 'descender') this.pins[tr.id] = st[0];
        if (['lever', 'mirror', 'crate', 'crumble'].includes(kind)) P.st.set(st);
        if (kind === 'slider' || kind === 'descender') P.st[0] = st[0];
        this.sealed.add(tr.id); adopted.push(tr.id);
      } else if (kind === 'slider' || kind === 'wall' || kind === 'crumble' || kind === 'descender') {
        const def = JSON.parse(JSON.stringify(tr.def)); delete def.era; delete def.in; delete def.past; def.dyn = true; def.canon = true;
        if (kind === 'slider' || kind === 'descender') def.s0 = st[0];
        const L = this.addEntity(def); L.st.set(st);
        if (kind === 'slider' || kind === 'descender') this.pins[tr.id] = st[0];
        this.sealed.add(tr.id); built.push(tr.id);
      }
    }
    const name = rec.name;
    this.pushUndo(slot); this.deactivate(slot); this.recordings[slot] = null; this.playbacks[slot] = null;
    this.refreshDerived();
    this.emit('canon', { slot, name, adopted, built, source });
    return { adopted, built, name };
  }

  // ------------------------------------------------------------------ recovery: cheap in-memory captures (rewind)
  /** A restorable picture of the whole world. Recordings are immutable so they are shared, not copied. */
  capture() {
    return {
      tick: this.tick, nextDyn: this.nextDyn, caps: { ...this.caps }, checkpoint: this.checkpoint && { ...this.checkpoint },
      ents: new Map(this.items.map((L) => [L.id, Float64Array.from(L.st)])),
      dyn: this.items.filter((L) => L.def.dyn).map((L) => L.def),
      pins: { ...this.pins }, sealed: [...this.sealed],
      recs: [...this.recordings], pbs: this.playbacks.map((p) => (p ? p.toJSON() : null)),
    };
  }
  reinstate(c) {
    this.tick = c.tick; this.nextDyn = c.nextDyn; this.caps = { ...this.caps, ...c.caps }; this.recorder = null;
    for (const L of [...this.items]) if (L.def.dyn) this.removeEntity(L.id);
    for (const d of c.dyn) this.addEntity(d);
    for (const L of this.items) { const a = c.ents.get(L.id); if (a) L.st.set(a); }
    this.pins = { ...c.pins }; this.sealed = new Set(c.sealed); this.checkpoint = c.checkpoint ? { ...c.checkpoint } : this.checkpoint;
    this.recordings = [...c.recs];
    this.playbacks = c.pbs.map((j, i) => {
      if (!j || !this.recordings[i]) return null;
      const pb = new Playback(i, this.recordings[i]);
      Object.assign(pb, { head: j.head, rate: j.rate, mode: j.mode, active: j.active, playing: j.playing, coherence: j.coherence, age: j.age });
      return pb;
    });
    this.refreshDerived();
    this.emit('rewound', { tick: c.tick });
  }

  // ------------------------------------------------------------------ causality
  /** Why is this entity doing what it is doing? Per-history contributions and the inputs feeding it. */
  explain(id) {
    const items = this.aliveList.filter((L) => L.id === id);
    if (!items.length) return null;
    const t = items[0].type, P = this.byId.get(id);
    const layersOf = (iid) => this.aliveList.filter((L) => L.id === iid && L.type.out).map((L) => ({ layer: L.layer, slot: L.layer - 1, value: L.type.out(L.def, L.st) ?? 0, heldBy: L.heldBy ? [...L.heldBy] : undefined }));
    const inputs = (P?.def.in ?? []).map((raw) => {
      const neg = raw[0] === '!', iid = neg ? raw.slice(1) : raw, v = this.R.get(iid) ?? 0;
      return { id: iid, negated: neg, value: v, pass: neg ? !(v > 0.5) : v > 0.5, layers: layersOf(iid) };
    });
    return {
      id, type: t.name, logic: P?.def.logic ?? 'and', reconciled: this.R.get(id) ?? null,
      contributions: t.out ? layersOf(id) : [], inputs,
      overruled: this.overruled.has(id), sealed: this.sealed.has(id), pinned: this.pins[id] ?? null,
      echoDriven: this.echoDriven.has(id),
    };
  }

  // ------------------------------------------------------------------ inspection (feeds the HUD and dev tools)
  /** Ray-pick the nearest entity (present or echo) for inspection. */
  pick(origin, dir, maxT = 40) {
    let best = null, bt = maxT;
    for (const L of this.aliveList) {
      if (L === this.player) continue;
      const boxes = [];
      L.type.colliders?.(L.def, L.st, (s) => boxes.push(s.b));
      if (!boxes.length) { const a = L.type.anchor(L.def, L.st), s = L.type.size(L.def); boxes.push(boxC(a[0], a[1], a[2], Math.max(s[0], .6), Math.max(s[1], .6), Math.max(s[2], .6))); }
      for (const b of boxes) {
        const t = rayBox(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2], b, bt);
        if (t >= 0 && t < bt) { bt = t; best = L; }
      }
    }
    return best ? { item: best, t: bt } : null;
  }
  /** State comparison for one entity id across all histories. */
  compare(id) {
    const P = this.byId.get(id);
    const type = P?.type ?? (() => { for (const L of this.aliveList) if (L.id === id) return L.type; return null; })();
    if (!type) return null;
    const echoes = this.aliveList.filter((L) => L.echo && L.id === id);
    return {
      id, type: type.name, policy: type.policy, rule: P ? ruleName(P) : 'projection (no present counterpart)',
      channels: type.ch.map((name, i) => ({ name, present: P ? P.st[i] : null, echoes: echoes.map((e) => ({ slot: e.layer - 1, value: e.st[i] })) })),
      reconciled: this.R.get(id) ?? null,
    };
  }

  // ------------------------------------------------------------------ persistence & hashing
  hash() {
    const h = new Hasher();
    h.num(this.tick);
    for (const k of Object.keys(this.pins).sort()) { h.str(k); h.num(this.pins[k]); }
    for (const k of [...this.sealed].sort()) h.str(k);
    for (const L of this.items) { h.str(L.id); for (const v of L.st) h.num(v); }
    this.playbacks.forEach((pb, i) => { if (pb) { h.num(i); h.num(pb.head); h.num(pb.active ? 1 : 0); h.num(pb.playing ? 1 : 0); h.num(pb.rate); h.num(pb.coherence); } });
    this.recordings.forEach((r) => { if (r) { h.num(r.length); h.num(r.keyframes); } });
    return h.hex();
  }
  snapshot() {
    return {
      v: 1, tick: this.tick, era: this.era, caps: this.caps, checkpoint: this.checkpoint, nextDyn: this.nextDyn,
      dyn: this.items.filter((L) => L.def.dyn).map((L) => L.def), pins: this.pins, sealed: [...this.sealed],
      ents: Object.fromEntries(this.items.map((L) => [L.id, Array.from(L.st)])),
      recs: this.recordings.map((r) => (r ? r.toJSON() : null)),
      pbs: this.playbacks.map((p) => (p ? p.toJSON() : null)),
    };
  }
  restore(s) {
    this.tick = s.tick; this.nextDyn = s.nextDyn ?? 1; this.pins = { ...(s.pins ?? {}) }; this.sealed = new Set(s.sealed ?? []);
    this.caps = { ...this.caps, ...s.caps };
    this.recorder = null;
    for (const L of [...this.items]) if (L.def.dyn) this.removeEntity(L.id);
    for (const d of s.dyn ?? []) this.addEntity(d);
    for (const L of this.items) { const a = s.ents[L.id]; if (a) L.st.set(a); }
    this.checkpoint = s.checkpoint ?? this.checkpoint;
    this.recordings = s.recs.map((j) => (j ? Recording.fromJSON(j) : null));
    this.playbacks = s.pbs.map((j, i) => {
      if (!j || !this.recordings[i]) return null;
      const pb = new Playback(i, this.recordings[i]);
      Object.assign(pb, { head: j.head, rate: j.rate, mode: j.mode, active: j.active, playing: j.playing, coherence: j.coherence, age: j.age });
      return pb;
    });
    this.refreshDerived();
  }
}

function ruleName(P) {
  const d = P.def;
  if (P.type.name === 'slider') return (d.mode ?? 'door') === 'door' ? 'aperture: open in any history ⇒ open' : 'matter: exists in any history ⇒ exists';
  if (P.type.policy === 'sum') return 'superposition: histories add';
  return 'signal: powered in any history ⇒ powered';
}

export { TYPES, DOOR_OPEN_THRESHOLD, PLAYER_SIZE, EYE_HEIGHT };
