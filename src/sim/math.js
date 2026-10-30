// Small, allocation-light geometry helpers shared by every simulation module.
// All simulation code is deterministic: no Math.random, no Date, no DOM.

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const EPS = 1e-6;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** Axis-aligned box from a centre and full size. */
export function boxC(cx, cy, cz, sx, sy, sz) {
  return { x0: cx - sx / 2, y0: cy - sy / 2, z0: cz - sz / 2, x1: cx + sx / 2, y1: cy + sy / 2, z1: cz + sz / 2 };
}
export function boxMinMax(a, b) {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), z0: Math.min(a[2], b[2]),
           x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]), z1: Math.max(a[2], b[2]) };
}
export const overlaps = (a, b) =>
  a.x0 < b.x1 - EPS && a.x1 > b.x0 + EPS && a.y0 < b.y1 - EPS && a.y1 > b.y0 + EPS && a.z0 < b.z1 - EPS && a.z1 > b.z0 + EPS;

export function overlapVolume(a, b) {
  const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const dy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return dx > 0 && dy > 0 && dz > 0 ? dx * dy * dz : 0;
}
export function intersection(a, b) {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), z0: Math.max(a.z0, b.z0),
           x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), z1: Math.min(a.z1, b.z1) };
}
export const containsPoint = (b, x, y, z) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1;
export const boxCenter = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
export const boxSize = (b) => [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0];
export const cloneBox = (b) => ({ x0: b.x0, y0: b.y0, z0: b.z0, x1: b.x1, y1: b.y1, z1: b.z1 });

/**
 * Ray/box slab test. Returns entry distance t in [0, maxT] or -1.
 * Direction need not be normalised; t is in units of the direction vector.
 */
export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT = Infinity) {
  let tmin = 0, tmax = maxT;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
    } else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

/** Does the segment a→b pass through the box? */
export function segHitsBox(ax, ay, az, bx, by, bz, box) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  return rayBox(ax, ay, az, dx, dy, dz, box, 1) >= 0;
}

/** FNV-1a over a stream of numbers; used for the world state hash. */
export class Hasher {
  constructor() { this.h = 0x811c9dc5; this.buf = new DataView(new ArrayBuffer(8)); }
  num(v) {
    this.buf.setFloat32(0, Math.fround(v));
    const u = this.buf.getUint32(0);
    for (let s = 0; s < 32; s += 8) { this.h ^= (u >>> s) & 255; this.h = Math.imul(this.h, 0x01000193) >>> 0; }
  }
  str(s) { for (let i = 0; i < s.length; i++) { this.h ^= s.charCodeAt(i); this.h = Math.imul(this.h, 0x01000193) >>> 0; } }
  hex() { return this.h.toString(16).padStart(8, '0'); }
}
