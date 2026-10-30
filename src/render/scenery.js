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



// ------------------------------------------------------------------ shared builders for the other themes
function frameWire(box, color, opacity = 0.35) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  l.position.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
  return l;
}
function ringStack(lib, theme, { cx, cz, r, y0, y1, step, tube = 0.35, mat }) {
  const g = new THREE.TorusGeometry(r, tube, 8, 72), m = [];
  for (let y = y0; y > y1 === y0 > y1 ? false : false; y += step) { /* placeholder to keep linter calm */ }
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y += step) m.push(mat4(cx, y, cz, Math.PI / 2, 0, 0, 1 + 0.06 * Math.sin(y * 0.3), 1 + 0.06 * Math.sin(y * 0.3), 1));
  return instanced(g, mat ?? lib.skin(theme, 'metal'), m, false);
}
const fogOf = (color, density) => ({ color, density });

// ------------------------------------------------------------------ THEME: machine (Chapter II)
function machine(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level);
  const g = new THREE.Group(), anim = [];
  const iron = lib.skin(theme, 'wall'), brass = lib.skin(theme, 'crate'), steel = lib.skin(theme, 'metal'), stone = lib.skin(theme, 'stone');
  const zA = 12, zB = B.z0 - 6, len = Math.abs(zA - zB);
  // overhead girders and catwalk
  const gird = [], gg = boxGeometry(22, 0.7, 0.6, 3);
  for (let z = zA; z > zB; z -= 6) gird.push(mat4(0, 13, z));
  g.add(instanced(gg, iron, gird));
  for (const x of [-9.6, 9.6]) { const m = new THREE.Mesh(boxGeometry(0.7, 0.9, len, 3), steel); m.position.set(x, 9.4, (zA + zB) / 2); m.castShadow = true; g.add(m); }
  // pipes along both walls with flanges
  const pipeG = new THREE.CylinderGeometry(0.32, 0.32, len, 14), flange = new THREE.CylinderGeometry(0.46, 0.46, 0.18, 14);
  for (const [x, y] of [[-8.7, 6.4], [-8.7, 7.6], [8.7, 6.8], [8.7, 8.0]]) {
    const p = new THREE.Mesh(pipeG, brass); p.rotation.x = Math.PI / 2; p.position.set(x, y, (zA + zB) / 2); p.castShadow = true; g.add(p);
    const fl = []; for (let z = zA; z > zB; z -= 5) fl.push(mat4(x, y, z, Math.PI / 2, 0, 0));
    g.add(instanced(flange, steel, fl));
  }
  // meshing gear pairs on shafts running down the hall
  const gearGeo = gearGeometry(3.6, 28, 0.9), gearsA = [], gearsB = [];
  const gm = new THREE.Group(); g.add(gm);
  const n = Math.max(3, Math.round(len / 18 * q.scenery));
  for (let i = 0; i < n; i++) {
    const z = zA - 10 - i * 18;
    const a = new THREE.Mesh(gearGeo, i % 2 ? brass : iron), b = new THREE.Mesh(gearGeo, i % 2 ? iron : brass);
    a.position.set(-3.55, 17, z); b.position.set(3.55, 17, z); a.castShadow = b.castShadow = true;
    gm.add(a, b); gearsA.push(a); gearsB.push(b);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 10, 10), steel); sh.rotation.z = Math.PI / 2; sh.position.set(0, 17, z); gm.add(sh);
  }
  const drive = (id) => id.startsWith('fw');
  anim.push((t, world) => {
    let power = 0.15; if (world) for (const [k, v] of world.R) if (drive(k)) power += Math.min(2, v);
    const sp = 0.1 + power * 0.9; const dt = 1 / 60;
    gearsA.forEach((a, i) => { a.rotation.z += sp * dt * (i % 2 ? 1 : 0.8); });
    gearsB.forEach((b, i) => { b.rotation.z -= sp * dt * (i % 2 ? 1 : 0.8); b.rotation.z += 0; });
  });
  // pistons
  const pg = new THREE.CylinderGeometry(0.5, 0.5, 5, 12), pist = [];
  const pm = []; for (let z = zA - 4; z > zB; z -= 9) { for (const x of [-9, 9]) { const m = new THREE.Mesh(pg, steel); m.position.set(x * 0.93, 4, z); m.castShadow = true; g.add(m); pm.push(m); } }
  anim.push((t) => pm.forEach((m, i) => { m.position.y = 4.5 + Math.sin(t * 1.6 + i) * 0.9; }));
  // furnace glow strips
  const glow = new THREE.MeshStandardMaterial({ color: 0x120804, emissive: 0xff7a2a, emissiveIntensity: 3.2 });
  const strips = []; for (let z = zA - 3; z > zB; z -= 6) { strips.push(mat4(-9.45, 2.2, z)); strips.push(mat4(9.45, 2.2, z)); }
  g.add(instanced(new THREE.BoxGeometry(0.12, 0.25, 2.6), glow, strips, false));
  // shafts of orange light + embers
  for (let i = 0; i < Math.round(6 * q.scenery); i++) { const s = lightShaft({ color: 0xff9a50, topR: 0.5, botR: 3, height: 22, intensity: 0.28 }); s.position.set((i % 2 ? 4 : -4), 11, zA - 14 - i * 20); s.rotation.z = (i % 2 ? 0.2 : -0.2); g.add(s); anim.push((t) => { s.material.uniforms.uTime.value = t; }); }
  const dust = dustMotes(Math.round(q.particles * 1.2), { x0: -9, x1: 9, y0: 0.5, y1: 12, z0: B.z0, z1: 10 }, 0xffa860, 0.06); g.add(dust); anim.push((t) => { dust.material.uniforms.uTime.value = t; });
  g.add(rulerDecal(8, B.z0 + 2, 0, 1.2));
  return { group: g, anim, fog: fogOf(0x100b08, 0.0125), ambient: { sky: 0x4a3426, ground: 0x0d0805, intensity: 0.6 }, key: { color: 0xffc58a, intensity: 2.0, dir: [0.4, 1, 0.3] },
    tint: { shadow: [1.05, 0.98, 0.92], high: [1.12, 1.0, 0.85] }, exposure: 0.95, bloom: 0.5,
    panels: [{ size: [40, 0.5, 6], pos: [0, 30, -20], color: 0xff9a50, intensity: 5 }, { size: [0.5, 20, 40], pos: [30, 10, -20], color: 0xffd9b0, intensity: 3 }] };
}

