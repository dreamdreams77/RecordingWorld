// src/recording.js
// Recording, playback, and reality reconciliation.
//
// A Recording stores one Track per tracked entity. Body tracks store
// [x, y, vx, vy] per frame. Fixture tracks store their state per frame:
//   door: [open], plate: [pressed], lamp: [on], sensor: [pressed], emitter: [running, x, y]
//
// Playback replays a recording as "echoes" that live inside the current world
// and reconciles recorded memory against present reality. The rules are
// documented in docs/ARCHITECTURE.md and enforced here:
//
//   R1 ECHO      Recorded bodies become echo bodies. They are driven by a spring
//                toward their recorded path, so they are physical: they collide,
//                push live bodies, and press plates. If the live world blocks the
//                path, the echo deviates and a "contradiction" is logged.
//   R2 MEMORY    Recorded fixture transitions (door opened/closed, machine started)
//                are written into the live world at the recorded frame.
//   R3 PRESENCE  A memory write to a door is deferred while any body occupies
//                the door. The write stays pending and is applied as soon as the
//                door is clear. The conflict is logged as "presence".
//   R4 PLACE     An emitter's echoes keep their recorded timing and path, but are
//                shifted by how far the live emitter has moved from where it was
//                recorded. Location comes from the present, the path from memory.
//   R5 LIGHT     A recorded lamp that was lit produces an echo light at its
//                recorded location, whether or not the live lamp still exists.
//                Sensors are pressed by live and echo light alike.
//   R6 PRESENT   Live fixtures are never overwritten except through R2. Plates and
//                lamps are derived from presence and are never written by memory.

import { LAMP_RADIUS, removeBody, spawnBall } from './sim.js';

export const ECHO_STIFFNESS = 600;
export const ECHO_DAMPING = 30;
// The spring is stiff near its target, and explicit integration cannot take a
// stiff spring over a thin wall in one tick. Capping the spring's acceleration
// means an echo cannot be launched through geometry by its own memory.
export const ECHO_MAX_ACCEL = 2400;
export const CONTRADICTION_DISTANCE = 40;
export const CONTRADICTION_COOLDOWN = 30;
export const TRAIL_LENGTH = 24;
// R7: how long an echo may stray from its memory before it loses coherence,
// and how long it takes to regain coherence once back on its path.
export const DISCORD_BUILD_TICKS = 60;
export const DISCORD_DECAY_TICKS = 120;

function inRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function centreInRect(obj, r) {
  return inRect(obj.x + (obj.w || 0) / 2, obj.y + (obj.h || 0) / 2, r);
}

// ---------- tracks ----------

export class Track {
  constructor(kind, key, stride, start, ref, meta) {
    this.kind = kind;          // 'body' | 'door' | 'plate' | 'lamp' | 'sensor' | 'emitter'
    this.key = key;
    this.stride = stride;
    this.start = start;        // recording frame of the first sample
    this.n = 0;                // number of samples
    this.data = new Float32Array(stride * 256);
    this.ref = ref;            // live object for fixtures, body for body tracks
    this.meta = meta;          // { r, source } for bodies, { x, y } for lamps
    this.lastSeen = -1;
  }

  push(a, b = 0, c = 0, d = 0) {
    const need = (this.n + 1) * this.stride;
    if (need > this.data.length) {
      const grown = new Float32Array(Math.max(need, this.data.length * 2));
      grown.set(this.data);
      this.data = grown;
    }
    const o = this.n * this.stride;
    const dd = this.data;
    dd[o] = a;
    if (this.stride > 1) dd[o + 1] = b;
    if (this.stride > 2) dd[o + 2] = c;
    if (this.stride > 3) dd[o + 3] = d;
    this.n++;
  }

  at(i, k) {
    return this.data[i * this.stride + k];
  }
}

// ---------- recorder ----------

export class Recorder {
  constructor(world, region, name) {
    this.name = name;
    this.region = { x: region.x, y: region.y, w: region.w, h: region.h };
    this.frames = 0;
    this.tracks = [];
    this.byKey = new Map();
    this.activeBodies = new Map();   // body id -> open track
    this.fixtureTracks = [];

    for (const d of world.doors) {
      if (centreInRect(d, this.region)) this.addFixture(d, 'door', 1, { x: d.x, y: d.y });
    }
    for (const p of world.plates) {
      if (centreInRect(p, this.region)) this.addFixture(p, 'plate', 1, { x: p.x, y: p.y });
    }
    for (const l of world.lamps) {
      if (inRect(l.x, l.y, this.region)) this.addFixture(l, 'lamp', 1, { x: l.x, y: l.y });
    }
    for (const s of world.sensors) {
      if (centreInRect(s, this.region)) this.addFixture(s, 'sensor', 1, { x: s.x, y: s.y });
    }
    for (const e of world.emitters) {
      if (inRect(e.x, e.y, this.region)) this.addFixture(e, 'emitter', 3, { x: e.x, y: e.y });
    }
  }

