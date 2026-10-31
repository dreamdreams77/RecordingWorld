// Effects driven directly by simulation data: light beams, temporal-conflict shells, reconciliation
// outlines, the recording frame, recorded-volume outlines and (developer) trajectories.

import * as THREE from 'three';
import { SLOT_HUES, CONFLICT_COLOR, RECONCILED_COLOR, makeConflictMaterial } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);

export class BeamFX {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.core = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true);
    this.halo = new THREE.CylinderGeometry(0.16, 0.16, 1, 14, 1, true);
    this.pool = [];
  }
  seg(i) {
    if (!this.pool[i]) {
      const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const hm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const g = new THREE.Group(); g.add(new THREE.Mesh(this.core, cm), new THREE.Mesh(this.halo, hm));
      g.userData = { cm, hm }; this.group.add(g); this.pool[i] = g;
    }
    return this.pool[i];
  }
  update(world, time) {
    let n = 0;
    for (const b of world.beams) {
      const col = b.layer === 0 ? [0xdff3ff, 0xff4a4a, 0x58ff8a, 0x5a7aff][b.hue ?? 0] : SLOT_HUES[(b.layer - 1) % SLOT_HUES.length];
      for (let i = 0; i + 1 < b.pts.length; i++) {
        const a = b.pts[i], c = b.pts[i + 1];
        const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], len = Math.hypot(dx, dy, dz);
        if (len < 0.02) continue;
        const g = this.seg(n++);
        g.visible = true;
        g.position.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
        g.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx / len, dy / len, dz / len));
        g.scale.set(1, len, 1);
        g.userData.cm.color.setHex(col).multiplyScalar(2.2); g.userData.hm.color.setHex(col);
        g.userData.hm.opacity = 0.12 + 0.05 * Math.sin(time * 18 + i);
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}

export class ConflictFX {
  constructor(scene, timeUniform) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.mat = makeConflictMaterial(timeUniform);
    this.geo = new THREE.BoxGeometry(1, 1, 1);
    this.edgeGeo = new THREE.EdgesGeometry(this.geo);
    this.recMat = new THREE.LineBasicMaterial({ color: RECONCILED_COLOR, transparent: true, opacity: 0.95 });
    this.pool = []; this.lines = [];
  }
  update(world) {
    let n = 0, l = 0;
    for (const c of world.conflicts) {
      if (c.kind === 'state') {
        // reconciled: gold hairline around every collider of that entity
        for (const s of world.solids) {
          if (s.id !== c.id) continue;
          let o = this.lines[l];
          if (!o) { o = new THREE.LineSegments(this.edgeGeo, this.recMat); this.group.add(o); this.lines[l] = o; }
          l++;
          const b = s.b; o.visible = true;
          o.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
          o.scale.set(b.x1 - b.x0 + 0.06, b.y1 - b.y0 + 0.06, b.z1 - b.z0 + 0.06);
        }
        continue;
      }
      if (!c.box) continue;
      const m = this.pool[n] ?? (this.pool[n] = new THREE.Mesh(this.geo, this.mat));
      if (!m.parent) this.group.add(m);
      n++;
      const b = c.box; m.visible = true;
      m.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      m.scale.set(Math.max(0.15, b.x1 - b.x0) + 0.04, Math.max(0.15, b.y1 - b.y0) + 0.04, Math.max(0.15, b.z1 - b.z0) + 0.04);
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
    for (let i = l; i < this.lines.length; i++) this.lines[i].visible = false;
    return n;
  }
}