// ------------------------------------------------------------------ THEME: absence (Chapter III)
function absence(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level), rnd = mulberry32(31);
  const g = new THREE.Group(), anim = [];
  const sand = lib.skin(theme, 'wall'), stone = lib.skin(theme, 'stone');
  const zA = 12, zB = B.z0 - 6;
  // ruined colonnade: columns of varying height, some broken, some missing
  const col = columnGeometry(9, 0.42), cols = [], stubs = [];
  for (let z = zA; z > zB; z -= 6) for (const x of [-8.4, 8.4]) {
    const r = rnd();
    if (r < 0.25) continue;
    if (r < 0.55) stubs.push(mat4(x, 0, z, 0, rnd() * 6, 0, 1, 0.25 + rnd() * 0.45, 1)); else cols.push(mat4(x, 0, z, 0, 0, 0));
  }
  g.add(instanced(col, stone, cols)); g.add(instanced(col, stone, stubs));
  // fractured arches
  const rib = ribGeometry(9.8, 7.5, 0.9, 1.0), arches = [];
  for (let z = zA - 3; z > zB; z -= 12) if (rnd() > 0.3) arches.push(mat4(0, 9, z, 0, 0, (rnd() - 0.5) * 0.04));
  g.add(instanced(rib, sand, arches));
  // floating fragments of buildings that are no longer anywhere
  const frag = new THREE.BoxGeometry(1, 1, 1), fm = [], fdata = [];
  for (let i = 0; i < Math.round(70 * q.scenery); i++) { const x = (rnd() - 0.5) * 70, y = 6 + rnd() * 30, z = zA - rnd() * Math.abs(zB - zA), sc = 0.6 + rnd() * 2.6; fdata.push({ x, y, z, sc, rx: rnd() * 6, ry: rnd() * 6, sp: (rnd() - 0.5) * 0.2 }); fm.push(mat4(x, y, z, 0, 0, 0, sc, sc * (0.4 + rnd()), sc)); }
  const fragMesh = instanced(frag, sand, fm); g.add(fragMesh);
  const tmpM = new THREE.Matrix4();
  anim.push((t) => { fdata.forEach((f, i) => { tmpM.copy(mat4(f.x + Math.sin(t * 0.1 + i) * 0.4, f.y + Math.sin(t * 0.13 + i * 2) * 0.7, f.z, f.rx + t * f.sp, f.ry + t * f.sp * 0.7, 0, f.sc, f.sc * 0.7, f.sc)); fragMesh.setMatrixAt(i, tmpM); }); fragMesh.instanceMatrix.needsUpdate = true; });
  // the absent architecture, drawn as survey outlines at the final position of every past-era entity
  const surv = new THREE.Group(); g.add(surv);
  for (const e of level.entities) if (e.era === 'past' && e.size) {
    const c = e.to ?? e.pos, s = e.size;
    surv.add(frameWire({ x0: c[0] - s[0] / 2, x1: c[0] + s[0] / 2, y0: c[1] - s[1] / 2, y1: c[1] + s[1] / 2, z0: c[2] - s[2] / 2, z1: c[2] + s[2] / 2 }, 0xd8cfff, 0.28));
  }
  anim.push((t) => { surv.children.forEach((l) => { l.material.opacity = 0.2 + 0.12 * Math.sin(t * 1.3); }); });
  for (let i = 0; i < Math.round(6 * q.scenery); i++) { const s = lightShaft({ color: 0xffd8c8, topR: 0.8, botR: 3.4, height: 22, intensity: 0.26 }); s.position.set((rnd() - 0.5) * 14, 10, zA - 6 - i * 16); s.rotation.z = 0.3; g.add(s); anim.push((t) => { s.material.uniforms.uTime.value = t; }); }
  const dust = dustMotes(Math.round(q.particles * 1.5), { x0: -10, x1: 10, y0: 0.3, y1: 14, z0: B.z0, z1: 10 }, 0xe8d8c8, 0.05); g.add(dust); anim.push((t) => { dust.material.uniforms.uTime.value = t; });
  g.add(rulerDecal(8, B.z0 + 2, 0, 1.0));
  return { group: g, anim, fog: fogOf(0x15101a, 0.011), ambient: { sky: 0x6a5a78, ground: 0x120e12, intensity: 0.62 }, key: { color: 0xffd2c0, intensity: 2.3, dir: [-0.8, 0.7, 0.3] },
    tint: { shadow: [0.98, 0.94, 1.1], high: [1.12, 1.0, 0.92] }, exposure: 0.98, bloom: 0.42,
    panels: [{ size: [0.5, 25, 50], pos: [-40, 10, -30], color: 0xffd6c0, intensity: 5 }, { size: [50, 0.5, 8], pos: [0, 40, -30], color: 0xbfb0ff, intensity: 3 }] };
}

