// Entity views: maps simulation entities (present and echo) to Three.js objects and keeps them in sync.
// Echo views reuse the same geometry but swap every material for a per-item "emulsion" material, so a
// historical door is recognisably a door — made of a different kind of light.

import * as THREE from 'three';
import { boxGeometry, SLOT_HUES, makeConflictMaterial } from './materials.js';
import { lerp } from '../sim/math.js';
import { PLAYER_SIZE } from '../sim/types.js';

const NOTE_HUES = [0xff5a5a, 0xffa13d, 0xffe14d, 0x74e07a, 0x45d6e0, 0x6c86ff, 0xc77dff];
const _v = new THREE.Vector3(), _c = new THREE.Color();
const HUE_COLORS = [0xdff3ff, 0xff4a4a, 0x58ff8a, 0x5a7aff];

function box(mat, sx, sy, sz, x = 0, y = 0, z = 0, tile = 4) {
  const m = new THREE.Mesh(boxGeometry(sx, sy, sz, tile), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function emissiveMat(color, intensity = 2) {
  return new THREE.MeshStandardMaterial({ color: 0x050505, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
}

// ------------------------------------------------------------------ builders
// Each returns { root, update(L, ctx) }. `ctx` = { lib, theme, world, time, dt, lights }.
const BUILD = {
  wall(L, ctx) {
    const d = L.def, s = d.size, skinName = d.skin ?? 'wall';
    const mat = d.glass ? ctx.lib.glass(0x9fc0d0) : ctx.lib.skin(ctx.theme, skinName === 'door' ? 'metal' : skinName);
    const tile = mat.userData.tile ?? 4;
    const g = boxGeometry(s[0], s[1], s[2], tile, d.pos[0], d.pos[1], d.pos[2]);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = !d.glass; m.receiveShadow = true;
    m.position.set(d.pos[0], d.pos[1], d.pos[2]);
    m.matrixAutoUpdate = false; m.updateMatrix();
    const root = new THREE.Group(); root.add(m); root.userData.static = true;
    return { root, update() {}, static: true };
  },
  slider(L, ctx) {
    if (L.def.hazard) return BUILD.hazard(L, ctx);
    const d = L.def, s = d.size, isDoor = (d.mode ?? 'door') === 'door';
    const root = new THREE.Group();
    const slab = box(ctx.lib.skin(ctx.theme, isDoor ? 'door' : 'bridge'), s[0], s[1], s[2], 0, 0, 0, ctx.lib.skin(ctx.theme, isDoor ? 'door' : 'bridge').userData.tile);
    root.add(slab);
    const strip = new THREE.Mesh(boxGeometry(isDoor ? s[0] * 0.8 : s[0] * 1.004, 0.06, isDoor ? 0.04 : s[2] * 1.004, 1), emissiveMat(0xffffff, 1.5));
    strip.position.set(0, isDoor ? s[1] * 0.45 : s[1] / 2 + 0.01, isDoor ? s[2] / 2 + 0.01 : 0);
    root.add(strip);
    if (isDoor) { const s2 = strip.clone(); s2.position.z = -s[2] / 2 - 0.01; root.add(s2); }
    else { // bridge: glowing side rails
      for (const sx of [-1, 1]) { const r = new THREE.Mesh(boxGeometry(0.08, 0.08, s[2], 1), emissiveMat(0xffb060, 2.4)); r.position.set(sx * (s[0] / 2 - 0.04), s[1] / 2, 0); root.add(r); }
    }
    return {
      root, slab, strip,
      update(L, ctx, view) {
        const st = L.st, a = L.type.anchor(L.def, st);
        root.position.set(a[0], a[1], a[2]);
        const open = st[0] > 0.5;
        const col = view.echoSlot !== null ? SLOT_HUES[view.echoSlot % SLOT_HUES.length] : (isDoor ? (st[0] > 0.98 ? 0x7fffd0 : st[0] > 0.02 ? 0xffc060 : 0xff6a5a) : (st[0] > 0.98 ? 0xffd9a0 : 0x7a8aa0));
        if (view.echoSlot === null) { strip.material.emissive.setHex(col); strip.material.emissiveIntensity = 1.2 + st[0] * 1.5; }
        // a present door overruled by an echo shows interference instead of solid matter
        if (view.echoSlot === null && isDoor) {
          const over = ctx.world.overruled.has(L.id);
          if (over !== view.over) { view.over = over; slab.material = over ? ctx.conflictMat : ctx.lib.skin(ctx.theme, 'door'); }
        }
      },
    };
  },
  crate(L, ctx) {
    const d = L.def, s = d.size ?? [1, 1, 1];
    const root = new THREE.Group();
    const mat = ctx.lib.skin(ctx.theme, 'crate');
    root.add(box(mat, s[0], s[1], s[2], 0, 0, 0, 1.5));
    const frame = ctx.lib.skin(ctx.theme, 'metal');
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) root.add(box(frame, 0.12, s[1] + 0.04, 0.12, sx * (s[0] / 2), 0, sz * (s[2] / 2), 1));
    for (const sy of [-1, 1]) { root.add(box(frame, s[0] + 0.04, 0.1, 0.12, 0, sy * s[1] / 2, s[2] / 2, 1)); root.add(box(frame, s[0] + 0.04, 0.1, 0.12, 0, sy * s[1] / 2, -s[2] / 2, 1)); }
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), emissiveMat(0xffd9a0, 1.8)); lens.position.set(0, 0, s[2] / 2 + 0.02); root.add(lens);
    return { root, update(L) { root.position.set(L.st[0], L.st[1], L.st[2]); } };
  },
  plate(L, ctx) {
    const d = L.def, s = d.size ?? [2, 0.12, 2];
    const root = new THREE.Group();
    const base = box(ctx.lib.skin(ctx.theme, 'metal'), s[0] + 0.3, 0.1, s[2] + 0.3, 0, 0.02, 0, 2);
    const top = box(ctx.lib.skin(ctx.theme, 'bridge'), s[0] - 0.1, 0.1, s[2] - 0.1, 0, 0, 0, 2);
    const ringMat = emissiveMat(0x9fd8ff, 1.2);
    const ring = new THREE.Group();
    for (const [w, dd, x, z] of [[s[0] - 0.1, 0.07, 0, (s[2] - 0.1) / 2], [s[0] - 0.1, 0.07, 0, -(s[2] - 0.1) / 2], [0.07, s[2] - 0.1, (s[0] - 0.1) / 2, 0], [0.07, s[2] - 0.1, -(s[0] - 0.1) / 2, 0]]) {
      const b = new THREE.Mesh(boxGeometry(w, 0.03, dd, 1), ringMat); b.position.set(x, 0.055, z); ring.add(b);
    }
    root.add(base, top, ring);
    root.position.set(d.pos[0], d.pos[1] + 0.06, d.pos[2]);
    return {
      root, update(L, ctx, view) {
        const p = L.st[0];
        top.position.y = -0.03 * p;
        ring.position.y = -0.03 * p;
        if (view.echoSlot === null) { ringMat.emissive.setHex(p ? 0xffc470 : 0x9fd8ff); ringMat.emissiveIntensity = p ? 3.0 : 1.0; }
      },
    };
  },
  lever(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const ped = box(ctx.lib.skin(ctx.theme, 'metal'), 0.5, 1.0, 0.5, 0, -0.4, 0, 2);
    root.add(ped);
    const bulbMat = emissiveMat(0xff6a5a, 2);
    if (d.button) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 24), bulbMat); cap.position.y = 0.16; root.add(cap);
      return { root, update(L, ctx, view) { root.position.set(d.pos[0], d.pos[1], d.pos[2]); cap.position.y = 0.16 - 0.06 * L.st[0]; if (view.echoSlot === null) { bulbMat.emissive.setHex(L.st[0] ? 0xffd070 : 0xff6a5a); bulbMat.emissiveIntensity = L.st[0] ? 3.5 : 1.4; } } };
    }
    const arm = new THREE.Group(); arm.position.y = 0.12;
    const rod = box(ctx.lib.skin(ctx.theme, 'crate'), 0.07, 0.62, 0.07, 0, 0.31, 0, 1);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), bulbMat); knob.position.y = 0.66;
    arm.add(rod, knob); root.add(arm);
    return { root, update(L, ctx, view) {
      root.position.set(d.pos[0], d.pos[1], d.pos[2]);
      const target = L.st[0] ? -0.7 : 0.7; arm.rotation.z += (target - arm.rotation.z) * Math.min(1, ctx.dt * 14);
      if (view.echoSlot === null) { bulbMat.emissive.setHex(L.st[0] ? 0x7fffd0 : 0xff6a5a); bulbMat.emissiveIntensity = L.st[0] ? 3 : 1.4; }
    } };
  },
  flywheel(L, ctx) {
    const d = L.def, s = d.size ?? [2, 2, 2], root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), s[0], s[1], s[2], 0, 0, 0, 2));
    const wheel = new THREE.Group(); wheel.position.set(0, 0, s[2] / 2 + 0.12);
    const brass = ctx.lib.skin(ctx.theme, 'crate');
    const rim = new THREE.Mesh(new THREE.TorusGeometry(s[0] * 0.42, 0.09, 12, 48), brass); rim.castShadow = true; wheel.add(rim);
    for (let i = 0; i < 6; i++) { const sp = box(brass, 0.08, s[0] * 0.84, 0.08, 0, 0, 0, 1); sp.rotation.z = (i / 6) * Math.PI; wheel.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 20), brass); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const glowMat = emissiveMat(0xffa94d, 0);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(s[0] * 0.42, 0.035, 8, 48), glowMat); wheel.add(glow);
    root.add(wheel);
    return { root, update(L, ctx, view) {
      root.position.set(d.pos[0], d.pos[1], d.pos[2]);
      wheel.rotation.z = -L.st[1];
      glowMat.emissiveIntensity = L.st[0] * 5; if (view.echoSlot === null) glowMat.emissive.setHex(L.st[0] > 0.45 ? 0x7fffd0 : 0xffa94d);
    } };
  },
  conveyor(L, ctx) {
    const d = L.def, s = d.size ?? [2, 0.4, 6], root = new THREE.Group();
    const base = box(ctx.lib.skin(ctx.theme, 'metal'), s[0], s[1], s[2], 0, 0, 0, 2);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.7, metalness: 0.2, map: stripeTexture() });
    beltMat.map.repeat.set(1, s[2] / 0.8);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(s[0] - 0.3, 0.05, s[2] - 0.1), beltMat); belt.position.y = s[1] / 2 + 0.005; belt.receiveShadow = true;
    const chev = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), emissiveMat(0xffa94d, 1));
    root.add(base, belt);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    root.rotation.y = Math.atan2(d.dir[0], d.dir[1]) + Math.PI; // belt texture runs along local -z... orient to direction
    root.rotation.y = Math.atan2(-d.dir[0], -d.dir[1]);
    let off = 0;
    return { root, update(L, ctx) { off += L.st[0] * (d.speed ?? 1.4) * ctx.dt / 0.8; beltMat.map.offset.y = off; beltMat.emissive.setHex(0xffa94d); beltMat.emissiveIntensity = L.st[0] * 0.15; } };
  },
  lamp(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const m = emissiveMat(0xfff0d0, 3);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), m);
    root.add(bulb);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return { root, update(L, ctx, view) {
      m.emissiveIntensity = L.st[0] ? 3.5 : 0.1;
      if (L.st[0]) ctx.lights.request(d.pos, view.echoSlot === null ? 0xfff0d0 : SLOT_HUES[view.echoSlot % SLOT_HUES.length], d.power ?? 14, d.range ?? 16);
    } };
  },
  emitter(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const hue = NOTE_HUES[((d.note ?? 1) - 1) % 7];
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.5, 0.5, 0.5, 0, -0.1, 0, 1));
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 28, 1, true), ctx.lib.skin(ctx.theme, 'crate'));
    horn.rotation.x = -Math.PI / 2; horn.position.set(0, 0.1, 0.3); horn.material = horn.material.clone(); horn.material.side = THREE.DoubleSide; root.add(horn);
    const rm = emissiveMat(hue, 0);
    const rings = [0, 1, 2].map((i) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 36), rm); r.position.set(0, 0.1, 0.6); root.add(r); return r; });
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), emissiveMat(hue, 2.5)); pip.position.set(0, 0.42, 0); root.add(pip);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    root.rotation.y = d.facing ?? 0;
    return { root, update(L, ctx) {
      rm.emissiveIntensity = L.st[0] ? 3 : 0;
      rings.forEach((r, i) => { const ph = (ctx.time * 1.4 + i / 3) % 1; const sc = 1 + ph * 3.2; r.scale.setScalar(L.st[0] ? sc : 0.001); r.position.z = 0.55 + ph * 1.6; rm.opacity = 1; });
    } };
  },
  resonator(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), ctx.lib.skin(ctx.theme, 'crate'));
    bowl.rotation.x = Math.PI; bowl.position.y = 0.1; bowl.castShadow = true; bowl.material = bowl.material.clone(); bowl.material.side = THREE.DoubleSide;
    root.add(bowl, box(ctx.lib.skin(ctx.theme, 'metal'), 0.12, 0.5, 0.12, 0, -0.25, 0, 1));
    const want = d.want ?? (d.seq ?? [d.note ?? 1]);
    const coreMat = emissiveMat(0xffffff, 0);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 2), coreMat); core.position.y = 0.12; root.add(core);
    want.forEach((n, i) => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), emissiveMat(NOTE_HUES[(n - 1) % 7], 2.5)); const a = (i / want.length) * Math.PI * 2; p.position.set(Math.cos(a) * 0.36, 0.43, Math.sin(a) * 0.36); root.add(p); });
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return { root, update(L, ctx, view) {
      const c = L.st[0]; coreMat.emissiveIntensity = 0.3 + c * 5; if (view.echoSlot === null) coreMat.emissive.setHex(c >= 1 ? 0x7fffd0 : 0xffffff);
      core.scale.setScalar(0.8 + c * 0.5 + Math.sin(ctx.time * 6) * 0.05 * (L.st[3] > 0 ? 1 : 0));
      core.rotation.y = ctx.time * (1 + c * 3);
    } };
  },
  beam(L, ctx) {
    const d = L.def, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.8, 0.8, 0.8, 0, 0, 0, 1));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.2, 24), emissiveMat(0xdff3ff, 3));
    lens.rotation.x = Math.PI / 2; lens.position.z = -0.4; root.add(lens);
    root.position.set(d.pos[0], d.pos[1] - 0.0, d.pos[2]);
    const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]], dd = dirs[(d.dir ?? 0) & 3];
    root.rotation.y = Math.atan2(-dd[0], -dd[1]);
    return { root, update(L) { lens.material.emissiveIntensity = L.st[0] ? 4 : 0.1; } };
  },
  mirror(L, ctx) {
    const d = L.def, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'crate'), 0.4, 0.5, 0.4, 0, -0.45, 0, 1));
    const pane = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 1, envMapIntensity: 2.5 }));
    glass.castShadow = true;
    const frame = box(ctx.lib.skin(ctx.theme, 'crate'), 1.35, 1.15, 0.04, 0, 0, -0.02, 1);
    pane.add(frame, glass); pane.position.y = 0.2; root.add(pane);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    pane.rotation.y = L.st[0] > 0.5 ? Math.PI / 4 : -Math.PI / 4;
    return { root, update(L, ctx) {
      const t = L.st[0] > 0.5 ? Math.PI / 4 : -Math.PI / 4;
      pane.rotation.y += (t - pane.rotation.y) * Math.min(1, ctx.dt * 10);
    } };
  },
  sensor(L, ctx) {
    const d = L.def, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.7, 0.7, 0.7, 0, 0, 0, 1));
    const lm = emissiveMat(d.hue ? HUE_COLORS[d.hue] : 0xff6a5a, 1);
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 12, 28), lm); lens.position.z = 0.36; root.add(lens);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), emissiveMat(0x000000, 0)); eye.position.z = 0.37; root.add(eye);
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    root.rotation.y = d.facing ?? 0;
    return { root, update(L, ctx, view) { lm.emissiveIntensity = L.st[0] ? 4 : 1; if (view.echoSlot === null) lm.emissive.setHex(d.hue ? HUE_COLORS[d.hue] : (L.st[0] ? 0x7fffd0 : 0xff6a5a)); } };
  },
  // An Eye: a heavy iris housing. Amber and half-closed while it sees nobody; a red, wide-open pupil and a sight-line
  // to whoever it is watching when it sees a Recollector.
  watcher(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const metal = ctx.lib.skin(ctx.theme, 'metal');
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), metal);
    shell.rotation.x = Math.PI / 2; shell.castShadow = true; root.add(shell);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 10, 32), ctx.lib.skin(ctx.theme, 'crate')); ring.position.z = 0.2; root.add(ring);
    const irisM = emissiveMat(0xffb04d, 1.4), iris = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), irisM); iris.position.z = 0.22; root.add(iris);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.1, 24), new THREE.MeshBasicMaterial({ color: 0x050505 })); pupil.position.z = 0.225; root.add(pupil);
    const lidM = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
    const lidT = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24, 0, Math.PI), lidM), lidB = lidT.clone(); lidB.rotation.z = Math.PI;
    lidT.position.z = lidB.position.z = 0.24; root.add(lidT, lidB);
    const beamM = new THREE.LineBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending });
    const beamG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    const beam = new THREE.Line(beamG, beamM); beam.frustumCulled = false;
    root.position.set(d.pos[0], d.pos[1], d.pos[2]); root.rotation.y = d.facing ?? 0;
    const holder = new THREE.Group(); holder.add(root, beam);
    const tmp = new THREE.Vector3(); let open = 0;
    return { root: holder, update(L, ctx, view) {
      const sees = L.st[0] > 0.5; open += ((sees ? 1 : 0.25) - open) * 0.2;
      lidT.position.y = 0.05 + open * 0.24; lidB.position.y = -0.05 - open * 0.24; lidT.scale.y = lidB.scale.y = 1 - open * 0.7;
      irisM.emissive.setHex(sees ? 0xff3b2f : 0xffb04d); irisM.emissiveIntensity = sees ? 4 + Math.sin(ctx.time * 18) : 1.2;
      pupil.scale.setScalar(sees ? 0.6 : 1.3);
      // the sight-line to the watched Recollector (present or echo)
      const who = L.st[1], w = ctx.world;
      const P = sees && w ? w.aliveList.find((x) => x.type.name === 'player' && x.layer === who) : null;
      if (P && view.echoSlot === null) { beamG.setFromPoints([tmp.set(d.pos[0], d.pos[1], d.pos[2]).clone(), new THREE.Vector3(P.st[0], P.st[1] + 0.3, P.st[2])]); beamM.opacity = 0.35 + 0.15 * Math.sin(ctx.time * 20); }
      else beamM.opacity = 0;
    } };
  },
  // The Recollector, as seen from outside: a tall lens-column with counter-rotating rings.
  player(L, ctx) {
    const root = new THREE.Group();
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.06 + Math.sin(Math.pow(t, 0.7) * Math.PI) * 0.26, (t - 0.5) * 1.5)); }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), ctx.lib.skin(ctx.theme, 'metal')); body.castShadow = true; root.add(body);
    const lensM = emissiveMat(0xffffff, 3);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), lensM); lens.position.set(0, 0.3, 0.2); root.add(lens);
    const rings = [0.35, 0.6, 0.85].map((r, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(0.34 + i * 0.05, 0.018, 8, 40), ctx.lib.skin(ctx.theme, 'crate')); m.position.y = -0.35 + i * 0.3; m.castShadow = true; root.add(m); return m; });
    return { root, update(L, ctx) {
      root.position.set(L.st[0], L.st[1], L.st[2]); root.rotation.y = L.st[6];
      rings.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(ctx.time * (1 + i * 0.4) + i) * 0.35; r.rotation.y = ctx.time * (i % 2 ? 1 : -1) * 0.8; });
      lensM.emissiveIntensity = 2.5 + (L.st[8] > 0 ? 3 + Math.sin(ctx.time * 30) * 2 : 0);
      root.position.y -= 0.05 + Math.sin(ctx.time * 2 + L.st[0]) * 0.02;
    } };
  },
  hazard(L, ctx) { // matter that hurts: hot warning stripes and a pulsing core
    const d = L.def, sz = d.size, root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a0c08, emissive: 0xff5a1f, emissiveIntensity: 2, roughness: 0.4, metalness: 0.6, map: hazardTexture() });
    mat.map.repeat.set(Math.max(1, sz[0] / 1.2), Math.max(1, sz[2] / 1.2));
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[1], sz[2]), mat); m.castShadow = true; root.add(m);
    root.add(new THREE.Mesh(new THREE.BoxGeometry(sz[0] * 1.002, Math.min(0.08, sz[1]), sz[2] * 1.002), emissiveMat(0xffd0a0, 1.2)));
    return { root, update(L, ctx) {
      const a = L.type.anchor(L.def, L.st); root.position.set(a[0], a[1], a[2]);
      root.visible = L.st[0] > 0.02;
      mat.emissiveIntensity = 0.7 + 0.45 * Math.sin(ctx.time * 9); mat.map.offset.x = ctx.time * 0.2;
    } };
  },
  crumble(L, ctx) {
    const d = L.def, sz = d.size ?? [4, 0.5, 4], root = new THREE.Group();
    const mat = ctx.lib.skin(ctx.theme, 'bridge').clone();
    const slab = box(mat, sz[0], sz[1], sz[2], 0, 0, 0, 3); root.add(slab);
    const crack = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a2a, emissiveIntensity: 0 });
    const lines = new THREE.Mesh(new THREE.BoxGeometry(sz[0] * 1.004, 0.03, sz[2] * 1.004), crack); lines.position.y = sz[1] / 2 + 0.01; root.add(lines);
    return { root, update(L, ctx) {
      const k = L.st[0]; root.visible = k > 0.02;
      crack.emissiveIntensity = (1 - k) * 4 + L.st[1] * 1.5;
      const shake = L.st[1] > 0.5 ? 0.03 : 0;
      root.position.set(d.pos[0] + Math.sin(ctx.time * 80) * shake, d.pos[1] - (1 - k) * 0.25, d.pos[2] + Math.cos(ctx.time * 73) * shake);
      if (mat.emissive) { mat.emissive.setHex(0xff5a1f); mat.emissiveIntensity = (1 - k) * 0.6; }
    } };
  },
  descender(L, ctx) {
    const d = L.def, z = d.size, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'bridge'), z[0], z[1], z[2], 0, 0, 0, 3));
    const cm = emissiveMat(0xffc070, 2.2);
    for (let i = -1; i <= 1; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), cm); c.position.set(i * Math.min(1.6, z[0] / 3), z[1] / 2 + 0.06, 0); c.rotation.x = Math.PI; c.scale.set(1, 0.25, 1); root.add(c); }
    return { root, update(L, ctx) { const a = L.type.anchor(L.def, L.st); root.position.set(a[0], a[1], a[2]); cm.emissiveIntensity = 1.2 + 1.3 * Math.abs(Math.sin(ctx.time * 2)) * (L.st[0] < 0.99 ? 1 : 0.2); } };
  },
  carillon(L, ctx) {
    const d = L.def, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.9, 0.5, 0.9, 0, -0.6, 0, 1));
    const bars = [];
    for (let i = 0; i < 7; i++) {
      const mat = emissiveMat(0xffffff, 0), h = 1.3 - i * 0.1;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 12), mat); bar.position.set(-0.54 + i * 0.18, 0.1 + (1.3 - h) / 2, 0); bar.scale.set(1.2, 1.001, 1.2);
      const brass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, h, 12), ctx.lib.skin(ctx.theme, 'crate')); brass.castShadow = true; brass.position.copy(bar.position);
      root.add(brass, bar); bars.push({ bar, mat, brass });
    }
    root.add(box(ctx.lib.skin(ctx.theme, 'crate'), 1.3, 0.1, 0.25, 0, 0.95, 0, 1));
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return { root, update(L, ctx) {
      const n = L.st[1] | 0;
      bars.forEach((b, i) => { const on = n === i + 1; b.mat.emissive.setHex(NOTE_HUES[i]); b.mat.emissiveIntensity += ((on ? 5 : 0.15) - b.mat.emissiveIntensity) * 0.4; const sw = on ? Math.sin(ctx.time * 40) * 0.05 : 0; b.bar.rotation.z = sw; b.brass.rotation.z = sw; });
    } };
  },
  prism(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xcfe8ff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.62, envMapIntensity: 3, clearcoat: 1, emissive: 0x8fb8ff, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false });
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 3), mat); prism.castShadow = true; prism.rotation.y = Math.PI / 6; root.add(prism);
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.9, 0.2, 0.9, 0, -0.65, 0, 1));
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return { root, update() {} };
  },
  filter(L, ctx) {
    const d = L.def, sz = d.size ?? [0.15, 2.4, 2.4], root = new THREE.Group(), col = HUE_COLORS[(d.hue ?? 1) & 3];
    root.add(new THREE.Mesh(new THREE.BoxGeometry(sz[0], sz[1], sz[2]), new THREE.MeshPhysicalMaterial({ color: col, transparent: true, opacity: 0.42, roughness: 0.05, emissive: col, emissiveIntensity: 0.6, depthWrite: false, envMapIntensity: 2 })));
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), sz[0] + 0.1, 0.08, sz[2] + 0.1, 0, sz[1] / 2, 0, 1), box(ctx.lib.skin(ctx.theme, 'metal'), sz[0] + 0.1, 0.08, sz[2] + 0.1, 0, -sz[1] / 2, 0, 1));
    root.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return { root, update() {} };
  },
  actor(L, ctx) {
    const d = L.def, root = new THREE.Group();
    const tint = d.id.startsWith('archivist') ? 0xffd36a : d.id.startsWith('witness') || d.id.startsWith('surv') ? 0xe8c8a0 : 0xd8c0a0;
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector2(0.05 + Math.sin(Math.pow(t, 0.7) * Math.PI) * 0.24, (t - 0.5) * 1.6)); }
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.35, metalness: 0.85, emissive: tint, emissiveIntensity: 0.12, envMapIntensity: 1.6 });
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), bodyMat); body.castShadow = true; root.add(body);
    const lensM = emissiveMat(tint, 2.5), lens = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 12), lensM); lens.position.set(0, 0.35, 0.18); root.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.016, 8, 40), emissiveMat(tint, 1.2)); ring.position.y = -0.2; ring.rotation.x = Math.PI / 2; root.add(ring);
    return { root, update(L, ctx) {
      root.visible = L.st[7] > 0.5;
      root.position.set(L.st[0], L.st[1] + Math.sin(ctx.time * 1.7 + L.st[0]) * 0.03, L.st[2]); root.rotation.y = L.st[3];
      lensM.emissiveIntensity = 1.6 + (L.st[4] > 0.5 ? 3 + Math.sin(ctx.time * 20) * 1.5 : 0) + L.st[5] * 0.8;
      ring.rotation.z = ctx.time * 0.8; ring.scale.setScalar(1 + (L.st[4] > 0.5 ? 0.2 * Math.sin(ctx.time * 12) : 0));
    } };
  },
  ledger(L, ctx) {
    const d = L.def, root = new THREE.Group();
    root.add(box(ctx.lib.skin(ctx.theme, 'metal'), 0.9, 1.1, 0.9, 0, 0, 0, 1));
    const book = new THREE.Group(); book.position.y = 0.66; book.rotation.x = -0.35;
    const pageM = emissiveMat(0xffe2a8, 1.2);
    for (const sx of [-1, 1]) { const pg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.6), pageM); pg.position.x = sx * 0.22; pg.rotation.z = sx * 0.08; book.add(pg); }
    root.add(book);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.015, 8, 48), emissiveMat(0xffd36a, 2)); halo.rotation.x = Math.PI / 2; halo.position.y = 0.2; root.add(halo);
    root.position.set(d.pos[0], d.pos[1] - 0.05, d.pos[2]);
    return { root, update(L, ctx) { pageM.emissiveIntensity = L.st[0] ? 4 : 1 + 0.4 * Math.sin(ctx.time * 2); halo.rotation.z = ctx.time; halo.scale.setScalar(L.st[0] ? 1.4 + 0.1 * Math.sin(ctx.time * 4) : 1); halo.position.y = 0.2 + (L.st[0] ? 0.4 : 0); } };
  },
  gate() { return null; },

};

