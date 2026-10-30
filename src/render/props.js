// World props that belong to the campaign layer rather than the simulation: archive-tape pedestals
// and discovery markers (hidden log fragments).

import * as THREE from 'three';
import { boxGeometry } from './materials.js';

export class Props {
  constructor(scene, lib, theme, level) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.tapes = []; this.orbs = [];
    const metal = lib.skin(theme, 'metal'), brass = lib.skin(theme, 'crate');
    for (const t of level.tapes ?? []) {
      const g = new THREE.Group(); g.position.set(t.pos[0], t.pos[1], t.pos[2]);
      const plinth = new THREE.Mesh(boxGeometry(0.9, 1.0, 0.9, 1.5), metal); plinth.position.y = 0.5; plinth.castShadow = true; plinth.receiveShadow = true;
      const cap = new THREE.Mesh(boxGeometry(1.1, 0.12, 1.1, 1.5), brass); cap.position.y = 1.06;
      const cass = new THREE.Group(); cass.position.y = 1.6;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.12), new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.6, roughness: 0.35 }));
      const reel1 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 24), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xc8b0ff, emissiveIntensity: 3 })); reel1.position.set(-0.14, 0, 0.07);
      const reel2 = reel1.clone(); reel2.position.x = 0.14;
      cass.add(body, reel1, reel2);
      const halo = new THREE.PointLight(0xc8b0ff, 6, 6, 1.8); halo.position.y = 1.6;
      g.add(plinth, cap, cass, halo);
      this.group.add(g);
      this.tapes.push({ cass, reel1, reel2 });
    }
    const orbGeo = new THREE.IcosahedronGeometry(0.16, 2), haloGeo = new THREE.SphereGeometry(0.45, 16, 12);
    for (const d of level.discoveries ?? []) {
      const g = new THREE.Group(); g.position.set(d.pos[0], d.pos[1] + 0.2, d.pos[2]);
      const core = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd36a, emissiveIntensity: 5 }));
      const halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(core, halo);
      this.group.add(g); this.orbs.push({ g, id: d.id, core });
    }
  }
  update(t, found) {
    this.tapes.forEach((c, i) => { c.cass.position.y = 1.6 + Math.sin(t * 1.6 + i) * 0.06; c.cass.rotation.y = t * 0.7; c.reel1.rotation.z = t * 3; c.reel2.rotation.z = -t * 3; });
    for (const o of this.orbs) {
      o.g.visible = !found.has(o.id);
      o.g.position.y += (Math.sin(t * 2 + o.g.position.x) * 0.0015);
      o.core.rotation.y = t; const s = 1 + 0.15 * Math.sin(t * 3 + o.g.position.z); o.g.scale.setScalar(s);
    }
  }
}