// ------------------------------------------------------------------ THEME: acoustic (Chapter IV)
function acoustic(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level), rnd = mulberry32(77);
  const g = new THREE.Group(), anim = [];
  const brass = lib.skin(theme, 'metal'), basalt = lib.skin(theme, 'wall'), crate = lib.skin(theme, 'crate');
  const zA = 12, zB = B.z0 - 6;
  // organ pipes: instanced brass cylinders of rising height along both walls, above wall height
  const pg = new THREE.CylinderGeometry(0.34, 0.38, 1, 18, 1, true), mouth = new THREE.BoxGeometry(0.5, 0.16, 0.12), pipes = [], mouths = [];
  for (let z = zA; z > zB; z -= 0.95) for (const sx of [-1, 1]) {
    const h = 6 + 8 * (0.5 + 0.5 * Math.sin(z * 0.18 + (sx > 0 ? 1.2 : 0))) + rnd() * 1.4, x = sx * 11.2;
    pipes.push(mat4(x, h / 2 + 2, z, 0, 0, 0, 1, h, 1)); mouths.push(mat4(x - sx * 0.3, 3.2, z));
  }
  const pm = new THREE.MeshStandardMaterial({ ...{ color: 0xb9985a, metalness: 1, roughness: 0.28 }, side: THREE.DoubleSide, envMapIntensity: 1.6 });
  g.add(instanced(pg, pm, pipes)); g.add(instanced(mouth, crate, mouths, false));
  // resonant ribs
  const rib = ribGeometry(10.6, 11, 0.5, 0.6), ribs = []; for (let z = zA; z > zB; z -= 5) ribs.push(mat4(0, 9, z));
  g.add(instanced(rib, basalt, ribs));
  // hanging bells that ring when sound is present
  const bell = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.75), pm); const bells = [];
  for (let z = zA - 6; z > zB; z -= 12) { const b = bell.clone(); b.position.set((z % 24 ? -3 : 3), 14, z); b.scale.set(0.9, 1.1, 0.9); b.castShadow = true; g.add(b); bells.push(b); const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.position.x, 14.5, z), new THREE.Vector3(b.position.x, 30, z)]), new THREE.LineBasicMaterial({ color: 0x334 })); g.add(cord); }
  anim.push((t, w) => { const k = w ? Math.min(1, w.sources.length * 0.6) : 0; bells.forEach((b, i) => { b.rotation.z = Math.sin(t * 5 + i) * 0.08 * k + Math.sin(t * 0.6 + i) * 0.02; }); });
  // glow strips (teal)
  const gm = new THREE.MeshStandardMaterial({ color: 0x041214, emissive: 0x39e0d0, emissiveIntensity: 2.6 });
  const strips = []; for (let z = zA - 2; z > zB; z -= 5) { strips.push(mat4(-9.4, 1.0, z)); strips.push(mat4(9.4, 1.0, z)); }
  g.add(instanced(new THREE.BoxGeometry(0.1, 0.1, 2.4), gm, strips, false));
  for (let i = 0; i < Math.round(6 * q.scenery); i++) { const s = lightShaft({ color: 0x58f0e0, topR: 0.6, botR: 3, height: 22, intensity: 0.26 }); s.position.set((i % 2 ? 3.5 : -3.5), 11, zA - 10 - i * 20); s.rotation.z = (i % 2 ? 0.22 : -0.22); g.add(s); anim.push((t) => { s.material.uniforms.uTime.value = t; }); }
  const dust = dustMotes(Math.round(q.particles), { x0: -9, x1: 9, y0: 0.5, y1: 12, z0: B.z0, z1: 10 }, 0x9ff6ee, 0.05); g.add(dust); anim.push((t) => { dust.material.uniforms.uTime.value = t; });
  g.add(rulerDecal(8, B.z0 + 2, 0, 1.0));
  return { group: g, anim, fog: fogOf(0x03100f, 0.0115), ambient: { sky: 0x1c4c52, ground: 0x050a0a, intensity: 0.55 }, key: { color: 0x9fe8e0, intensity: 2.2, dir: [0.3, 1, 0.2] },
    tint: { shadow: [0.88, 1.04, 1.08], high: [1.02, 1.06, 0.98] }, exposure: 0.98, bloom: 0.5,
    panels: [{ size: [40, 0.5, 6], pos: [0, 30, -30], color: 0x7ff0e6, intensity: 5 }, { size: [0.5, 20, 40], pos: [-30, 10, -30], color: 0xffd9a0, intensity: 2 }] };
}