  addFixture(obj, kind, stride, meta) {
    const key = `${kind}:${obj.id}`;
    const t = new Track(kind, key, stride, 0, obj, meta);
    this.tracks.push(t);
    this.byKey.set(key, t);
    this.fixtureTracks.push(t);
    return t;
  }

  // Called exactly once per simulation tick, after step().
  sample(world) {
    const f = this.frames;
    const R = this.region;

    for (const b of world.bodies) {
      if (b.echo) continue; // echoes are replays; they are never re-recorded
      if (!inRect(b.x, b.y, R) || !b.alive) continue;
      let t = this.activeBodies.get(b.id);
      if (!t) {
        t = new Track('body', `body:${b.id}`, 4, f, b, { r: b.r, source: b.source });
        this.activeBodies.set(b.id, t);
        this.tracks.push(t);
      }
      t.push(b.x, b.y, b.vx, b.vy);
      t.lastSeen = f;
    }
    for (const [id, t] of this.activeBodies) {
      if (t.lastSeen !== f) this.activeBodies.delete(id);
    }

    for (const t of this.fixtureTracks) {
      const o = t.ref;
      switch (t.kind) {
        case 'door': t.push(o.open ? 1 : 0); break;
        case 'plate': t.push(o.pressed ? 1 : 0); break;
        case 'lamp': t.push(o.on ? 1 : 0); break;
        case 'sensor': t.push(o.pressed ? 1 : 0); break;
        case 'emitter': t.push(o.running ? 1 : 0, o.x, o.y); break;
      }
    }

    this.frames++;
  }

  finish() {
    return {
      name: this.name,
      region: this.region,
      length: this.frames,
      tracks: this.tracks,
      byKey: this.byKey,
    };
  }
}

// ---------- playback ----------

export class Playback {
  constructor(world, recording) {
    this.world = world;
    this.rec = recording;
    this.t = 0;
    this.echoes = [];                 // { body, tr, offX, offY, trail, head, lastLog }
    this.echoByTrack = new Map();
    this.pending = new Map();         // fixture track -> desired boolean (R2/R3)
    this.blockedLogged = new Map();   // fixture track -> last tick a presence block was logged
    this.refs = new Map();            // fixture track -> live object in THIS world
    this.done = false;
    this.bindFixtures(world, recording);
  }

  // Tracks remember the ids of the fixtures they recorded. Ids are stable across a
  // level rebuild, so playback binds each fixture track to the object with the same
  // id in its own world. Binding to the recording-time object would write memory into
  // a world that no longer exists after a reset.
  bindFixtures(world, rec) {
    for (const tr of rec.tracks) {
      if (tr.kind === 'door' || tr.kind === 'emitter') {
        const list = tr.kind === 'door' ? world.doors : world.emitters;
        const obj = list.find((o) => o.id === tr.ref.id);
        if (obj) this.refs.set(tr, obj);
      }
    }
  }

  beginTick() {
    const w = this.world;
    const t = this.t;
    for (const tr of this.rec.tracks) {
      switch (tr.kind) {
        case 'body': this.beginBody(w, tr, t); break;
        case 'door': this.beginFixtureWrite(w, tr, t, true); break;
        case 'emitter': this.beginFixtureWrite(w, tr, t, false); break;
        case 'lamp': this.beginLamp(w, tr, t); break;
        default: break;
      }
    }
  }

  // Emitter-sourced echoes get their offset from how far the live emitter has moved (R4).
  placementOffset(w, tr, t) {
    if (!tr.meta.source) return { x: 0, y: 0 };
    const emTrack = this.rec.byKey.get(`emitter:${tr.meta.source}`);
    const live = w.emitters.find((e) => e.id === tr.meta.source);
    if (!emTrack || !live || t >= emTrack.n) return { x: 0, y: 0 };
    return { x: live.x - emTrack.at(t, 1), y: live.y - emTrack.at(t, 2) };
  }

