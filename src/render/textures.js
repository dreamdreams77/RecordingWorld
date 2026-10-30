// Procedural texture synthesis. Every surface in the game is generated at start-up from noise:
// albedo, a packed ORM map (R = ambient occlusion, G = roughness, B = metalness) and a tangent-space
// normal map derived from a height field. No image assets are shipped.

import * as THREE from 'three';

export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Periodic (tileable) value noise on an integer lattice. */
class Noise {
  constructor(seed, lattice = 256) {
    const r = mulberry32(seed);
    this.n = lattice; this.v = new Float32Array(lattice * lattice);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r();
  }
  at(x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const w = period, m = this.n;
    const i0 = ((xi % w) + w) % w, j0 = ((yi % w) + w) % w, i1 = (i0 + 1) % w, j1 = (j0 + 1) % w;
    const g = (i, j) => this.v[(j % m) * m + (i % m)];
    const a = g(i0, j0), b = g(i1, j0), c = g(i0, j1), d = g(i1, j1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  fbm(u, v, base, oct = 5, gain = 0.5) {
    let amp = 0.5, sum = 0, f = base;
    for (let o = 0; o < oct; o++) { sum += amp * this.at(u * f, v * f, f); f *= 2; amp *= gain; }
    return sum;
  }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

/**
 * @param {number} size texture edge in pixels
 * @param {(u:number,v:number,N:Noise)=>{c:number[],h:number,r:number,m:number,ao?:number}} fn
 */
function synth(size, seed, fn, normalStrength = 2.0) {
  const N = new Noise(seed);
  const col = new Uint8Array(size * size * 4), orm = new Uint8Array(size * size * 4), nrm = new Uint8Array(size * size * 4);
  const H = new Float32Array(size * size);
  const tmp = new Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = fn(x / size, y / size, N);
    tmp[y * size + x] = o; H[y * size + x] = o.h;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, o = tmp[i], p = i * 4;
    col[p] = clamp01(o.c[0]) * 255; col[p + 1] = clamp01(o.c[1]) * 255; col[p + 2] = clamp01(o.c[2]) * 255; col[p + 3] = 255;
    // cavity AO from the height field
    const hl = H[y * size + ((x + size - 2) % size)], hr = H[y * size + ((x + 2) % size)], hu = H[((y + size - 2) % size) * size + x], hd = H[((y + 2) % size) * size + x];
    const cav = clamp01(1 - Math.max(0, (hl + hr + hu + hd) / 4 - o.h) * 3.2);
    orm[p] = clamp01(o.ao ?? cav) * 255; orm[p + 1] = clamp01(o.r) * 255; orm[p + 2] = clamp01(o.m) * 255; orm[p + 3] = 255;
    const dx = (H[y * size + ((x + 1) % size)] - H[y * size + ((x + size - 1) % size)]) * normalStrength * size / 64;
    const dy = (H[((y + 1) % size) * size + x] - H[((y + size - 1) % size) * size + x]) * normalStrength * size / 64;
    const l = Math.hypot(dx, dy, 1);
    nrm[p] = (-dx / l * 0.5 + 0.5) * 255; nrm[p + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[p + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[p + 3] = 255;
  }
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), orm: mk(orm, false), normal: mk(nrm, false) };
}

const lineMask = (t, w) => 1 - clamp01(Math.abs(((t % 1) + 1) % 1 - 0.0) / w) ;
const periodicLine = (t, w) => { const f = ((t % 1) + 1) % 1; const d = Math.min(f, 1 - f); return clamp01(1 - d / w); };

export const RECIPES = {
  // cast concrete with formwork seams and tie holes
  concrete: (size, seed, tint = 0x8d9096) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 4, 6), fine = N.fbm(u, v, 64, 2);
    const pit = N.at(u * 96, v * 96, 96) > 0.9 ? 0.25 : 0;
    const seam = Math.max(periodicLine(u * 2, 0.012), periodicLine(v * 4, 0.01));
    const tie = ((Math.hypot(((u * 8) % 1) - 0.5, ((v * 8) % 1) - 0.5) < 0.05) ? 1 : 0);
    const h = n * 0.5 + fine * 0.15 - pit - seam * 0.25 - tie * 0.35;
    const g = 0.42 + n * 0.5 + fine * 0.1 - pit * 0.6 - seam * 0.12 - tie * 0.2;
    const t = hex(tint);
    return { c: [g * t[0] * 1.6, g * t[1] * 1.6, g * t[2] * 1.6], h, r: 0.72 + fine * 0.25, m: 0 };
  }, 2.5),
  // pale limestone blocks with veining
  limestone: (size, seed, tint = 0xd8d0c0) => synth(size, seed, (u, v, N) => {
    const bu = u * 4, bv = v * 8, row = Math.floor(bv), off = row % 2 ? 0.5 : 0;
    const gx = periodicLine(bu + off, 0.018), gy = periodicLine(bv, 0.02), joint = Math.max(gx, gy);
    const id = Math.floor(bu + off) * 7 + row * 13;
    const tone = 0.82 + ((Math.sin(id * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.18;
    const n = N.fbm(u, v, 6, 5), vein = Math.abs(Math.sin((u * 5 + N.fbm(u, v, 3, 4) * 6) * Math.PI)) ;
    const veins = clamp01(1 - vein * 6) * 0.25;
    const h = n * 0.3 - joint * 0.55;
    const g = (0.7 + n * 0.3 - veins * 0.5 - joint * 0.45) * tone;
    const t = hex(tint);
    return { c: [g * t[0], g * t[1], g * t[2] * 0.97], h, r: 0.55 + n * 0.35 + joint * 0.3, m: 0 };
  }, 2.0),
  // polished obsidian floor with inlaid brass-lit grid
  obsidian: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 8, 4), fine = N.fbm(u, v, 128, 2);
    const grid = Math.max(periodicLine(u * 4, 0.006), periodicLine(v * 4, 0.006));
    const sub = Math.max(periodicLine(u * 16, 0.0018), periodicLine(v * 16, 0.0018)) * 0.5;
    const g = 0.018 + n * 0.02 + fine * 0.01;
    const inlay = grid * 0.9 + sub * 0.3;
    return { c: [g + inlay * 0.55, g + inlay * 0.42, g + inlay * 0.2], h: -grid * 0.12 + n * 0.03, r: mix(0.05 + fine * 0.12, 0.35, inlay), m: mix(0.1, 1.0, inlay) };
  }, 1.2),
  // brushed steel
  steel: (size, seed, tint = 0xb9bec7) => synth(size, seed, (u, v, N) => {
    const streak = N.fbm(u * 0.04 + v * 0.0, v, 1, 1) * 0 + N.at(u * 6, v * 400, 400) * 0.6 + N.at(u * 14, v * 700, 700) * 0.4;
    const panel = Math.max(periodicLine(u * 2, 0.008), periodicLine(v * 2, 0.008));
    const rivet = (Math.hypot(((u * 16) % 1) - 0.5, ((v * 16) % 1) - 0.5) < 0.1 && (periodicLine(u * 2, 0.07) > 0 || periodicLine(v * 2, 0.07) > 0)) ? 1 : 0;
    const g = 0.55 + streak * 0.35 - panel * 0.3 + rivet * 0.15;
    const t = hex(tint);
    return { c: [g * t[0] * 1.2, g * t[1] * 1.2, g * t[2] * 1.2], h: streak * 0.08 - panel * 0.3 + rivet * 0.25, r: 0.32 + streak * 0.25 + panel * 0.3, m: 1.0 };
  }, 1.5),
  // aged brass / bronze
  brass: (size, seed, tint = 0xc9954a) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 5, 5), fine = N.at(u * 200, v * 30, 200);
    const patina = clamp01((n - 0.52) * 4);
    const g = 0.5 + fine * 0.2;
    const t = hex(tint);
    return { c: [mix(g * t[0] * 1.3, 0.15, patina), mix(g * t[1] * 1.3, 0.4, patina), mix(g * t[2] * 1.3, 0.33, patina)], h: fine * 0.1 + n * 0.1, r: mix(0.28 + fine * 0.2, 0.65, patina), m: mix(1.0, 0.4, patina) };
  }, 1.4),
  // dark basalt with micro-crystals
  basalt: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 6, 6), c = N.at(u * 180, v * 180, 180);
    const crystal = c > 0.93 ? 1 : 0;
    const g = 0.07 + n * 0.1 + crystal * 0.25;
    return { c: [g, g * 1.02, g * 1.08], h: n * 0.4 + crystal * 0.1, r: 0.35 + n * 0.3 - crystal * 0.2, m: crystal * 0.5 };
  }, 3.0),
  // vertical fluted panel (architectural ribbing)
  ribbed: (size, seed, tint = 0xcfc9bd) => synth(size, seed, (u, v, N) => {
    const flute = 0.5 + 0.5 * Math.cos(u * 6 * Math.PI * 2), n = N.fbm(u, v, 6, 4);
    const g = 0.52 + flute * 0.25 + n * 0.15;
    const t = hex(tint);
    return { c: [g * t[0], g * t[1], g * t[2]], h: flute * 0.5 + n * 0.05, r: 0.5 + n * 0.3, m: 0, ao: 0.7 + flute * 0.3 };
  }, 1.6),
  // glassy dark tile for bridges and platforms
  slab: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 4, 5);
    const edge = Math.max(periodicLine(u * 2, 0.02), periodicLine(v * 2, 0.02));
    const g = 0.03 + n * 0.04;
    return { c: [g + edge * 0.5, g + edge * 0.32, g + edge * 0.12], h: -edge * 0.2 + n * 0.05, r: mix(0.08, 0.4, edge), m: mix(0.2, 0.9, edge) };
  }, 1.5),
  // warm sandstone for ruins
  sandstone: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 5, 6), strata = Math.sin((v + N.fbm(u, v, 2, 3) * 0.2) * Math.PI * 2 * 14) * 0.5 + 0.5;
    const g = 0.5 + n * 0.35 + strata * 0.08;
    return { c: [g * 0.95, g * 0.78, g * 0.58], h: n * 0.5 + strata * 0.1, r: 0.88, m: 0 };
  }, 3.0),
  // corroded iron / machinery
  iron: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 6, 6), rust = clamp01((N.fbm(u + 3.3, v, 4, 5) - 0.5) * 3.5), panel = Math.max(periodicLine(u * 3, 0.01), periodicLine(v * 3, 0.01));
    const g = 0.2 + n * 0.2 - panel * 0.1;
    return { c: [mix(g, 0.45, rust), mix(g, 0.2, rust), mix(g, 0.1, rust)], h: n * 0.3 - panel * 0.3 + rust * 0.1, r: mix(0.4, 0.85, rust), m: mix(0.9, 0.2, rust) };
  }, 2.2),
  // frosted/etched glass panel
  glass: (size, seed) => synth(size, seed, (u, v, N) => {
    const n = N.fbm(u, v, 12, 3);
    return { c: [0.7, 0.8, 0.85], h: n * 0.05, r: 0.08 + n * 0.1, m: 0 };
  }, 0.5),
};

const cache = new Map();
export function texture(kind, { size = 512, seed = 1, tint } = {}) {
  const key = `${kind}|${size}|${seed}|${tint}`;
  if (!cache.has(key)) cache.set(key, RECIPES[kind](size, seed, tint));
  return cache.get(key);
}
export function disposeTextures() { for (const t of cache.values()) for (const x of Object.values(t)) x.dispose(); cache.clear(); }