// ------------------------------------------------------------------ THEME: observatory (Chapter V and the sandbox)
function observatory(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level), rnd = mulberry32(13);
  const g = new THREE.Group(), anim = [];
  const steel = lib.skin(theme, 'metal'), stone = lib.skin(theme, 'wall'), crate = lib.skin(theme, 'crate');
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, R = Math.max(26, (B.x1 - B.x0) / 2 + 16);
  // the infinite shaft: stacked rings descending far below and rising far above
  const mat = lib.plain(0x9aa6c0, { rough: 0.35, metal: 0.9 });
  g.add(ringStack(lib, theme, { cx, cz, r: R, y0: -260, y1: -5, step: 7, tube: 0.5, mat }));
  g.add(ringStack(lib, theme, { cx, cz, r: R + 6, y0: 14, y1: 180, step: 11, tube: 0.7, mat }));
  const pillar = new THREE.CylinderGeometry(2.4, 2.4, 520, 20), pm = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pm.push(mat4(cx + Math.cos(a) * (R + 3), 30, cz + Math.sin(a) * (R + 3))); }
  g.add(instanced(pillar, stone, pm));
  // glowing sensor lines on the shaft wall
  const lm = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x8fb0ff, emissiveIntensity: 2.6 });
  const lines = []; for (let i = 0; i < 40; i++) lines.push(mat4(cx + Math.cos(i * 0.157) * (R - 1), -20 - i * 6, cz + Math.sin(i * 0.157) * (R - 1), 0, -i * 0.157, 0));
  g.add(instanced(new THREE.BoxGeometry(6, 0.1, 0.1), lm, lines, false));
  // armillary instrument high above, and a colossal mirror dish
  const arm = new THREE.Group(); arm.position.set(cx, 70, cz - 10);
  [[22, 0.3], [17, -0.6], [12, 1.0]].forEach(([r, ax], i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 12, 96), i % 2 ? steel : crate); m.rotation.set(ax, 0, i); arm.add(m); anim.push((t) => { m.rotation.y = t * 0.05 * (i + 1); }); });
  arm.add(new THREE.Mesh(new THREE.SphereGeometry(3.5, 32, 20), new THREE.MeshStandardMaterial({ color: 0x020204, emissive: 0xbad0ff, emissiveIntensity: 4 })));
  g.add(arm);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(48, 64, 24, 0, Math.PI * 2, 0, Math.PI * 0.22), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.08, side: THREE.DoubleSide, envMapIntensity: 2 }));
  dish.position.set(cx, 140, cz); dish.rotation.x = Math.PI; g.add(dish);
  // walkway lamps along the hall + floating survey slabs
  const lampM = new THREE.MeshStandardMaterial({ color: 0x080a10, emissive: 0xc8dcff, emissiveIntensity: 2.4 });
  const lamps = []; for (let z = 8; z > B.z0 + 2; z -= 7) { lamps.push(mat4(-9.3, 3.6, z)); lamps.push(mat4(9.3, 3.6, z)); }
  g.add(instanced(new THREE.BoxGeometry(0.12, 0.7, 0.12), lampM, lamps, false));
  const slabs = [], sd = []; for (let i = 0; i < Math.round(40 * q.scenery); i++) { const a = rnd() * Math.PI * 2, rr = R - 8 - rnd() * 6, y = -4 - rnd() * 90; sd.push({ a, rr, y, s: rnd() }); slabs.push(mat4(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr, 0, a, 0, 4 + rnd() * 6, 0.5, 2 + rnd() * 3)); }
  const sm = instanced(new THREE.BoxGeometry(1, 1, 1), stone, slabs); g.add(sm);
  for (let i = 0; i < Math.round(6 * q.scenery); i++) { const s = lightShaft({ color: 0x9fb8ff, topR: 0.8, botR: 3.6, height: 28, intensity: 0.26 }); s.position.set((rnd() - 0.5) * 10, 12, 4 - i * 20); s.rotation.z = (rnd() - 0.5) * 0.4; g.add(s); anim.push((t) => { s.material.uniforms.uTime.value = t; }); }
  const dust = dustMotes(Math.round(q.particles), { x0: -9, x1: 9, y0: 0.3, y1: 14, z0: B.z0, z1: B.z1 + 6 }, 0xcad8ff, 0.05); g.add(dust); anim.push((t) => { dust.material.uniforms.uTime.value = t; });
  if (!level.sandbox) g.add(rulerDecal(8, B.z0 + 2, 0, 1.0));
  return { group: g, anim, fog: fogOf(0x03060c, 0.0075), ambient: { sky: 0x28385c, ground: 0x04060a, intensity: 0.52 }, key: { color: 0xb8ccff, intensity: 2.4, dir: [-0.3, 1, 0.2] },
    tint: { shadow: [0.9, 0.98, 1.14], high: [1.06, 1.02, 0.96] }, exposure: 0.96, bloom: 0.5,
    panels: [{ size: [60, 0.5, 6], pos: [0, 50, -30], color: 0xaec6ff, intensity: 6 }, { size: [0.5, 30, 40], pos: [40, 10, -30], color: 0xffffff, intensity: 3 }] };
}

