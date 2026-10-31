// Reachability on the real collision geometry: where can a player who has recorded NOTHING get to from a given spot?
// A navmesh-style search over (cell, standing height) nodes: walking (step-up 0.62 m), jumping (up to `jump` m), and falling.
// Conservative in the player's favour (diagonals, headroom during jumps are approximated), so anything it reaches is a
// *candidate* shortcut to be examined, and anything it does not reach is genuinely unreachable by walking and jumping.
import { World } from '../../src/sim/world.js';

const HALF = 0.3, H = 1.8, STEP = 0.62, CELL = 0.5, EPS = 0.02;
export function reachable(level, from, goalBox, { jump = 1.1, bounds, solidsFilter = () => true, maxNodes = 400000 } = {}) {
  const w = new World(level); w.refreshDerived();
  const solids = w.solids.filter((s) => s.block && s.layer === 0 && solidsFilter(s));
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
  const clear = (x, y, z) => { const bb = { x0: x - HALF + EPS, x1: x + HALF - EPS, y0: y + EPS, y1: y + H - EPS, z0: z - HALF + EPS, z1: z + HALF - EPS }; for (const s of solids) if (overlap(bb, s.b)) return false; return true; };
  // Lethal hazards gate by lethality, not by geometry. One too wide to jump (a laser floor) blocks everywhere it can reach in
  // any state; a narrow one (a low sweeper) can be jumped and is left passable.
  const lethal = level.entities.filter((e) => e.hazard && e.type === 'slider' && Math.min(e.size[0], e.size[2]) >= 3).map((e) => { const a = e.pos, b = e.to ?? e.pos; return { x0: Math.min(a[0] - e.size[0] / 2, b[0] - e.size[0] / 2), x1: Math.max(a[0] + e.size[0] / 2, b[0] + e.size[0] / 2), z0: Math.min(a[2] - e.size[2] / 2, b[2] - e.size[2] / 2), z1: Math.max(a[2] + e.size[2] / 2, b[2] + e.size[2] / 2) }; });
  const deadly = (x, z) => lethal.some((h) => x + HALF > h.x0 && x - HALF < h.x1 && z + HALF > h.z0 && z - HALF < h.z1);
  const cache = new Map();
  const standables = (ix, iz) => {
    const k = ix * 100003 + iz; let r = cache.get(k); if (r) return r;
    const x = ix * CELL, z = iz * CELL, foot = { x0: x - HALF, x1: x + HALF, z0: z - HALF, z1: z + HALF }, ys = [];
    for (const s of solids) if (s.b.x0 < foot.x1 && s.b.x1 > foot.x0 && s.b.z0 < foot.z1 && s.b.z1 > foot.z0) {
      const y = s.b.y1; if (y < -2 || ys.some((v) => Math.abs(v - y) < 0.03) || deadly(x, z)) continue; if (clear(x, y, z)) ys.push(y);
    }
    ys.sort((a, b) => a - b); cache.set(k, ys); return ys;
  };
  const b = bounds ?? { x0: -60, x1: 60, z0: -260, z1: 40 };
  const ix0 = Math.floor(b.x0 / CELL), ix1 = Math.ceil(b.x1 / CELL), iz0 = Math.floor(b.z0 / CELL), iz1 = Math.ceil(b.z1 / CELL);
  const sx = Math.round(from[0] / CELL), sz = Math.round(from[2] / CELL), st = standables(sx, sz).reduce((a, y) => (Math.abs(y - from[1]) < Math.abs(a - from[1]) ? y : a), Infinity);
  if (!Number.isFinite(st)) return { reached: false, nodes: 0, note: 'no standable start' };
  const seen = new Set(), parent = new Map(), q = [[sx, sz, st]], key = (x, z, y) => `${x},${z},${y.toFixed(2)}`; seen.add(key(sx, sz, st));
  const inGoal = (x, y, z) => x * CELL >= goalBox[0] && x * CELL <= goalBox[3] && y + 0.9 >= goalBox[1] && y + 0.9 <= goalBox[4] && z * CELL >= goalBox[2] && z * CELL <= goalBox[5];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let nodes = 0;
  while (q.length && nodes < maxNodes) {
    const [x, z, y] = q.pop(); nodes++;
    if (inGoal(x, y, z)) { const path = []; let k = key(x, z, y); while (k) { path.push(k); k = parent.get(k); } return { reached: true, nodes, at: [x * CELL, y, z * CELL], path: path.reverse() }; }
    for (const [dx, dz] of dirs) {
      const nx = x + dx, nz = z + dz; if (nx < ix0 || nx > ix1 || nz < iz0 || nz > iz1) continue;
      if (dx && dz && !(clear(x * CELL + dx * CELL, y, z * CELL) && clear(x * CELL, y, z * CELL + dz * CELL))) continue; // no cutting corners
      const cands = standables(nx, nz), wx = nx * CELL, wz = nz * CELL; let fall = -Infinity;
      for (const y2 of cands) {
        let ok = false;
        if (y2 >= y - 0.03 && y2 <= y + STEP) ok = clear(wx, Math.max(y, y2), wz);                                  // walk / step up
        else if (y2 > y + STEP && y2 <= y + jump) ok = clear(wx, y2, wz) && clear(x * CELL, y2, z * CELL);          // jump up (headroom above the start)
        else if (y2 < y - 0.03) fall = Math.max(fall, y2);                                                         // candidate to fall onto
        if (ok) { const k = key(nx, nz, y2); if (!seen.has(k)) { seen.add(k); parent.set(k, key(x, z, y)); q.push([nx, nz, y2]); } }
      }
      if (Number.isFinite(fall) && clear(wx, y, wz)) { const k = key(nx, nz, fall); if (!seen.has(k)) { seen.add(k); parent.set(k, key(x, z, y)); q.push([nx, nz, fall]); } } // step off an edge
    }
  }
  return { reached: false, nodes };
}
