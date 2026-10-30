// Fields: light and sound propagate through the RECONCILED geometry — the union of every history's
// solids — and are produced by every history's emitters. This is how recorded light and recorded
// sound meet the present-day environment.

import { rayBox, segHitsBox, containsPoint } from './math.js';

export const BEAM_DIRS = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // +x, -z, -x, +z
const MAX_BOUNCES = 12, MAX_LEN = 90;

// '/' (rot 0): (dx,dz) -> (dz,dx);  '\' (rot 1): (dx,dz) -> (-dz,-dx)
function reflect(dx, dz, rot) { return rot ? [-dz, -dx] : [dz, dx]; }

export function traceBeams(w) {
  w.beams.length = 0;
  w.litSensors.clear();
  const blockers = [], mirrors = [];
  for (const s of w.solids) {
    if (s.mirror) mirrors.push(s);
    else if (s.block && s.beam) blockers.push(s);
  }
  const sensors = [];
  for (const L of w.items) if (L.def.type === 'sensor') sensors.push({ id: L.id, b: L.solidBox ?? sensorBox(L) });

  for (const L of w.allAlive()) {
    if (L.def.type !== 'beam' || L.st[0] < 0.5) continue;
    let [dx, dz] = BEAM_DIRS[(L.def.dir ?? 0) & 3];
    const y = L.def.pos[1];
    let ox = L.def.pos[0], oz = L.def.pos[2];
    const pts = [[ox, y, oz]];
    let remaining = MAX_LEN, lastMirror = null;
    for (let bounce = 0; bounce < MAX_BOUNCES; bounce++) {
      let tb = remaining, tm = Infinity, hitM = null;
      for (const s of blockers) {
        const t = rayBox(ox, y, oz, dx, 0, dz, s.b, tb);
        if (t >= 0 && t < tb && t > 0.02) tb = t;
      }
      for (const m of mirrors) {
        if (m === lastMirror || (lastMirror && m.id === lastMirror.id && m.layer === lastMirror.layer)) continue;
        const t = rayBox(ox, y, oz, dx, 0, dz, m.b, tb);
        if (t >= 0 && t < tm && t <= tb) { tm = t; hitM = m; }
      }
      const reach = Math.min(tb, tm);
      for (const se of sensors) {
        const t = rayBox(ox, y, oz, dx, 0, dz, se.b, reach);
        if (t >= 0 && t <= reach) w.litSensors.add(se.id);
      }
      if (hitM && tm <= tb) {
        const cx = (hitM.b.x0 + hitM.b.x1) / 2, cz = (hitM.b.z0 + hitM.b.z1) / 2;
        pts.push([cx, y, cz]);
        remaining -= tm;
        [dx, dz] = reflect(dx, dz, hitM.rot);
        ox = cx; oz = cz; lastMirror = hitM;
      } else {
        pts.push([ox + dx * tb, y, oz + dz * tb]);
        break;
      }
    }
    w.beams.push({ layer: L.layer, id: L.id, pts });
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