// ------------------------------------------------------------------ THEME: record (Chapter VI)
function record(ctx) {
  const { lib, level, quality: q, theme } = ctx, B = levelBounds(level), rnd = mulberry32(51);
  const g = new THREE.Group(), anim = [];
  const stone = lib.skin(theme, 'stone'), brass = lib.skin(theme, 'crate'), steel = lib.skin(theme, 'metal'), wall = lib.skin(theme, 'wall');
  const cz = B.z0 + 22, zA = 12, zB = B.z0 - 8;
  // colonnade ring around the Master Record
  const col = columnGeometry(16, 0.7, 24), cols = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; cols.push(mat4(Math.cos(a) * 34, 0, cz + Math.sin(a) * 34 - 28)); }
  g.add(instanced(col, stone, cols));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 0.9, 12, 120), brass); ring.rotation.x = Math.PI / 2; ring.position.set(0, 16.4, cz - 28); g.add(ring);
  // hall ribs for the corridor section
  const rib = ribGeometry(10.6, 9, 0.8, 0.9), ribs = []; for (let z = zA; z > -92; z -= 7) ribs.push(mat4(0, 9, z));
  g.add(instanced(rib, wall, ribs));
  // the film-reel wheel hanging above the chamber: sprocket holes, frames, slow rotation
  const reel = new THREE.Group(); reel.position.set(0, 46, cz - 28);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 1.2, 64, 1), steel); disc.castShadow = true; reel.add(disc);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const h = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.4, 24), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffe2b0, emissiveIntensity: 3.0 })); h.position.set(Math.cos(a) * 15, 0, Math.sin(a) * 15); reel.add(h); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2.4, 32), brass); reel.add(hub);
  reel.rotation.x = 0.35; g.add(reel); anim.push((t) => { reel.rotation.y = t * 0.06; });
  // contact-sheet walls: rows of emissive frames, one per "recorded moment"
  const frameG = new THREE.PlaneGeometry(1.3, 0.9), fm = new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false, transparent: true, opacity: 0.55 }), frs = [];
  for (let z = zA; z > -92; z -= 1.8) for (let row = 0; row < 3; row++) { frs.push(mat4(-8.47, 5.2 + row * 1.1, z, 0, Math.PI / 2, 0)); frs.push(mat4(8.47, 5.2 + row * 1.1, z, 0, -Math.PI / 2, 0)); }
  const fr = instanced(frameG, fm, frs, false); g.add(fr);
  // live timecode on the far wall of the chamber
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const cx2 = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const tc = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false })); tc.position.set(0, 8, B.z0 + 3); g.add(tc);
  let lastTick = -1;
  anim.push((t, w) => { if (!w || w.tick === lastTick) return; lastTick = w.tick; cx2.clearRect(0, 0, 1024, 256); cx2.fillStyle = '#ffe2b0'; cx2.font = 'bold 120px monospace'; const T = w.tick, f = T % 60, s = Math.floor(T / 60) % 60, m = Math.floor(T / 3600) % 60, h = Math.floor(T / 216000);
    cx2.fillText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`, 60, 150); cx2.font = '38px monospace'; cx2.fillText('● REC 000  ·  THE LAST DAY  ·  PLAYHEAD', 60, 215); tex.needsUpdate = true; });
  for (let i = 0; i < Math.round(8 * q.scenery); i++) { const s = lightShaft({ color: 0xffe0b0, topR: 0.8, botR: 4.2, height: 40, intensity: 0.3 }); s.position.set((rnd() - 0.5) * 16, 18, 4 - i * 18); s.rotation.z = (rnd() - 0.5) * 0.5; g.add(s); anim.push((t) => { s.material.uniforms.uTime.value = t; }); }
  const dust = dustMotes(Math.round(q.particles * 1.5), { x0: -12, x1: 12, y0: 0.3, y1: 16, z0: B.z0, z1: 10 }, 0xfff0d0, 0.05); g.add(dust); anim.push((t) => { dust.material.uniforms.uTime.value = t; });
  g.add(rulerDecal(8, B.z0 + 2, 0, 1.4));
  return { group: g, anim, fog: fogOf(0x2a2014, 0.0085), ambient: { sky: 0x8a7050, ground: 0x181008, intensity: 0.7 }, key: { color: 0xffe0b0, intensity: 2.8, dir: [-0.4, 0.9, 0.4] },
    tint: { shadow: [1.0, 0.97, 0.9], high: [1.15, 1.04, 0.86] }, exposure: 1.0, bloom: 0.55,
    panels: [{ size: [60, 0.5, 8], pos: [0, 40, -50], color: 0xffe0b0, intensity: 7 }, { size: [0.5, 30, 60], pos: [-40, 10, -50], color: 0xffffff, intensity: 3 }] };
}

export const SCENERY = { chamber, machine, absence, acoustic, observatory, record };
export function buildScenery(theme, ctx) {
  const f = SCENERY[theme] ?? SCENERY.chamber;
  return f(ctx);
}
