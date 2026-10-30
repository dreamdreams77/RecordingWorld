// Procedural set dressing. Nothing here affects the simulation: it reads the level's bounds and theme and
// builds monumental, impossible architecture around the playable geometry — instanced where repeated.

import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import { boxGeometry } from './materials.js';

export function levelBounds(level) {
  const b = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
  for (const e of level.entities) {
    if (!e.size || e.pos[1] < -40) continue;
    b.x0 = Math.min(b.x0, e.pos[0] - e.size[0] / 2); b.x1 = Math.max(b.x1, e.pos[0] + e.size[0] / 2);
    b.y0 = Math.min(b.y0, e.pos[1] - e.size[1] / 2); b.y1 = Math.max(b.y1, e.pos[1] + e.size[1] / 2);
    b.z0 = Math.min(b.z0, e.pos[2] - e.size[2] / 2); b.z1 = Math.max(b.z1, e.pos[2] + e.size[2] / 2);
  }
  return b;
}

// ------------------------------------------------------------------ geometry helpers
export function ribGeometry(halfSpan, rise, thick, depth) {
  const s = new THREE.Shape(), N = 28;
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI; const x = Math.cos(a) * halfSpan, y = Math.sin(a) * rise; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const a = (i / N) * Math.PI; s.lineTo(Math.cos(a) * (halfSpan - thick), Math.sin(a) * (rise - thick)); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 24 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function columnGeometry(h, r, flutes = 20) {
  const pts = [[r * 1.5, 0], [r * 1.5, 0.25], [r * 1.15, 0.32], [r * 1.0, 0.5], [r * 0.95, h * 0.5], [r * 0.88, h - 0.7], [r * 1.0, h - 0.5], [r * 1.3, h - 0.38], [r * 1.65, h - 0.22], [r * 1.65, h]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, flutes * 2);
}
export function gearGeometry(r, teeth, depth, hole = 0.3) {
  const s = new THREE.Shape(), step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step, o = r * 1.1, n = r * 0.92;
    const p = [[n, a], [o, a + step * 0.12], [o, a + step * 0.38], [n, a + step * 0.5]];
    for (const [rr, aa] of p) { const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr; (i === 0 && rr === n && aa === a) ? s.moveTo(x, y) : s.lineTo(x, y); }
  }
  const h = new THREE.Path(); h.absarc(0, 0, r * hole, 0, Math.PI * 2, true); s.holes.push(h);
  for (let k = 0; k < 6; k++) { const hp = new THREE.Path(), a = (k / 6) * Math.PI * 2; hp.absarc(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58, r * 0.16, 0, Math.PI * 2, true); s.holes.push(hp); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function instanced(geo, mat, mats, cast = true) {
  const m = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((x, i) => m.setMatrixAt(i, x));
  m.instanceMatrix.needsUpdate = true; m.castShadow = cast; m.receiveShadow = true;
  return m;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _p.set(x, y, z); _q.setFromEuler(_e.set(rx, ry, rz)); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Volumetric-looking light shaft: a soft-edged additive cone with scrolling noise. */
export function lightShaft({ color = 0xbcd4ff, topR = 0.5, botR = 3.5, height = 18, intensity = 0.5 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vH;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition-w.xyz); vH = uv.y; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime, uI; uniform vec3 uColor; varying vec3 vN, vV, vW; varying float vH;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
      float n(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float vert = smoothstep(0.0, 0.25, vH) * (1.0 - smoothstep(0.65, 1.0, vH)) ;
        float dust = 0.55 + 0.45*n(vW*0.35 + vec3(0., -uTime*0.08, uTime*0.03));
        float near = smoothstep(0.5, 6.0, length(cameraPosition - vW));
        gl_FragColor = vec4(uColor * edge * vert * dust * uI * near, 1.0);
      }`,
  });
  const g = new THREE.CylinderGeometry(topR, botR, height, 32, 1, true);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 5;
  return m;
}

export function dustMotes(count, box, color = 0xffffff, size = 0.05) {
  const rnd = mulberry32(99), P = new Float32Array(count * 3), S = new Float32Array(count);
  for (let i = 0; i < count; i++) { P[i * 3] = box.x0 + rnd() * (box.x1 - box.x0); P[i * 3 + 1] = box.y0 + rnd() * (box.y1 - box.y0); P[i * 3 + 2] = box.z0 + rnd() * (box.z1 - box.z0); S[i] = rnd(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('seed', new THREE.BufferAttribute(S, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uBox: { value: new THREE.Vector3(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) }, uO: { value: new THREE.Vector3(box.x0, box.y0, box.z0) } },
    vertexShader: `attribute float seed; uniform float uTime, uSize; uniform vec3 uBox, uO; varying float vA;
      void main(){ vec3 p = position; p.x += sin(uTime*0.15+seed*40.)*1.2; p.y = mod(p.y - uO.y + uTime*0.12*(0.3+seed) , uBox.y) + uO.y; p.z += cos(uTime*0.12+seed*20.)*1.2;
        vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; gl_PointSize = uSize*900.0/(-mv.z) * (0.5+seed); vA = (0.2+0.8*seed) * smoothstep(0.0, 4.0, -mv.z); }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor*a*vA*0.6, 1.0); }`,
  });
  return new THREE.Points(g, m);
}

/** A ruler engraved into the floor: the timeline the whole game is organised around. */
export function rulerDecal(z0, z1, x = 0, width = 1.4) {
  const len = Math.abs(z1 - z0), c = document.createElement('canvas'); c.width = 128; c.height = Math.min(4096, Math.ceil(len * 64));
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffe2b0'; g.fillStyle = '#ffe2b0'; g.font = '14px monospace';
  for (let m = 0; m <= len; m++) {
    const y = (m / len) * c.height, major = m % 10 === 0, mid = m % 5 === 0;
    g.lineWidth = major ? 3 : 1; g.beginPath(); g.moveTo(major ? 20 : mid ? 40 : 60, y); g.lineTo(108, y); g.stroke();
    if (major) g.fillText(String(m).padStart(3, '0'), 8, y - 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.015, (z0 + z1) / 2);
  return m;
}

// ------------------------------------------------------------------ THEME: chamber
function chamber(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level);
  const g = new THREE.Group(), anim = [];
  const zA = 14, zB = Math.min(B.z0, -100) - 4, span = 10.8, baseY = 9;
  const stone = lib.skin(theme, 'stone'), steel = lib.skin(theme, 'metal'), brass = lib.skin(theme, 'crate');
  // vaulted ribs framing the open sky
  const rib = ribGeometry(span, 8.5, 0.9, 1.1);
  const ribs = []; for (let z = zA; z > zB; z -= 7) ribs.push(mat4(0, baseY, z));
  g.add(instanced(rib, lib.skin(theme, 'wall'), ribs));
  // pilasters
  const col = columnGeometry(baseY, 0.38), cols = [];
  for (let z = zA; z > zB; z -= 7) { cols.push(mat4(-8.4, 0, z)); cols.push(mat4(8.4, 0, z)); }
  g.add(instanced(col, stone, cols));
  // longitudinal cornices + glowing light bars under the ribs
  const barMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe2b8, emissiveIntensity: 2.4 });
  const bars = [], corn = [];
  for (let z = zA - 3.5; z > zB; z -= 7) { bars.push(mat4(-6.2, baseY + 3.1, z)); bars.push(mat4(6.2, baseY + 3.1, z)); }
  const barGeo = new THREE.BoxGeometry(0.12, 0.12, 3.2);
  const barsMesh = instanced(barGeo, barMat, bars, false); g.add(barsMesh);
  const cornGeo = boxGeometry(0.8, 0.5, Math.abs(zB - zA), 4);
  for (const x of [-9, 9]) { const m = new THREE.Mesh(cornGeo, stone); m.position.set(x * 0.985, baseY + 0.25, (zA + zB) / 2); m.castShadow = true; g.add(m); }
  // west glass curtain wall mullions
  const mull = [], mg = new THREE.BoxGeometry(0.28, baseY, 0.5);
  for (let z = zA; z > zB; z -= 3.5) mull.push(mat4(-9.0, baseY / 2, z));
  g.add(instanced(mg, steel, mull));
  // the suspended orrery: counter-rotating armillary rings with a lens at its heart
  const orr = new THREE.Group(); orr.position.set(0, 27, B.z0 * 0.5 - 4);
  const rings = [[15, 0.45, 0.3, 0.05], [12, 0.35, -0.5, 0.08], [9, 0.3, 0.9, -0.12], [6, 0.25, 0.2, 0.2]].map(([r, t, ax, sp], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 16, 96), i % 2 ? steel : brass); m.castShadow = true; m.rotation.set(ax, 0, i * 0.6); orr.add(m);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.9), steel); t2.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); t2.rotation.z = a; m.add(t2); }
    anim.push((t) => { m.rotation.y += sp * 0.0016; m.rotation.x = ax + Math.sin(t * 0.07 * (i + 1)) * 0.1; });
    return m;
  });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(2.4, 40, 28), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffd9a0, emissiveIntensity: 5, roughness: 0.2 }));
  orr.add(lens);
  const lensLight = new THREE.PointLight(0xffd0a0, 900, 90, 1.6); orr.add(lensLight);
  g.add(orr);
  // cables
  const cab = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; cab.push(Math.cos(a) * 14, 27, B.z0 * 0.5 - 4 + Math.sin(a) * 14, Math.cos(a) * 10, 60, B.z0 * 0.5 - 4 + Math.sin(a) * 10); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cab, 3));
  g.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x222831 })));
  // floor timeline
  g.add(rulerDecal(8, B.z0 + 2, 0, 1.6));
  // shafts
  const shafts = [];
  const rnd = mulberry32(5);
  for (let i = 0; i < Math.round(7 * q.scenery); i++) {
    const s = lightShaft({ color: i % 3 === 2 ? 0xffc690 : 0xa9c6ff, topR: 0.6, botR: 3.2 + rnd() * 2, height: 24, intensity: 0.3 });
    const z = zA - 6 - i * 13 - rnd() * 3, x = (rnd() - 0.5) * 9;
    s.position.set(x - 3, 11, z); s.rotation.z = -0.28; s.rotation.x = 0.1;
    shafts.push(s); g.add(s);
  }
  const dust = dustMotes(Math.round(q.particles), { x0: -9, x1: 9, y0: 0.5, y1: 12, z0: B.z0, z1: 10 }, 0xffe8c8, 0.05);
  g.add(dust);
  anim.push((t) => { for (const s of shafts) s.material.uniforms.uTime.value = t; dust.material.uniforms.uTime.value = t; lens.material.emissiveIntensity = 3.2 + Math.sin(t * 0.8) * 0.4; });
  return {
    group: g, anim,
    fog: { color: 0x070a12, density: 0.0105 }, ambient: { sky: 0x2a3a60, ground: 0x08080c, intensity: 0.55 },
    key: { color: 0xbcd4ff, intensity: 2.6, dir: [-0.35, 1, 0.55] },
    tint: { shadow: [0.88, 0.98, 1.14], high: [1.12, 1.03, 0.9] }, exposure: 0.92, bloom: 0.4,
    panels: [{ size: [60, 0.5, 6], pos: [0, 40, 0], color: 0xbcd0ff, intensity: 6 }, { size: [0.5, 20, 40], pos: [-50, 10, -20], color: 0xffd0a0, intensity: 3 }, { size: [40, 0.5, 6], pos: [0, 30, -50], color: 0xffffff, intensity: 3 }],
    accents: [],
  };
}

export const SCENERY = { chamber };
export function buildScenery(theme, ctx) {
  const f = SCENERY[theme] ?? SCENERY.chamber;
  return f(ctx);
}
