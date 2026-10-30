// Fields: light and sound propagate through the RECONCILED geometry — the union of every history's
// solids — and are produced by every history's emitters. This is how recorded light and recorded
// sound meet the present-day environment.

import { rayBox, segHitsBox, containsPoint } from './math.js';

export const BEAM_DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // +x, -z, -x, +z
const MAX_BOUNCES = 12, MAX_LEN = 90;

// '/' (rot 0): (dx,dz) -> (dz,dx);  '\' (rot 1): (dx,dz) -> (-dz,-dx)
function reflect(dx, dz, rot) { return rot ? [-dz, -dx] : [dz, dx]; }

const HUE_NAMES = ['white', 'red', 'green', 'blue'];
export { HUE_NAMES };
const MAX_SEGMENTS = 64;

/**
 * Traces every beam (from every history's projectors) through the reconciled geometry.
 * Optics: mirrors reflect; a prism splits left/right (a white beam disperses into red/green/blue);
 * a filter turns white into its colour, passes its own colour and stops the others.
 */
export function traceBeams(w) {
  w.beams.length = 0;
  w.litSensors.clear();
  const blockers = [], mirrors = [], prisms = [], filters = [];
  for (const s of w.solids) {
    if (s.mirror) mirrors.push(s);
    else if (s.prism) prisms.push(s);
    else if (s.filter) filters.push(s);
    else if ((s.block || s.hazard) && s.beam) blockers.push(s);
  }
  const sensors = [];
  for (const L of w.items) if (L.def.type === 'sensor') sensors.push({ id: L.id, hue: L.def.hue ?? 0, b: sensorBox(L) });

  const rays = [];
  for (const L of w.allAlive()) {
    if (L.def.type !== 'beam' || L.st[0] < 0.5) continue;
    const [dx, dz] = BEAM_DIRS[(L.def.dir ?? 0) & 3];
    rays.push({ layer: L.layer, id: L.id, y: L.def.pos[1], o: [L.def.pos[0], L.def.pos[2]], d: [dx, dz], hue: L.def.hue ?? 0, skip: null });
  }
  let segs = 0;
  while (rays.length && segs < MAX_SEGMENTS) {
    const r = rays.pop();
    let [ox, oz] = r.o, [dx, dz] = r.d, remaining = MAX_LEN, skip = r.skip;
    const y = r.y, pts = [[ox, y, oz]];
    for (let bounce = 0; bounce < MAX_BOUNCES && segs < MAX_SEGMENTS; bounce++) {
      segs++;
      let tb = remaining, hit = null, ht = Infinity;
      for (const s of blockers) { const t = rayBox(ox, y, oz, dx, 0, dz, s.b, tb); if (t >= 0 && t < tb && t > 0.02) tb = t; }
      const consider = (list, kind) => {
        for (const m of list) {
          if (skip && m.id === skip) continue;
          const t = rayBox(ox, y, oz, dx, 0, dz, m.b, tb);
          if (t >= 0 && t <= tb && t < ht) { ht = t; hit = { kind, m }; }
        }
      };
      consider(mirrors, 'mirror'); consider(prisms, 'prism'); consider(filters, 'filter');
      const reach = hit ? Math.min(ht, tb) : tb;
      for (const se of sensors) {
        const t = rayBox(ox, y, oz, dx, 0, dz, se.b, reach);
        if (t >= 0 && t <= reach && (se.hue === 0 || se.hue === r.hue)) w.litSensors.add(se.id);
      }
      if (!hit || ht > tb) { pts.push([ox + dx * tb, y, oz + dz * tb]); break; }
      const m = hit.m, cx = (m.b.x0 + m.b.x1) / 2, cz = (m.b.z0 + m.b.z1) / 2;
      remaining -= ht;
      if (hit.kind === 'mirror') {
        pts.push([cx, y, cz]);
        [dx, dz] = reflect(dx, dz, m.rot); ox = cx; oz = cz; skip = m.id;
      } else if (hit.kind === 'prism') {
        pts.push([cx, y, cz]);
        const left = [-dz, dx], right = [dz, -dx];
        const kids = r.hue === 0 ? [[left, 1], [[dx, dz], 2], [right, 3]] : [[left, r.hue], [right, r.hue]];
        for (const [dd, hue] of kids) rays.push({ layer: r.layer, id: r.id, y, o: [cx, cz], d: dd, hue, skip: m.id });
        break;
      } else { // filter
        const hx = ox + dx * ht, hz = oz + dz * ht;
        if (r.hue === 0) r.hue = m.filter;
        else if (r.hue !== m.filter) { pts.push([hx, y, hz]); break; }
        ox = hx + dx * 0.2; oz = hz + dz * 0.2; skip = m.id;
        pts.push([hx, y, hz]);
      }
    }
    w.beams.push({ layer: r.layer, id: r.id, pts, hue: r.hue });
  }
}

function sensorBox(L) {
  const p = L.def.pos;
  return { x0: p[0] - 0.4, x1: p[0] + 0.4, y0: p[1] - 0.4, y1: p[1] + 0.4, z0: p[2] - 0.4, z1: p[2] + 0.4 };
}

/** Attenuation (0..1) of a sound travelling a→b through the reconciled geometry. */
export function occlusion(w, a, b, skip) {
  let k = 1;
  for (const s of w.solids) {
    if (!s.block || s.snd >= 1 || s === skip) continue;
    if (containsPoint(s.b, a[0], a[1], a[2]) || containsPoint(s.b, b[0], b[1], b[2])) continue;
    if (segHitsBox(a[0], a[1], a[2], b[0], b[1], b[2], s.b)) k *= s.snd;
  }
  return k;
}

export function collectSoundSources(w) {
  const out = [];
  for (const L of w.allAlive()) {
    const t = L.def.type;
    if (t === 'emitter' && L.st[0] > 0.5) out.push({ layer: L.layer, id: L.id, note: L.def.note ?? 1, range: L.def.range ?? 16, pos: L.def.pos });
    else if (t === 'carillon' && L.st[1] > 0.5) out.push({ layer: L.layer, id: L.id, note: L.st[1] | 0, range: L.def.range ?? 22, pos: L.def.pos });
    else if (t === 'actor' && L.st[7] > 0.5 && L.st[4] > 0.5) out.push({ layer: L.layer, id: L.id, note: L.st[4] | 0, range: 14, pos: [L.st[0], L.st[1] + 0.5, L.st[2]] });
    else if (t === 'player' && L.st[8] > 0.5) out.push({ layer: L.layer, id: L.id, note: L.st[8] | 0, range: 15, pos: [L.st[0], L.st[1] + 0.5, L.st[2]] });
  }
  return out;
}

export function computeSound(w) {
  const sources = collectSoundSources(w);
  w.sources = sources;
  for (const L of w.items) {
    if (L.def.type !== 'resonator') continue;
    const sens = L.def.sens ?? 0.2, p = L.def.pos;
    let mask = 0;
    for (const s of sources) {
      const d = Math.hypot(p[0] - s.pos[0], p[1] - s.pos[1], p[2] - s.pos[2]);
      if (d >= s.range) continue;
      const amp = (1 - d / s.range) * occlusion(w, s.pos, p);
      if (amp >= sens) mask |= 1 << s.note;
    }
    L.st[3] = mask;
  }
}
