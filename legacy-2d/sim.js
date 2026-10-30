// src/sim.js
// Deterministic fixed-step 2D simulation core.
//
// Determinism rules (see docs/ARCHITECTURE.md):
//   * fixed timestep DT, advanced only by step()
//   * no Math.random, no wall-clock time, no iteration over unordered collections
//   * identical initial state + identical sequence of calls => identical state

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const GRAVITY = 900;
export const WORLD_W = 960;
export const WORLD_H = 540;
export const FLOOR_Y = 500;
export const BALL_RADIUS = 12;
export const EMITTER_PERIOD = 80;   // ticks between emissions while running
export const LAMP_RADIUS = 170;

const RESTITUTION = 0.3;
const BOUNCE_MIN_SPEED = 60;        // below this normal speed, contacts are inelastic (kills jitter)
const GROUND_DRAG = 0.12;           // fraction of tangential speed lost per second while in contact
const IMPACT_MIN_SPEED = 140;       // impacts above this are reported to the presentation layer
const BELT_GRIP = 0.15;             // how quickly a body on a belt converges to belt speed per tick

export function createWorld() {
  return {
    tick: 0,
    nextId: 1,
    bodies: [],     // dynamic circles (balls). Echo bodies are included here.
    walls: [],      // static solid rectangles
    doors: [],      // solid while closed
    plates: [],     // pressure plates: derived `pressed`, latch their links on rising edge
    lamps: [],      // light sources, `on` derived from their plate
    sensors: [],    // light-sensitive plates, pressed when lit by any light source
    emitters: [],   // machines that spawn balls while `running`
    belts: [],      // floor segments that drive bodies resting on them
    echoLights: [], // rebuilt every tick by the playback layer (recorded lamps)
    impacts: [],    // transient, drained by presentation
    conflicts: [],  // transient reconciliation log, rebuilt every tick by playback
  };
}

// ---------- construction helpers ----------

export function addWall(w, x, y, width, height) {
  const s = { id: w.nextId++, x, y, w: width, h: height };
  w.walls.push(s);
  return s;
}

export function addDoor(w, name, x, y, width, height) {
  const d = { id: w.nextId++, name, x, y, w: width, h: height, open: false };
  w.doors.push(d);
  return d;
}

// links: [{ type: 'door' | 'emitter', name }] latched on the rising edge of a press.
export function addPlate(w, name, x, y, width, height, links = []) {
  const p = {
    id: w.nextId++, name, x, y, w: width, h: height, links,
    pressed: false, liveHits: 0, echoHits: 0,
  };
  w.plates.push(p);
  return p;
}

// Lamp is lit exactly while its plate is pressed.
export function addLamp(w, name, x, y, plateName) {
  const plate = w.plates.find((p) => p.name === plateName) || null;
  const l = { id: w.nextId++, name, x, y, plate, on: false };
  w.lamps.push(l);
  return l;
}

export function addSensor(w, name, x, y, width, height) {
  const s = { id: w.nextId++, name, x, y, w: width, h: height, pressed: false, litByLive: false, litByEcho: false };
  w.sensors.push(s);
  return s;
}

export function addEmitter(w, name, x, y, railMin, railMax) {
  const e = { id: w.nextId++, name, x, y, railMin, railMax, running: false, phase: 0 };
  w.emitters.push(e);
  return e;
}

export function addBelt(w, x, width, speed) {
  const b = { id: w.nextId++, x, y: FLOOR_Y, w: width, speed };
  w.belts.push(b);
  return b;
}

export function spawnBall(w, x, y, vx = 0, vy = 0, source = 0) {
  const b = {
    id: w.nextId++, x, y, vx, vy, r: BALL_RADIUS,
    echo: false,        // true for bodies created by playback
    ghost: false,       // R7: an echo that has lost coherence with its memory
    ax: 0, ay: 0,       // extra acceleration applied on the next step (echo springs)
    source,             // id of the emitter that produced this body, or 0
    alive: true,
  };
  w.bodies.push(b);
  return b;
}

export function removeBody(w, b) {
  b.alive = false;
  const i = w.bodies.indexOf(b);
  if (i >= 0) w.bodies.splice(i, 1);
}

// ---------- geometry ----------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// True if the body's circle overlaps the rectangle (inclusive of touching).
export function bodyTouchesRect(b, r) {
  const cx = clamp(b.x, r.x, r.x + r.w);
  const cy = clamp(b.y, r.y, r.y + r.h);
  const dx = b.x - cx, dy = b.y - cy;
  return dx * dx + dy * dy < b.r * b.r;
}

function lightCoversRect(l, r, radius) {
  const cx = clamp(l.x, r.x, r.x + r.w);
  const cy = clamp(l.y, r.y, r.y + r.h);
  const dx = cx - l.x, dy = cy - l.y;
  return dx * dx + dy * dy < radius * radius;
}

