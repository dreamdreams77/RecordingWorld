// Material library: themed PBR skins (procedural textures) plus the three custom looks that carry the
// game's visual language:
//   • PRESENT      — cold, crisp, physically based graphite / stone / steel.
//   • HISTORICAL   — "emulsion" projections: warm duotone, laminar scan-slices, a dissolving
//                    reconstruction front. Opaque and lit: they are matter, not holograms.
//   • CONFLICT     — white-hot moiré interference where two histories fight for the same space.
//   • RECONCILED   — gold hairlines where a rule resolved a disagreement.

import * as THREE from 'three';
import { texture } from './textures.js';

export const SLOT_HUES = [0xffa94d, 0x62e0b4, 0xff6459, 0xb7a0ff, 0xd5f25c, 0xffc2d4];
export const CONFLICT_COLOR = 0xff4df0;
export const RECONCILED_COLOR = 0xffd36a;

// skin → recipe. `tile` = metres per texture repeat.
export const THEMES = {
  chamber: {
    wall: { tex: 'ribbed', tint: 0xd5d0c4, tile: 4, rough: 1 }, floor: { tex: 'obsidian', tint: 0, tile: 8, rough: 1 },
    door: { tex: 'steel', tint: 0xaeb4c0, tile: 3, rough: 1 }, bridge: { tex: 'slab', tile: 4, rough: 1 },
    crate: { tex: 'brass', tint: 0xb98a4c, tile: 1.5, rough: 1 }, metal: { tex: 'steel', tint: 0xb9bec7, tile: 3, rough: 1 },
    stone: { tex: 'limestone', tint: 0xd8d0c0, tile: 4, rough: 1 },
  },
  machine: {
    wall: { tex: 'iron', tile: 4, rough: 1 }, floor: { tex: 'steel', tint: 0x7d838c, tile: 4, rough: 1 },
    door: { tex: 'brass', tint: 0xb8863f, tile: 3, rough: 1 }, bridge: { tex: 'steel', tint: 0x9a8f7f, tile: 3, rough: 1 },
    crate: { tex: 'brass', tint: 0xc9954a, tile: 1.5, rough: 1 }, metal: { tex: 'iron', tile: 3, rough: 1 }, stone: { tex: 'concrete', tint: 0x7c7b78, tile: 4, rough: 1 },
  },
  absence: {
    wall: { tex: 'sandstone', tile: 4, rough: 1 }, floor: { tex: 'limestone', tint: 0xb9ae98, tile: 6, rough: 1 },
    door: { tex: 'steel', tint: 0x8a8070, tile: 3, rough: 1 }, bridge: { tex: 'limestone', tint: 0xcfc4ae, tile: 3, rough: 1 },
    crate: { tex: 'concrete', tint: 0x9a8a72, tile: 1.5, rough: 1 }, metal: { tex: 'iron', tile: 3, rough: 1 }, stone: { tex: 'sandstone', tile: 4, rough: 1 },
  },
  acoustic: {
    wall: { tex: 'basalt', tile: 3, rough: 1 }, floor: { tex: 'obsidian', tint: 0, tile: 8, rough: 1 },
    door: { tex: 'brass', tint: 0xa87b3a, tile: 3, rough: 1 }, bridge: { tex: 'slab', tile: 4, rough: 1 },
    crate: { tex: 'brass', tint: 0xb98a4c, tile: 1.5, rough: 1 }, metal: { tex: 'brass', tint: 0x9d8a65, tile: 2, rough: 1 }, stone: { tex: 'basalt', tile: 3, rough: 1 },
  },
  observatory: {
    wall: { tex: 'limestone', tint: 0x9aa0a8, tile: 4, rough: 1 }, floor: { tex: 'obsidian', tint: 0, tile: 8, rough: 1 },
    door: { tex: 'steel', tint: 0xc7ccd6, tile: 3, rough: 1 }, bridge: { tex: 'slab', tile: 4, rough: 1 },
    crate: { tex: 'steel', tint: 0xcfd3da, tile: 1.5, rough: 1 }, metal: { tex: 'steel', tint: 0xb9bec7, tile: 3, rough: 1 }, stone: { tex: 'limestone', tint: 0x9aa0a8, tile: 4, rough: 1 },
  },
  record: {
    wall: { tex: 'ribbed', tint: 0xe8e2d4, tile: 4, rough: 1 }, floor: { tex: 'obsidian', tint: 0, tile: 8, rough: 1 },
    door: { tex: 'brass', tint: 0xd8b25a, tile: 3, rough: 1 }, bridge: { tex: 'slab', tile: 4, rough: 1 },
    crate: { tex: 'brass', tint: 0xd8b25a, tile: 1.5, rough: 1 }, metal: { tex: 'steel', tint: 0xdad5c8, tile: 3, rough: 1 }, stone: { tex: 'limestone', tint: 0xe3dccb, tile: 4, rough: 1 },
  },
};

