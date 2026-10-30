// One signature set piece per chapter, driven by the level's own entities and the render clock. Visual only.
//   I   calibration sweeps travel the hall          II  steam plumes rise at every flywheel and belt
//   III absent architecture drifts as debris        IV  resonant motes spiral up from every tuned mechanism
//   V   a colossal astrolabe turns above; meteors   VI  film frames flicker through the air of the record

import * as THREE from 'three';
import { levelBounds } from './scenery.js';
import { mulberry32 } from './textures.js';

let _sprite = null;
function sprite() {
  if (_sprite) return _sprite;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (_sprite = new THREE.CanvasTexture(c));
}
const additive = (o = {}) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...o });

/** Particles that are born at one of several sources, move with a velocity + swirl, fade, and are reborn. */
class Plume {
  constructor(sources, { count, color, size, rise = 1.5, spread = 0.5, life = 3.2, swirl = 0, opacity = 0.5, fall = false }) {
    this.src = sources; this.N = count; this.rise = fall ? -rise : rise; this.spread = spread; this.life = life; this.swirl = swirl; this.fall = fall;
    this.pos = new Float32Array(count * 3); this.age = new Float32Array(count); this.seed = new Float32Array(count); this.col = new Float32Array(count * 3);
    this.base = new THREE.Color(color); this.rand = mulberry32(sources.length * 977 + count);
    for (let i = 0; i < count; i++) { this.seed[i] = this.rand(); this.age[i] = this.rand() * life; this.spawn(i); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: sprite(), vertexColors: true, opacity, ...additive() }));
    this.points.frustumCulled = false; this.points.renderOrder = 4;
  }
  spawn(i) {
    const s = this.src[Math.floor(this.rand() * this.src.length)], a = this.rand() * Math.PI * 2, r = this.rand() * this.spread;
    this.pos[i * 3] = s[0] + Math.cos(a) * r; this.pos[i * 3 + 1] = s[1]; this.pos[i * 3 + 2] = s[2] + Math.sin(a) * r;
    this.seed[i] = this.rand();
  }
  update(dt, t) {
    for (let i = 0; i < this.N; i++) {
      this.age[i] += dt;
      if (this.age[i] > this.life) { this.age[i] = 0; this.spawn(i); }
      const k = this.age[i] / this.life, sd = this.seed[i] * 6.283;
      this.pos[i * 3 + 1] += this.rise * (0.6 + this.seed[i] * 0.8) * dt * (this.fall ? 1 : 1 - k * 0.5);
      if (this.swirl) { this.pos[i * 3] += Math.cos(t * 1.4 + sd) * this.swirl * dt; this.pos[i * 3 + 2] += Math.sin(t * 1.4 + sd) * this.swirl * dt; }
      else { this.pos[i * 3] += Math.sin(t * 0.5 + sd) * 0.25 * dt; this.pos[i * 3 + 2] += Math.cos(t * 0.4 + sd) * 0.25 * dt; }
      const f = Math.sin(Math.min(1, k) * Math.PI); // fade in and out
      this.col[i * 3] = this.base.r * f; this.col[i * 3 + 1] = this.base.g * f; this.col[i * 3 + 2] = this.base.b * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}

const scaleN = (q, n) => Math.max(20, Math.round(n * Math.min(1, (q?.particles ?? 400) / 400)));
const at = (level, types) => level.entities.filter((e) => types.includes(e.type) && !e.dyn && !e.era).map((e) => [e.pos[0], e.pos[1], e.pos[2]]);

const HEROES = {
  chamber(level, q) {
    const B = levelBounds(level), g = new THREE.Group(), cx = (B.x0 + B.x1) / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.05, 6, 72), new THREE.MeshBasicMaterial({ color: 0xffe0a0, ...additive({ opacity: 0 }) }));
    ring.scale.y = 0.62; g.add(ring);
    const span = Math.max(30, Math.min(110, B.z1 - B.z0));
    return { group: g, update: (t) => {
      const k = (t % 16) / 16, e = k < 0.75 ? k / 0.75 : 1;
      ring.position.set(cx, 4.5, B.z1 - e * span); ring.material.opacity = k < 0.75 ? Math.sin(e * Math.PI) * 0.7 : 0;
    } };
  },
  machine(level, q) {
    const src = at(level, ['flywheel', 'conveyor']).map((p) => [p[0], 0.4, p[2]]);
    if (!src.length) return null;
    const p = new Plume(src, { count: scaleN(q, 260), color: 0xffc89a, size: 1.5, rise: 1.7, spread: 0.9, life: 4.2, opacity: 0.28 });
    return { group: (() => { const g = new THREE.Group(); g.add(p.points); return g; })(), update: (t, w, dt) => p.update(dt, t) };
  },
  absence(level, q) {
    const B = levelBounds(level), g = new THREE.Group(), n = scaleN(q, 70), rand = mulberry32(31);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.18, 0.35), new THREE.MeshStandardMaterial({ color: 0x8c8296, emissive: 0x241a3a, emissiveIntensity: 0.8, roughness: 0.9 }), n);
    const home = [];
    for (let i = 0; i < n; i++) home.push({ x: B.x0 + rand() * (B.x1 - B.x0), y: 1.2 + rand() * 7, z: B.z0 + rand() * (B.z1 - B.z0), ph: rand() * 6.28, sc: 0.6 + rand() * 1.6, sp: 0.2 + rand() * 0.5 });
    const m = new THREE.Matrix4(), e = new THREE.Euler(), qn = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    g.add(mesh);
    return { group: g, update: (t) => {
      for (let i = 0; i < n; i++) { const h = home[i];
        v.set(h.x + Math.sin(t * h.sp + h.ph) * 0.8, h.y + Math.sin(t * 0.6 + h.ph) * 0.5, h.z + Math.cos(t * h.sp + h.ph) * 0.8);
        qn.setFromEuler(e.set(t * h.sp + h.ph, t * 0.4 * h.sp, h.ph)); s.setScalar(h.sc); m.compose(v, qn, s); mesh.setMatrixAt(i, m); }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },
  acoustic(level, q) {
    const B = levelBounds(level), g = new THREE.Group();
    const src = at(level, ['resonator', 'carillon', 'pane']).map((p) => [p[0], 0.2, p[2]]);
    const parts = [];
    if (src.length) parts.push(new Plume(src, { count: scaleN(q, 160), color: 0x6ff0d4, size: 0.5, rise: 1.2, spread: 0.7, life: 3.6, swirl: 1.1, opacity: 0.8 }));
    // quiet falling light from the vault
    const rain = [], rand = mulberry32(5);
    for (let i = 0; i < 24; i++) rain.push([B.x0 + rand() * (B.x1 - B.x0), 10, B.z0 + rand() * (B.z1 - B.z0)]);
    parts.push(new Plume(rain, { count: scaleN(q, 110), color: 0xc8f4ff, size: 0.28, rise: 0.9, spread: 3, life: 9, opacity: 0.6, fall: true }));
    for (const p of parts) g.add(p.points);
    return { group: g, update: (t, w, dt) => parts.forEach((p) => p.update(dt, t)) };
  },
  observatory(level, q) {
    const B = levelBounds(level), g = new THREE.Group(), cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    const rings = [[80, 0xa8c8ff, 0.5], [105, 0xffd9a0, 0.4], [135, 0x9ff0e0, 0.32]].map(([r, c, o], i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.45 + i * 0.12, 8, 128), new THREE.MeshBasicMaterial({ color: c, ...additive({ opacity: o }) }));
      m.userData.axis = i; g.add(m); return m;
    });
    g.position.set(cx, 190, cz);
    const rand = mulberry32(88), meteors = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, ...additive({ opacity: 0 }) })); l.frustumCulled = false; g.add(l);
      meteors.push({ l, t0: -rand() * 10, dur: 1.4, dir: new THREE.Vector3(), from: new THREE.Vector3() });
    }
    return { group: g, update: (t) => {
      rings.forEach((r, i) => { r.rotation.x = t * (0.05 + i * 0.03) + i; r.rotation.y = t * (0.04 - i * 0.02) + i * 0.7; r.rotation.z = t * 0.02 * (i + 1); });
      for (const m of meteors) {
        const k = (t - m.t0) / m.dur;
        if (k > 1) { m.t0 = t + 4 + rand() * 9; m.from.set((rand() - 0.5) * 360, (rand() - 0.5) * 120 - 20, (rand() - 0.5) * 360); m.dir.set(rand() - 0.5, -0.25, rand() - 0.5).normalize(); continue; }
        if (k < 0) { m.l.material.opacity = 0; continue; }
        const head = m.from.clone().addScaledVector(m.dir, k * 160), tail = head.clone().addScaledVector(m.dir, -24);
        m.l.geometry.setFromPoints([tail, head]); m.l.material.opacity = Math.sin(k * Math.PI);
      }
    } };
  },
  record(level, q) {
    const B = levelBounds(level), g = new THREE.Group(), n = scaleN(q, 46), rand = mulberry32(7);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, side: THREE.DoubleSide, ...additive({ opacity: 0.3 }) });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.1), mat, n), home = [];
    for (let i = 0; i < n; i++) home.push({ x: B.x0 + rand() * (B.x1 - B.x0), y: 1 + rand() * 8, z: B.z0 + rand() * (B.z1 - B.z0), ph: rand() * 6.28, sp: 0.15 + rand() * 0.35 });
    const m = new THREE.Matrix4(), e = new THREE.Euler(), qn = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    g.add(mesh);
    return { group: g, update: (t) => {
      mat.opacity = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(t * 24) * Math.sin(t * 7.3)); // projector flicker
      for (let i = 0; i < n; i++) { const h = home[i];
        v.set(h.x + Math.sin(t * h.sp + h.ph) * 1.2, h.y + Math.sin(t * 0.5 + h.ph) * 0.6, h.z + Math.cos(t * h.sp + h.ph) * 1.2);
        qn.setFromEuler(e.set(0.3 * Math.sin(t * h.sp + h.ph), t * h.sp + h.ph, 0)); m.compose(v, qn, s); mesh.setMatrixAt(i, m); }
      mesh.instanceMatrix.needsUpdate = true;
    } };
  },
};

export function buildHero(theme, level, quality) {
  const h = (HEROES[theme] ?? (() => null))(level, quality);
  return h ?? { group: new THREE.Group(), update() {} };
}
