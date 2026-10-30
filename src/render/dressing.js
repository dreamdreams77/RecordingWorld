// Architectural dressing generated from the level's own walls: a plinth at the foot, a cornice at the head and
// pilasters along long faces, in the chapter's materials. Purely visual (no colliders), instanced, and derived from
// geometry so every hall in every chapter gets proportion and shadow lines without hand placement.

import * as THREE from 'three';
import { instanced, mat4 } from './scenery.js';

const STYLE = {
  chamber:     { plinth: 0.45, cornice: 0.3,  pilaster: 0.55, every: 7,  stone: 'stone', trim: 'crate' },
  machine:     { plinth: 0.6,  cornice: 0.22, pilaster: 0.7,  every: 5,  stone: 'metal', trim: 'metal' },
  absence:     { plinth: 0.3,  cornice: 0.12, pilaster: 0,    every: 9,  stone: 'stone', trim: 'stone' },
  acoustic:    { plinth: 0.35, cornice: 0.35, pilaster: 0.5,  every: 4,  stone: 'wall',  trim: 'stone' },
  observatory: { plinth: 0.4,  cornice: 0.28, pilaster: 0.45, every: 8,  stone: 'stone', trim: 'metal' },
  record:      { plinth: 0.5,  cornice: 0.4,  pilaster: 0.6,  every: 10, stone: 'stone', trim: 'wall' },
};

export function dressArchitecture(level, lib, theme, quality) {
  const st = STYLE[theme] ?? STYLE.chamber, g = new THREE.Group();
  const plinths = [], corn = [], pil = [];
  const low = quality?.scenery < 0.5;
  for (const e of level.entities ?? []) {
    if (e.type !== 'wall' || e.skin === 'floor' || e.dyn || e.era || e.ifCanon) continue;
    const [sx, sy, sz] = e.size, [cx, cy, cz] = e.pos, h = sy;
    if (h < 2.4) continue;
    const alongX = sx >= sz, len = alongX ? sx : sz, thick = alongX ? sz : sx;
    if (len < 3.5 || thick > 3) continue;
    const y0 = cy - h / 2;
    for (const side of [-1, 1]) {
      const off = thick / 2 + 0.06; // sits just proud of the face
      const px = alongX ? cx : cx + side * off, pz = alongX ? cz + side * off : cz;
      const ry = alongX ? 0 : Math.PI / 2;
      // plinth + cornice run the full length of the face
      plinths.push(mat4(px, y0 + st.plinth / 2, pz, 0, ry, 0, len + 0.02, st.plinth, 0.16));
      corn.push(mat4(px, y0 + h - st.cornice / 2, pz, 0, ry, 0, len + 0.02, st.cornice, 0.3));
      if (!low && st.pilaster > 0 && len > st.every + 1) {
        const n = Math.floor(len / st.every);
        for (let k = 0; k <= n; k++) {
          const t = -len / 2 + 0.4 + (k * (len - 0.8)) / Math.max(1, n);
          pil.push(mat4(alongX ? cx + t : px, y0 + (h - st.cornice - st.plinth) / 2 + st.plinth, alongX ? pz : cz + t, 0, ry, 0, st.pilaster, h - st.cornice - st.plinth, 0.2));
        }
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  if (plinths.length) g.add(instanced(box, lib.skin(theme, st.stone), plinths, false));
  if (corn.length) g.add(instanced(box, lib.skin(theme, st.trim), corn, false));
  if (pil.length) g.add(instanced(box, lib.skin(theme, st.stone), pil, false));
  g.userData.count = plinths.length + corn.length + pil.length;
  return g;
}