// Circle vs axis-aligned rectangle. Resolves penetration, reflects the normal
// component (with restitution only for real impacts), and bleeds tangential speed.
function resolveRect(w, b, r) {
  const cx = clamp(b.x, r.x, r.x + r.w);
  const cy = clamp(b.y, r.y, r.y + r.h);
  let nx = b.x - cx, ny = b.y - cy;
  const d2 = nx * nx + ny * ny;
  let pen;
  if (d2 > 1e-9) {
    if (d2 >= b.r * b.r) return;
    const d = Math.sqrt(d2);
    nx /= d; ny /= d;
    pen = b.r - d;
  } else {
    // Centre inside the rectangle: push out along the shortest axis.
    let m = b.x - r.x; nx = -1; ny = 0;
    const dr = r.x + r.w - b.x; if (dr < m) { m = dr; nx = 1; ny = 0; }
    const dt = b.y - r.y;       if (dt < m) { m = dt; nx = 0; ny = -1; }
    const db = r.y + r.h - b.y; if (db < m) { m = db; nx = 0; ny = 1; }
    pen = m + b.r;
  }
  b.x += nx * pen;
  b.y += ny * pen;

  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    const speed = -vn;
    let e = 0;
    if (speed > BOUNCE_MIN_SPEED) e = RESTITUTION;
    if (speed > IMPACT_MIN_SPEED) w.impacts.push({ x: b.x, y: b.y, speed, echo: b.echo });
    const jn = -(1 + e) * vn;
    b.vx += jn * nx;
    b.vy += jn * ny;
  }

  // Ground drag on the tangential component (only while touching).
  const tx = -ny, ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const keep = Math.max(0, 1 - GROUND_DRAG * DT);
  const lost = vt * (1 - keep);
  b.vx -= lost * tx;
  b.vy -= lost * ty;
}

function collideBodies(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  let nx = 1, ny = 0, d = 0;
  if (d2 > 1e-9) { d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
  const pen = (min - d) / 2;
  a.x -= nx * pen; a.y -= ny * pen;
  b.x += nx * pen; b.y += ny * pen;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -(1 + RESTITUTION) * rv / 2; // equal masses
    a.vx -= j * nx; a.vy -= j * ny;
    b.vx += j * nx; b.vy += j * ny;
  }
}

// A 32-bit FNV-1a hash of the simulation state, with floats quantized to 1/1000.
// Two runs that are deterministic produce the same sequence of hashes.
export function hashWorld(w) {
  let h = 0x811c9dc5;
  const mix = (v) => {
    const q = Math.round(v * 1000) | 0;
    h ^= q & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (q >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (q >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (q >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  };
  const flag = (b) => mix(b ? 1 : 0);
  mix(w.tick);
  for (const b of w.bodies) { mix(b.x); mix(b.y); mix(b.vx); mix(b.vy); flag(b.echo); flag(b.ghost); }
  for (const d of w.doors) flag(d.open);
  for (const p of w.plates) flag(p.pressed);
  for (const e of w.emitters) { flag(e.running); mix(e.phase); mix(e.x); }
  for (const l of w.lamps) flag(l.on);
  for (const s of w.sensors) flag(s.pressed);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function onBelt(b, belt) {
  return Math.abs(b.y + b.r - belt.y) < 2.5 && b.x >= belt.x && b.x <= belt.x + belt.w;
}

// ---------- fixtures ----------

function updatePlates(w) {
  for (const p of w.plates) {
    let live = 0, echo = 0;
    for (const b of w.bodies) {
      if (!bodyTouchesRect(b, p)) continue;
      if (!b.echo) live++;
      else if (!b.ghost) echo++; // R7: a ghost echo has lost coherence and cannot press
    }
    p.liveHits = live;
    p.echoHits = echo;
    const pressed = live + echo > 0;
    if (pressed && !p.pressed) {
      // Rising edge only: latching is an event, not a level.
      for (const link of p.links) latch(w, link);
    }
    p.pressed = pressed;
  }
}

function latch(w, link) {
  if (link.type === 'door') {
    for (const d of w.doors) if (d.name === link.name) d.open = true;
  } else if (link.type === 'emitter') {
    for (const e of w.emitters) if (e.name === link.name) e.running = true;
  }
}

function updateEmitters(w) {
  for (const e of w.emitters) {
    if (!e.running) continue;
    e.phase++;
    if (e.phase >= EMITTER_PERIOD) {
      e.phase = 0;
      spawnBall(w, e.x, e.y + 26, 0, 40, e.id);
    }
  }
}

function updateLightsAndSensors(w) {
  for (const l of w.lamps) l.on = !!(l.plate && l.plate.pressed);
  for (const s of w.sensors) {
    let live = false, echo = false;
    for (const l of w.lamps) if (l.on && lightCoversRect(l, s, LAMP_RADIUS)) { live = true; break; }
    for (const l of w.echoLights) if (lightCoversRect(l, s, l.r)) { echo = true; break; }
    s.litByLive = live;
    s.litByEcho = echo;
    s.pressed = live || echo;
  }
}

// ---------- the step ----------

// Advances the world by exactly one tick.
//
// Body–body collision is all-pairs. A uniform-grid broad phase was tried and measured
// (see docs/ARCHITECTURE.md, "Performance"): it was slower than all-pairs for every body
// count measured, from 120 to 1000, so it was removed rather than kept as dead code.
export function step(w) {
  w.impacts.length = 0;

  updateEmitters(w);

  const bodies = w.bodies;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += b.ax * DT;
    b.vy += (GRAVITY + b.ay) * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.ax = 0;
    b.ay = 0;
  }

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    for (const s of w.walls) resolveRect(w, b, s);
    for (const d of w.doors) if (!d.open) resolveRect(w, b, d);
    for (const belt of w.belts) {
      if (onBelt(b, belt)) b.vx += (belt.speed - b.vx) * BELT_GRIP;
    }
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) collideBodies(bodies[i], bodies[j]);
  }

  updatePlates(w);
  updateLightsAndSensors(w);
  w.tick++;
}