/** The recording frame: a drafting-style wireframe with corner brackets and 1 m ticks. */
export class FrameFX {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group); this.group.visible = false;
    this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
    this.fine = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat);
    this.ticks = new THREE.LineSegments(new THREE.BufferGeometry(), this.fine);
    this.lines.renderOrder = this.ticks.renderOrder = 999;
    this.group.add(this.lines, this.ticks);
    this.fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.BackSide }));
    this.group.add(this.fill);
  }
  set(volume, color, recording, time) {
    if (!volume) { this.group.visible = false; return; }
    this.group.visible = true;
    const v = volume, P = [];
    const xs = [v.x0, v.x1], ys = [v.y0, v.y1], zs = [v.z0, v.z1];
    const br = 0.7; // corner bracket length
    for (const x of xs) for (const y of ys) for (const z of zs) {
      const sx = x === v.x0 ? 1 : -1, sy = y === v.y0 ? 1 : -1, sz = z === v.z0 ? 1 : -1;
      const L = (a, b, c) => P.push(x, y, z, x + a, y + b, z + c);
      L(sx * Math.min(br, (v.x1 - v.x0) / 2), 0, 0); L(0, sy * Math.min(br, (v.y1 - v.y0) / 2), 0); L(0, 0, sz * Math.min(br, (v.z1 - v.z0) / 2));
    }
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    // thin full edges + metre ticks
    const T = [];
    const e = (p, q) => T.push(p[0], p[1], p[2], q[0], q[1], q[2]);
    for (const y of ys) for (const z of zs) e([v.x0, y, z], [v.x1, y, z]);
    for (const x of xs) for (const z of zs) e([x, v.y0, z], [x, v.y1, z]);
    for (const x of xs) for (const y of ys) e([x, y, v.z0], [x, y, v.z1]);
    for (let x = Math.ceil(v.x0); x <= v.x1; x++) for (const y of ys) for (const z of zs) e([x, y, z], [x, y + (y === v.y0 ? 0.18 : -0.18), z]);
    for (let z = Math.ceil(v.z0); z <= v.z1; z++) for (const y of ys) for (const x of xs) e([x, y, z], [x, y + (y === v.y0 ? 0.18 : -0.18), z]);
    for (let y = Math.ceil(v.y0); y <= v.y1; y++) for (const x of xs) for (const z of zs) e([x, y, z], [x + (x === v.x0 ? 0.18 : -0.18), y, z]);
    this.ticks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(T, 3));
    this.mat.color.setHex(color); this.fine.color.setHex(color);
    this.mat.opacity = recording ? 0.65 + 0.35 * Math.sin(time * 9) : 0.95;
    this.fill.material.color.setHex(color);
    this.fill.material.opacity = recording ? 0.07 + 0.03 * Math.sin(time * 9) : 0.035;
    this.fill.position.set((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, (v.z0 + v.z1) / 2);
    this.fill.scale.set(v.x1 - v.x0, v.y1 - v.y0, v.z1 - v.z0);
  }
}

/** Outlines of stored recordings' volumes plus (dev) the trajectories of recorded bodies. */
export class RecordingFX {
  constructor(scene) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.vols = []; this.trajs = new Map();
  }
  update(world, { showVolumes, showTraj, selected }) {
    const n = world.recordings.length;
    for (let s = 0; s < n; s++) {
      const rec = world.recordings[s], pb = world.playbacks[s];
      let o = this.vols[s];
      const want = rec && (showVolumes || s === selected) && pb;
      if (!want) { if (o) o.visible = false; continue; }
      if (!o) {
        o = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: SLOT_HUES[s % SLOT_HUES.length], transparent: true, opacity: 0.5 }));
        this.vols[s] = o; this.group.add(o);
      }
      const v = rec.volume; o.visible = true;
      o.position.set((v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, (v.z0 + v.z1) / 2);
      o.scale.set(v.x1 - v.x0, v.y1 - v.y0, v.z1 - v.z0);
      o.material.opacity = pb.active ? 0.8 : 0.28;
    }
    for (let s = n; s < this.vols.length; s++) if (this.vols[s]) this.vols[s].visible = false;
    // trajectories
    for (const [k, t] of this.trajs) if (!showTraj) t.visible = false;
    if (showTraj) {
      world.recordings.forEach((rec, s) => {
        if (!rec) return;
        for (const tr of rec.tracks.values()) {
          if (!tr.def || !['player', 'crate'].includes(tr.def.type)) continue;
          const key = `${rec.uid}|${s}|${tr.id}`;
          let line = this.trajs.get(key);
          if (!line) {
            const P = [];
            const tmp = new Float64Array(tr.nch);
            for (let t = 0; t < rec.length; t += 2) if (tr.sample(t, tmp)) P.push(tmp[0], tmp[1] + (tr.def.type === 'player' ? 0.3 : 0), tmp[2]);
            const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
            line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: SLOT_HUES[s % SLOT_HUES.length] }));
            this.trajs.set(key, line); this.group.add(line);
          }
          line.visible = true;
        }
      });
    }
  }
}

const NOTE_COLORS = [0xff5a5a, 0xffa13d, 0xffe14d, 0x74e07a, 0x45d6e0, 0x6c86ff, 0xc77dff];

/** Cymatic floor: every active sound source in the world draws expanding rings, coloured by note
 *  (present) or by recording slot (history). It is a literal view of the acoustic field the
 *  resonators hear, minus occlusion. */