let _haz = null;
function hazardTexture() {
  if (_haz) return _haz.clone();
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#140806'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ff7a2a';
  for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 24, 64); g.lineTo(i * 24 + 16, 64); g.lineTo(i * 24 + 48, 0); g.lineTo(i * 24 + 32, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; _haz = t; return t.clone();
}
let _stripe = null;
function stripeTexture() {
  if (_stripe) return _stripe.clone();
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#16181c'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#3a3320'; for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(8, 8 + i * 32); g.lineTo(32, 20 + i * 32); g.lineTo(56, 8 + i * 32); g.lineTo(56, 16 + i * 32); g.lineTo(32, 28 + i * 32); g.lineTo(8, 16 + i * 32); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; _stripe = t; return t.clone();
}

// ------------------------------------------------------------------ light pool (fixed count → no shader recompiles)
export class LightPool {
  constructor(scene, n) {
    this.lights = []; this.req = [];
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 12, 1.6); l.position.set(0, -100, 0); scene.add(l); this.lights.push(l); }
  }
  request(pos, color, power, range) { this.req.push({ pos, color, power, range }); }
  flush(camPos) {
    this.req.sort((a, b) => dist2(a.pos, camPos) - dist2(b.pos, camPos));
    this.lights.forEach((l, i) => {
      const r = this.req[i];
      if (!r) { l.intensity += (0 - l.intensity) * 0.3; if (l.intensity < 0.01) l.intensity = 0; return; }
      l.position.set(r.pos[0], r.pos[1], r.pos[2]); l.color.setHex(r.color); l.intensity = r.power; l.distance = r.range;
    });
    this.req.length = 0;
  }
}
const dist2 = (a, b) => (a[0] - b.x) ** 2 + (a[1] - b.y) ** 2 + (a[2] - b.z) ** 2;