  beginBody(w, tr, t) {
    const li = t - tr.start;
    if (li < 0) return;

    if (li === 0) {
      const off = this.placementOffset(w, tr, t);
      const body = spawnBall(w, tr.data[0] + off.x, tr.data[1] + off.y, tr.data[2], tr.data[3], 0);
      body.echo = true;
      body.r = tr.meta.r;
      const echo = {
        body, tr, offX: off.x, offY: off.y,
        trail: new Float32Array(TRAIL_LENGTH * 2), head: 0, count: 0, lastLog: -Infinity,
        discord: 0,
      };
      this.echoes.push(echo);
      this.echoByTrack.set(tr, echo);
    }

    const echo = this.echoByTrack.get(tr);
    if (!echo) return;
    const body = echo.body;

    if (li < tr.n) {
      const tx = tr.at(li, 0) + echo.offX;
      const ty = tr.at(li, 1) + echo.offY;
      let ax = ECHO_STIFFNESS * (tx - body.x) - ECHO_DAMPING * body.vx;
      let ay = ECHO_STIFFNESS * (ty - body.y) - ECHO_DAMPING * body.vy;
      const mag = Math.hypot(ax, ay);
      if (mag > ECHO_MAX_ACCEL) { ax *= ECHO_MAX_ACCEL / mag; ay *= ECHO_MAX_ACCEL / mag; }
      body.ax = ax;
      body.ay = ay;

      // Trail for presentation: a ring buffer, no allocation per tick.
      echo.trail[echo.head * 2] = body.x;
      echo.trail[echo.head * 2 + 1] = body.y;
      echo.head = (echo.head + 1) % TRAIL_LENGTH;
      if (echo.count < TRAIL_LENGTH) echo.count++;

      const dev = Math.hypot(body.x - tx, body.y - ty);
      // R7: discord builds while the echo is off its memory and decays while it is on it.
      // Ghost status has hysteresis: it starts at full discord and clears only at zero.
      if (dev > CONTRADICTION_DISTANCE) echo.discord = Math.min(1, echo.discord + 1 / DISCORD_BUILD_TICKS);
      else echo.discord = Math.max(0, echo.discord - 1 / DISCORD_DECAY_TICKS);
      if (echo.discord >= 1 && !body.ghost) {
        body.ghost = true;
        w.conflicts.push({ type: 'ghost', x: body.x, y: body.y, tick: t, key: tr.key });
      } else if (echo.discord <= 0) {
        body.ghost = false;
      }
      if (dev > CONTRADICTION_DISTANCE && t - echo.lastLog >= CONTRADICTION_COOLDOWN) {
        echo.lastLog = t;
        w.conflicts.push({ type: 'contradiction', x: body.x, y: body.y, tick: t, key: tr.key });
      }
    } else if (li === tr.n) {
      removeBody(w, body);
    }
  }

  // R2 + R3 for doors (presence applies) and emitters (no presence check).
  beginFixtureWrite(w, tr, t, presenceMatters) {
    if (t >= tr.n) return;
    const cur = tr.at(t, 0);
    if (t === 0 || cur !== tr.at(t - 1, 0)) this.pending.set(tr, cur > 0.5);

    const want = this.pending.get(tr);
    if (want === undefined) return;
    const obj = this.refs.get(tr);
    if (!obj) return;
    const live = presenceMatters ? obj.open : obj.running;
    if (live === want) { this.pending.delete(tr); return; }

    if (presenceMatters) {
      const area = { x: obj.x, y: obj.y, w: obj.w, h: obj.h };
      if (occupiedBy(w, area)) {
        const last = this.blockedLogged.get(tr);
        if (last === undefined || t - last >= CONTRADICTION_COOLDOWN) {
          this.blockedLogged.set(tr, t);
          w.conflicts.push({ type: 'presence', x: obj.x + obj.w / 2, y: obj.y + obj.h / 2, tick: t, key: tr.key });
        }
        return; // R3: stays pending
      }
      obj.open = want;
    } else {
      obj.running = want;
    }
    this.pending.delete(tr);
    const cx = presenceMatters ? obj.x + obj.w / 2 : obj.x;
    const cy = presenceMatters ? obj.y + obj.h / 2 : obj.y;
    w.conflicts.push({ type: 'memory', x: cx, y: cy, tick: t, key: tr.key });
  }

  // R5: recorded lit lamps produce echo light.
  beginLamp(w, tr, t) {
    if (t >= tr.n) return;
    if (tr.at(t, 0) > 0.5) {
      w.echoLights.push({ x: tr.meta.x, y: tr.meta.y, r: LAMP_RADIUS, key: tr.key });
    }
  }

  endTick() {
    this.t++;
    if (this.t >= this.rec.length) this.finish();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    for (const e of this.echoes) {
      if (e.body.alive) removeBody(this.world, e.body);
    }
    this.echoes.length = 0;
    this.echoByTrack.clear();
    this.pending.clear();
  }
}

function occupiedBy(w, area) {
  for (const b of w.bodies) {
    const cx = Math.max(area.x, Math.min(b.x, area.x + area.w));
    const cy = Math.max(area.y, Math.min(b.y, area.y + area.h));
    const dx = b.x - cx, dy = b.y - cy;
    // Touching counts as standing in the way, hence the small margin.
    const reach = b.r + 2;
    if (dx * dx + dy * dy < reach * reach) return true;
  }
  return false;
}

export class Playbacks {
  constructor() {
    this.list = [];
  }

  start(world, recording) {
    const p = new Playback(world, recording);
    this.list.push(p);
    return p;
  }

  beginTick() {
    for (const p of this.list) p.beginTick();
  }

  endTick() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.endTick();
      if (p.done) this.list.splice(i, 1);
    }
  }

  clear() {
    for (const p of this.list) p.finish();
    this.list.length = 0;
  }

  get activeCount() {
    return this.list.length;
  }
}