export class SoundFieldFX {
  constructor(scene, b) {
    this.max = 8;
    const w = b.x1 - b.x0 + 24, d = b.z1 - b.z0 + 24;
    this.uniforms = { uTime: { value: 0 }, uSrc: { value: Array.from({ length: this.max }, () => new THREE.Vector4(0, 0, 0, 0)) }, uCol: { value: Array.from({ length: this.max }, () => new THREE.Color(1, 1, 1)) } };
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: this.uniforms,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: `uniform float uTime; uniform vec4 uSrc[8]; uniform vec3 uCol[8]; varying vec3 vW;
        void main(){ vec3 c = vec3(0.); 
          for (int i = 0; i < 8; i++) { vec4 s = uSrc[i]; if (s.w < 0.01) continue;
            float d = distance(vW.xz, s.xz); float k = 1.4 + s.y * 0.0; 
            float ring = pow(0.5 + 0.5 * sin(d * 2.4 - uTime * 4.0), 6.0);
            float fall = exp(-d * 0.11) * smoothstep(26.0, 6.0, d); 
            float cym = 0.5 + 0.5 * sin(vW.x * 3.0 * s.y) * sin(vW.z * 3.0 * s.y);
            c += uCol[i] * (ring * 0.55 + cym * 0.12) * fall * s.w; }
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    this.mesh.rotation.x = -Math.PI / 2; this.mesh.position.set((b.x0 + b.x1) / 2, 0.03, (b.z0 + b.z1) / 2); this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
  update(world, time) {
    this.uniforms.uTime.value = time;
    const S = this.uniforms.uSrc.value, C = this.uniforms.uCol.value;
    for (let i = 0; i < this.max; i++) {
      const s = world.sources[i];
      if (!s) { S[i].w = 0; continue; }
      S[i].set(s.pos[0], s.note, s.pos[2], 1);
      C[i].setHex(s.layer === 0 ? NOTE_COLORS[(s.note - 1) % 7] : SLOT_HUES[(s.layer - 1) % SLOT_HUES.length]);
    }
  }
}

/** Short-lived spatial feedback: an expanding shockwave ring plus a spray of sparks. Pooled; no per-frame allocation. */
export class BurstFX {
  constructor(scene) {
    this.rings = []; this.sparks = [];
    const rg = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.renderOrder = 6; scene.add(m); this.rings.push({ m, t: 1, dur: 1, size: 3, vertical: false });
    }
    const N = 96;
    this.N = N; this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.cols = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.cols, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.points.renderOrder = 6; scene.add(this.points);
    this.cursor = 0; this.ringCursor = 0; this.c = new THREE.Color();
  }
  /** kind: colour; size: ring radius in metres; sparks: how many particles. */
  emit(pos, { color = 0xe8c88a, size = 3, dur = 0.9, sparks = 18, vertical = false, speed = 3, inward = false } = {}) {
    if (!pos) return;
    const r = this.rings[this.ringCursor++ % this.rings.length];
    r.m.position.set(pos[0], pos[1], pos[2]); r.m.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    r.m.material.color.set(color); r.t = 0; r.dur = dur; r.size = size; r.vertical = vertical; r.inward = inward; r.m.visible = true;
    this.c.set(color);
    for (let i = 0; i < sparks; i++) {
      const k = this.cursor++ % this.N, a = Math.random() * Math.PI * 2, u = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random());
      this.pos.set(pos, k * 3);
      this.vel[k * 3] = Math.cos(a) * s * u; this.vel[k * 3 + 1] = (Math.random() * 0.8 + 0.2) * s; this.vel[k * 3 + 2] = Math.sin(a) * s * u;
      this.cols[k * 3] = this.c.r; this.cols[k * 3 + 1] = this.c.g; this.cols[k * 3 + 2] = this.c.b;
      this.life[k] = 0.6 + Math.random() * 0.7;
    }
  }
  update(dt, camera) {
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) { r.m.visible = false; continue; }
      const e = r.inward ? (1 - r.t) ** 2 : 1 - (1 - r.t) ** 3; // reverse and omit pull inward; everything else radiates
      r.m.scale.setScalar(0.2 + r.size * e); r.m.material.opacity = (r.inward ? r.t : 1 - r.t) * 0.8 + (r.inward ? 0.1 : 0);
      if (r.vertical) r.m.lookAt(camera.position);
    }
    let live = false;
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) { this.cols[k * 3] = this.cols[k * 3 + 1] = this.cols[k * 3 + 2] = 0; continue; }
      live = true; this.life[k] -= dt;
      this.vel[k * 3 + 1] -= 6 * dt;
      for (let j = 0; j < 3; j++) this.pos[k * 3 + j] += this.vel[k * 3 + j] * dt;
      const f = Math.max(0, this.life[k]) ; this.cols[k * 3] *= 0.97; this.cols[k * 3 + 1] *= 0.97; this.cols[k * 3 + 2] *= 0.97;
      if (f <= 0) { this.cols[k * 3] = this.cols[k * 3 + 1] = this.cols[k * 3 + 2] = 0; }
    }
    if (live) { this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true; }
  }
}

/** A fading ribbon behind each replaying player echo: where that history has just been. */
export class TrailFX {
  constructor(scene) {
    this.N = 70; this.lines = [];
    for (let s = 0; s < 6; s++) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(this.N * 3), col = new Float32Array(this.N * 3);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      line.frustumCulled = false; line.visible = false; line.renderOrder = 5; scene.add(line);
      const dots = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      dots.frustumCulled = false; dots.renderOrder = 5; line.add(dots);
      this.lines.push({ line, pos, col, n: 0, last: null, hue: new THREE.Color(SLOT_HUES[s]), tick: 0 });
    }
  }
  update(world) {
    const seen = new Set();
    for (const L of world.aliveList) {
      if (L.id !== 'player' || L.layer <= 0) continue;
      const t = this.lines[(L.layer - 1) % 6]; seen.add(t);
      const a = L.type.anchor(L.def, L.st), y = a[1] - 0.6;
      if (t.last && Math.hypot(a[0] - t.last[0], a[2] - t.last[2], y - t.last[1]) > 4) t.n = 0; // the head jumped (scrub / restart): drop the old ribbon
      if (!t.last || Math.hypot(a[0] - t.last[0], a[2] - t.last[2]) > 0.08 || t.tick++ % 4 === 0) {
        if (t.n < this.N) t.n++; else t.pos.copyWithin(0, 3);
        const k = (t.n - 1) * 3; t.pos[k] = a[0]; t.pos[k + 1] = y; t.pos[k + 2] = a[2]; t.last = [a[0], y, a[2]];
      }
      for (let i = 0; i < t.n; i++) { const f = ((i + 1) / t.n) ** 0.6 * 1.3; t.col[i * 3] = t.hue.r * f; t.col[i * 3 + 1] = t.hue.g * f; t.col[i * 3 + 2] = t.hue.b * f; }
      t.line.geometry.setDrawRange(0, t.n); t.line.geometry.attributes.position.needsUpdate = true; t.line.geometry.attributes.color.needsUpdate = true; t.line.visible = t.n > 1;
    }
    for (const t of this.lines) if (!seen.has(t)) { t.n = 0; t.last = null; t.line.visible = false; }
  }
}

/**
 * The preview ghost: where every recorded object will be at the moment under the reel's cursor, drawn in the actual 3D
 * scene. It reads the recording's tracks into scratch buffers (Recording.sampleAll) — no world copy, no entity views, no
 * allocation per frame. Objects whose state differs from the present (a door that will be open, a plate that will be
 * down) glow and carry a label, because those are the ones that will change the world when the echo plays.
 * Legibility rules: edges have a fixed world-space thickness with a dark under-stroke so they read on pale and dark
 * walls alike; fills are faint and depth-tested so the present is never hidden; only the player ghost and its feet ring
 * ignore depth, so you can always find where you will be standing.
 */
const GHOST_VERT = `varying vec3 vP, vS, vN, vV, vW;
  void main(){ vP = position; vS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const BOX_FRAG = `uniform vec3 uColor; uniform float uHot, uTime; varying vec3 vP, vS, vN, vV, vW;
  void main(){
    vec3 d = (0.5 - abs(vP)) * vS;                                   // world-space distance to each face plane
    float ed = min(min(max(d.x, d.y), max(d.y, d.z)), max(d.x, d.z)); // world-space distance to the nearest box edge
    float w = 0.045;
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    vec3 bright = uColor * (1.15 + 0.7 * uHot) + vec3(0.12) * uHot;
    if (ed < w * 0.45) { gl_FragColor = vec4(0.05, 0.04, 0.035, 0.85); return; }          // dark under-stroke: reads on pale walls
    if (ed < w)        { gl_FragColor = vec4(bright, 0.97); return; }                       // bright edge
    float scan = 0.85 + 0.15 * step(0.5, fract(vW.y * 9.0 - uTime * 0.25 * (1.0 - uHot))); // faint film-gate banding
    gl_FragColor = vec4(uColor * 1.1, (0.09 + 0.16 * uHot + 0.08 * rim) * scan);
  }`;
const BODY_FRAG = `uniform vec3 uColor; uniform float uHot, uTime; varying vec3 vP, vS, vN, vV, vW;
  void main(){
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    float band = 0.8 + 0.2 * step(0.5, fract(vW.y * 14.0 - uTime * 0.3));
    gl_FragColor = vec4(uColor * (1.2 + 0.8 * rim) + vec3(0.1) * uHot, (0.16 + 0.72 * rim) * band);
  }`;
const XRAY_FRAG = `uniform vec3 uColor; uniform float uHot, uTime; varying vec3 vP, vS, vN, vV, vW;
  void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4); gl_FragColor = vec4(uColor * 1.3, 0.10 + 0.34 * rim); }`;
const ghostMat = (frag, extra = {}) => new THREE.ShaderMaterial({ vertexShader: GHOST_VERT, fragmentShader: frag, transparent: true, depthWrite: false, fog: false,
  uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uHot: { value: 0 }, uTime: { value: 0 } }, ...extra });
const labelCache = new Map();
function labelTexture(text, hot) {
  const key = text + (hot ? '*' : ''); let t = labelCache.get(key); if (t) return t;
  const c = document.createElement('canvas'), g = c.getContext('2d'); c.width = 256; c.height = 52;
  g.font = '600 24px ui-monospace, Menlo, Consolas, monospace'; const w = Math.min(248, g.measureText(text).width + 22);
  g.fillStyle = 'rgba(10,9,8,.86)'; g.fillRect(128 - w / 2, 6, w, 40);
  g.strokeStyle = hot ? '#fff1c0' : '#c8b898'; g.lineWidth = 2; g.strokeRect(128 - w / 2, 6, w, 40);
  g.fillStyle = hot ? '#fff1c0' : '#e8dcc0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 27);
  t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; labelCache.set(key, t); return t;
}
export class GhostFX {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.boxMat = ghostMat(BOX_FRAG); this.hotMat = ghostMat(BOX_FRAG); this.hotMat.uniforms.uHot.value = 1;
    this.pool = [];
    for (let i = 0; i < 72; i++) { const m = new THREE.Mesh(this.box, this.boxMat); m.visible = false; m.renderOrder = 7; this.group.add(m); this.pool.push(m); }
    this.bodyMat = ghostMat(BODY_FRAG); this.bodyHot = ghostMat(BODY_FRAG); this.bodyHot.uniforms.uHot.value = 1;
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0x0d0b09, transparent: true, opacity: 0.5, side: THREE.BackSide, depthWrite: false, fog: false });
    const cap = new THREE.CapsuleGeometry(0.3, 1.2, 4, 16);
    this.body = new THREE.Mesh(cap, this.bodyMat); this.body.renderOrder = 8; this.body.visible = false; this.group.add(this.body);
    this.outline = new THREE.Mesh(cap, this.outlineMat); this.outline.scale.setScalar(1.045); this.outline.renderOrder = 7; this.outline.visible = false; this.group.add(this.outline);
    // x-ray: where you will be standing stays findable behind walls, as a faint silhouette
    this.xray = new THREE.Mesh(cap, ghostMat(XRAY_FRAG, { depthFunc: THREE.GreaterDepth, depthTest: true })); this.xray.renderOrder = 6; this.xray.visible = false; this.group.add(this.xray);
    this.nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), this.bodyMat); this.nose.rotation.x = -Math.PI / 2; this.nose.visible = false; this.nose.renderOrder = 8; this.group.add(this.nose);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.renderOrder = 9; this.ring.visible = false; this.group.add(this.ring);
    this.ringDark = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.6, 40), new THREE.MeshBasicMaterial({ color: 0x0d0b09, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
    this.ringDark.rotation.x = -Math.PI / 2; this.ringDark.renderOrder = 8; this.ringDark.visible = false; this.group.add(this.ringDark);
    this.labels = []; for (let i = 0; i < 8; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false })); sp.scale.set(2.2, 0.45, 1); sp.renderOrder = 10; sp.visible = false; this.group.add(sp); this.labels.push(sp); }
    this.hue = new THREE.Color(0xffa94d);
  }
  /** @param ghost {entries, slot, world, near: Set<id>} or null */
  update(ghost, clock) {
    if (!ghost) { this.group.visible = false; return; }
    this.group.visible = true;
    const w = ghost.world;
    this.hue.set(SLOT_HUES[ghost.slot % SLOT_HUES.length]);
    for (const m of [this.boxMat, this.hotMat, this.bodyMat, this.bodyHot, this.xray.material]) { m.uniforms.uColor.value.copy(this.hue); m.uniforms.uTime.value = clock; }
    this.ring.material.color.copy(this.hue);
    let n = 0, nl = 0, player = false;
    for (const e of ghost.entries) {
      if (!e.alive) continue;
      const d = e.def; if (d.pos && d.pos[1] < -40) continue; // logic nodes have no place in the world
      const a = e.type.anchor(d, e.st), name = e.type.name;
      const k = e.type.keyCh, differing = differs(w, e), hot = differing || ghost.near.has(e.id);
      if (name === 'player') {
        player = true; const m = hot ? this.bodyHot : this.bodyMat;
        this.body.material = m; this.nose.material = m;
        this.body.visible = this.outline.visible = this.nose.visible = this.ring.visible = this.ringDark.visible = true;
        this.body.position.set(a[0], a[1], a[2]); this.outline.position.copy(this.body.position); this.xray.visible = true; this.xray.position.copy(this.body.position);
        this.nose.position.set(a[0] - Math.sin(e.st[6]) * 0.42, a[1] + 0.35, a[2] - Math.cos(e.st[6]) * 0.42); this.nose.rotation.set(-Math.PI / 2, 0, 0); this.nose.rotation.order = 'YXZ'; this.nose.rotation.y = e.st[6];
        this.ring.position.set(a[0], a[1] - 0.88, a[2]); this.ringDark.position.copy(this.ring.position);
        if (nl < this.labels.length) this.label(nl++, a[0], a[1] + 1.35, a[2], 'YOU, THEN', true);
        continue;
      }
      if (n >= this.pool.length) break;
      const s = e.type.size(d); if (!s) continue;
      const m = this.pool[n++]; m.visible = true; m.position.set(a[0], a[1], a[2]); m.scale.set(Math.max(0.06, s[0]), Math.max(0.06, s[1]), Math.max(0.06, s[2]));
      m.material = hot ? this.hotMat : this.boxMat;
      if (differing && nl < this.labels.length) this.label(nl++, a[0], a[1] + Math.max(0.5, s[1] / 2 + 0.4), a[2], `${shortName(name)} ${stateWord(name, e.st[k] > 0.5)}`, true);
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].visible = false;
    for (let i = nl; i < this.labels.length; i++) this.labels[i].visible = false;
    if (!player) this.body.visible = this.outline.visible = this.nose.visible = this.ring.visible = this.ringDark.visible = this.xray.visible = false;
  }
  label(i, x, y, z, text, hot) {
    const sp = this.labels[i]; sp.visible = true; sp.position.set(x, y, z);
    const t = labelTexture(text, hot); if (sp.material.map !== t) { sp.material.map = t; sp.material.needsUpdate = true; }
  }
}
const SHORT = { slider: 'DOOR', descender: 'LIFT', plate: 'PLATE', lever: 'LEVER', watcher: 'EYE', resonator: 'RESONATOR', crate: 'CRATE', sensor: 'SENSOR', flywheel: 'FLYWHEEL', gate: 'GATE', crumble: 'FLOOR', pane: 'GLASS' };
const shortName = (n) => SHORT[n] ?? n.toUpperCase();
function stateWord(name, on) {
  switch (name) {
    case 'plate': return on ? 'DOWN' : 'UP'; case 'slider': case 'descender': return on ? 'OPEN' : 'SHUT'; case 'watcher': return on ? 'SEES' : 'BLIND';
    case 'lever': return on ? 'ON' : 'OFF'; case 'resonator': return on ? 'RINGING' : 'SILENT'; case 'flywheel': return on ? 'SPINNING' : 'STILL'; case 'sensor': return on ? 'LIT' : 'DARK';
    default: return on ? 'ON' : 'OFF';
  }
}
function differs(w, e) { // does this object's recorded state differ from the present one? (the ones that will change the world)
  const P = w.byId.get(e.id); if (!P || P.type !== e.type) return false;
  const k = e.type.keyCh; if (k < 0) return false;
  return (P.st[k] > 0.5) !== (e.st[k] > 0.5);
}
