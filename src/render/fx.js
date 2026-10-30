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
      const col = b.layer === 0 ? 0xdff3ff : SLOT_HUES[(b.layer - 1) % SLOT_HUES.length];
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