export class MaterialLibrary {
  constructor(quality) {
    this.size = quality.texSize;
    this.cache = new Map();
    this.echoUniforms = []; // updated every frame (time)
    this.time = { value: 0 };
    this.anisotropy = quality.anisotropy;
  }
  skin(theme, name) {
    const key = `${theme}|${name}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const spec = (THEMES[theme] ?? THEMES.chamber)[name] ?? (THEMES[theme] ?? THEMES.chamber).wall;
    let seed = 0; for (const c of spec.tex + name) seed = (seed * 31 + c.charCodeAt(0)) | 0;
    const t = texture(spec.tex, { size: this.size, seed: Math.abs(seed) % 9973 + 11, tint: spec.tint });
    for (const x of [t.map, t.orm, t.normal]) x.anisotropy = this.anisotropy;
    const m = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(1.1, 1.1),
      aoMap: t.orm, roughnessMap: t.orm, metalnessMap: t.orm, roughness: 1, metalness: 1, envMapIntensity: 1.0,
    });
    if (spec.tex === 'obsidian') { m.envMapIntensity = 1.6; m.userData.floor = true; }
    m.userData.tile = spec.tile;
    m.name = key;
    this.cache.set(key, m);
    return m;
  }
  plain(color, { rough = 0.5, metal = 0, emissive = 0, ei = 0, name } = {}) {
    const key = `plain|${color}|${rough}|${metal}|${emissive}|${ei}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
    m.userData.tile = 4; m.name = name ?? key;
    this.cache.set(key, m);
    return m;
  }
  glass(tint = 0x9fb8c8) {
    const key = `glass|${tint}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.06, metalness: 0, transmission: 0, transparent: true, opacity: 0.22, envMapIntensity: 2.0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    m.userData.tile = 4;
    this.cache.set(key, m);
    return m;
  }
  /** A per-item echo material: the historical-projection look. */
  echo(base, slot) {
    const tint = new THREE.Color(SLOT_HUES[slot % SLOT_HUES.length]);
    const m = new THREE.MeshStandardMaterial({
      color: tint.clone().multiplyScalar(0.34), roughness: 0.46, metalness: 0.35,
      normalMap: base?.normalMap ?? null, normalScale: new THREE.Vector2(0.8, 0.8),
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const u = {
      uTime: this.time, uTint: { value: tint }, uReveal: { value: 0 }, uSeed: { value: Math.random() * 100 },
      uSlice: { value: 5.0 }, uConflict: { value: 0 }, uCoherence: { value: 1 },
      uFrozen: { value: 0 }, uRev: { value: 0 }, uSlow: { value: 0 }, uSolo: { value: 0 },
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWP;
uniform float uTime, uReveal, uSeed, uSlice, uConflict, uCoherence, uFrozen, uRev, uSlow, uSolo;
uniform vec3 uTint;
float h31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
        .replace('void main() {', `void main() {
  float rn = vn(vWP * 2.1 + uSeed) * 0.7 + vn(vWP * 6.0 + uSeed) * 0.3;
  float front = uReveal * 1.45 - (rn + vWP.y * 0.012);
  if (front < 0.0) discard;
  float rimFront = 1.0 - smoothstep(0.0, 0.16, front);
  // coherence loss: the projection frays into dropout bands
  float bandN = vn(vec3(floor(vWP.y * 9.0), floor(uTime * 12.0), uSeed));
  if (uCoherence < 0.6 && bandN > uCoherence + 0.45) discard;
`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float spd = mix(1.0, -1.6, uRev) * mix(1.0, 0.25, uSlow) * (1.0 - uFrozen); // scan-lines run backwards in reverse, crawl when slow, stop when frozen
  float sl = fract(vWP.y * uSlice - uTime * 0.12 * spd);
  float band = smoothstep(0.0, 0.03, sl) * (1.0 - smoothstep(0.03, 0.09, sl));
  vec3 Nn = normalize(vNormal);
  float fres = pow(1.0 - clamp(dot(Nn, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  float mo = sin((vWP.x + vWP.z) * 38.0 + uTime * 7.0) * sin(vWP.y * 33.0 - uTime * 3.0);
  vec3 tintE = mix(uTint, vec3(1.0, 0.62, 0.28), 0.45 * uRev);          // reverse runs warm
  float facet = step(0.62, vn(floor(vWP * 7.0) + uSeed)) * fres;          // frozen: faceted ice at the rim
  totalEmissiveRadiance += tintE * (rimFront * 7.0 + band * 0.9 + fres * 1.2 + 0.04 + uSolo * (fres * 2.5 + 0.25));
  totalEmissiveRadiance += vec3(0.78, 0.9, 1.0) * uFrozen * (fres * 2.2 + facet * 3.0 + 0.1);
  totalEmissiveRadiance += vec3(1.0, 0.25, 0.9) * smoothstep(0.55, 1.0, mo) * uConflict * 3.0;`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(lum) * uTint * 2.2 + uTint * 0.05, 0.62);
  gl_FragColor.rgb *= 0.86 + 0.14 * step(0.5, fract(vWP.y * uSlice * 5.0));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.82, 0.9, 0.98) * (0.35 + lum), 0.32 * uFrozen); // a frozen echo is pale and still
  gl_FragColor.rgb += (h31(vec3(gl_FragCoord.xy, floor(uTime * 24.0 * (1.0 - uFrozen)))) - 0.5) * 0.05;`);
    };
    m.customProgramCacheKey = () => 'echo-v2';
    return m;
  }
  setTime(t) { this.time.value = t; }
}

/** Additive moiré shell drawn over a region where two histories overlap. */
export function makeConflictMaterial(time) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: time, uAmt: { value: 1 }, uColor: { value: new THREE.Color(CONFLICT_COLOR) } },
    vertexShader: `varying vec3 vWP; varying vec3 vN; varying vec3 vV;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vWP = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime, uAmt; uniform vec3 uColor; varying vec3 vWP, vN, vV;
      void main(){
        float a = sin(dot(vWP, vec3(31., 17., 23.)) + uTime*9.);
        float b = sin(dot(vWP, vec3(-19., 29., 27.)) - uTime*7.);
        float m = smoothstep(.55, 1., a*b*0.5+0.5 + 0.15);
        float f = pow(1. - abs(dot(vN, vV)), 2.0);
        vec3 c = mix(uColor, vec3(1.), m) * (0.25 + m*1.8 + f*1.4);
        c.r += m*.5*sin(uTime*40.); 
        gl_FragColor = vec4(c * uAmt, 1.);
      }`,
  });
}

/** Gold hairline material for reconciled outlines. */
export function makeReconciledMaterial() {
  return new THREE.LineBasicMaterial({ color: RECONCILED_COLOR, transparent: true, opacity: 0.9, depthTest: true });
}

/** Box geometry whose UVs are in world metres / tile, so a texture keeps one density on every box. */
const geoCache = new Map();
export function boxGeometry(sx, sy, sz, tile = 4, ox = 0, oy = 0, oz = 0) {
  const key = `${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}|${tile}|${(ox % tile).toFixed(2)}|${(oy % tile).toFixed(2)}|${(oz % tile).toFixed(2)}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(sx, sy, sz);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  g.setAttribute('uv1', uv.clone()); // aoMap uses uv1 in recent three versions
  geoCache.set(key, g);
  return g;
}
export function disposeGeometryCache() { for (const g of geoCache.values()) g.dispose(); geoCache.clear(); }