// ------------------------------------------------------------------ the view manager
export class EntityViews {
  constructor(scene, lib, lights, quality) {
    this.scene = scene; this.lib = lib; this.lights = lights; this.views = new Map();
    this.group = new THREE.Group(); scene.add(this.group);
    this.conflictMat = makeConflictMaterial(lib.time);
    this.time = 0; this.quality = quality;
  }
  clear() {
    for (const v of this.views.values()) this.dispose(v);
    this.views.clear();
  }
  dispose(v) {
    this.group.remove(v.root);
    v.root.traverse((o) => { if (o.material && o.material.userData?.u) o.material.dispose(); });
  }
  sync(world, theme, dt, time) {
    this.time = time;
    const ctx = { lib: this.lib, theme, world, time, dt, lights: this.lights, conflictMat: this.conflictMat };
    const seen = new Set();
    for (const L of world.aliveList) {
      if (L.def.type === 'player' && !L.echo) continue; // first person: no body
      if (L.def.pos && L.def.pos[1] < -40) continue; // logic nodes
      const key = `${L.layer}|${L.id}`;
      seen.add(key);
      let v = this.views.get(key);
      if (!v) { v = this.create(L, ctx); if (!v) continue; this.views.set(key, v); }
      v.update(L, ctx, v);
      if (L.echo) {
        const u = v.echoMat?.userData.u;
        const age = L.age ?? 0;
        const rv = Math.min(1, age / 36);
        const slot = L.layer - 1, pb = world.playbacks[slot];
        v.root.traverse((o) => { if (o.material?.userData?.u) { const uu = o.material.userData.u; uu.uReveal.value = rv; uu.uCoherence.value = pb ? pb.coherence : 1; uu.uFrozen.value = pb && pb.active && !pb.playing ? 1 : 0; uu.uRev.value = pb && pb.rate < 0 ? 1 : 0; uu.uSlow.value = pb && Math.abs(pb.rate) < 1 ? 1 : 0; uu.uSolo.value = pb && pb.muted.size > 0 && pb.muted.size === pb.rec.tracks.size - 1 ? 1 : 0; } });
        // conflict tint if this id is involved in a displacing/overlap conflict
        v.root.visible = true;
      }
    }
    for (const [k, v] of this.views) if (!seen.has(k)) { this.dispose(v); this.views.delete(k); }
  }
  create(L, ctx) {
    const b = BUILD[L.def.type];
    if (!b) return null;
    const res = b(L, ctx);
    if (!res) return null;
    const v = { ...res, echoSlot: L.echo ? L.layer - 1 : null, over: false };
    if (L.echo) {
      const slot = L.layer - 1;
      v.root.traverse((o) => {
        if (o.isMesh) { o.material = this.lib.echo(o.material, slot); o.userData.echo = true; if (!v.echoMat) v.echoMat = o.material; }
      });
    }
    this.group.add(v.root);
    return v;
  }
}
