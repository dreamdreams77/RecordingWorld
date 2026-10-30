// Procedural sky dome: gradient, stars (optionally frozen — a plot point), nebula, and one monumental
// celestial body with optional rings. Also used (as an emissive dome) to build each theme's environment map.

import * as THREE from 'three';

export const SKY_PRESETS = {
  chamber:     { zenith: [0.004, 0.008, 0.02], horizon: [0.05, 0.06, 0.1], neb: [0.18, 0.1, 0.32], nebAmt: 0.5, stars: 1.0, body: { dir: [-0.8, 0.22, -0.55], size: 0.2, col: [0.9, 0.62, 0.38], ring: 1.0, tilt: 0.35 }, frozen: 0 },
  machine:     { zenith: [0.012, 0.008, 0.006], horizon: [0.16, 0.08, 0.03], neb: [0.4, 0.15, 0.04], nebAmt: 0.6, stars: 0.35, body: { dir: [0.5, 0.35, -0.8], size: 0.1, col: [1.0, 0.5, 0.2], ring: 0.0, tilt: 0 }, frozen: 0 },
  absence:     { zenith: [0.01, 0.01, 0.022], horizon: [0.12, 0.1, 0.12], neb: [0.25, 0.16, 0.3], nebAmt: 0.55, stars: 0.8, body: { dir: [0.2, 0.5, -0.9], size: 0.13, col: [0.85, 0.82, 0.9], ring: 0.0, tilt: 0 }, frozen: 0 },
  acoustic:    { zenith: [0.004, 0.012, 0.015], horizon: [0.02, 0.07, 0.08], neb: [0.05, 0.3, 0.3], nebAmt: 0.6, stars: 0.7, body: { dir: [-0.3, 0.6, -0.7], size: 0.12, col: [0.4, 0.9, 0.9], ring: 0.6, tilt: 0.7 }, frozen: 0 },
  observatory: { zenith: [0.001, 0.003, 0.012], horizon: [0.02, 0.03, 0.07], neb: [0.1, 0.12, 0.4], nebAmt: 0.7, stars: 1.6, body: { dir: [0.0, 0.8, -0.6], size: 0.22, col: [0.7, 0.75, 1.0], ring: 1.0, tilt: 0.15 }, frozen: 1 },
  record:      { zenith: [0.02, 0.018, 0.012], horizon: [0.4, 0.3, 0.2], neb: [0.8, 0.6, 0.3], nebAmt: 0.4, stars: 0.5, body: { dir: [0, 0.3, -1], size: 0.28, col: [1.0, 0.85, 0.6], ring: 0.0, tilt: 0 }, frozen: 1 },
};

export function makeSky(theme) {
  const p = SKY_PRESETS[theme] ?? SKY_PRESETS.chamber;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uZenith: { value: new THREE.Vector3(...p.zenith) }, uHorizon: { value: new THREE.Vector3(...p.horizon) },
      uNeb: { value: new THREE.Vector3(...p.neb) }, uNebAmt: { value: p.nebAmt }, uStars: { value: p.stars }, uFrozen: { value: p.frozen },
      uBodyDir: { value: new THREE.Vector3(...p.body.dir).normalize() }, uBodySize: { value: p.body.size }, uBodyCol: { value: new THREE.Vector3(...p.body.col) },
      uRing: { value: p.body.ring }, uTilt: { value: p.body.tilt }, uReveal: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform float uTime, uNebAmt, uStars, uFrozen, uBodySize, uRing, uTilt, uReveal;
      uniform vec3 uZenith, uHorizon, uNeb, uBodyDir, uBodyCol; varying vec3 vDir;
      float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y*0.5+0.5, 0., 1.);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.6));
        // nebula bands
        float n = fbm(d*3.0 + vec3(0.,0.,uFrozen > .5 ? 0. : uTime*0.004));
        float band = smoothstep(0.35, 0.9, n) * (0.4 + 0.6*smoothstep(0.0, 0.5, 1.0-abs(d.y)));
        col += uNeb * band * uNebAmt * (0.4 + fbm(d*9.0));
        // stars
        vec3 sp = d * 220.0; vec3 cell = floor(sp); float r = h3(cell);
        float star = step(0.985, r) * smoothstep(0.5, 0.0, length(fract(sp)-0.5));
        float tw = uFrozen > .5 ? 1.0 : (0.7 + 0.3*sin(uTime*(2.+r*8.) + r*40.));
        col += vec3(0.8,0.9,1.0) * star * tw * (0.6 + r*1.4) * uStars;
        vec3 sp2 = d * 90.0; vec3 c2 = floor(sp2); float r2 = h3(c2+7.);
        col += vec3(1.0,0.9,0.8) * step(0.992, r2) * smoothstep(0.5,0.0,length(fract(sp2)-0.5)) * uStars * 1.4;
        // celestial body (lit sphere) with optional ring
        float cb = dot(d, uBodyDir);
        float ang = acos(clamp(cb, -1., 1.));
        if (ang < uBodySize * 1.9) {
          vec3 up = abs(uBodyDir.y) < .95 ? vec3(0,1,0) : vec3(1,0,0);
          vec3 t = normalize(cross(up, uBodyDir)), b = cross(uBodyDir, t);
          vec2 q = vec2(dot(d, t), dot(d, b)) / uBodySize;
          float rr = length(q);
          if (rr < 1.0) {
            float z = sqrt(1.0 - rr*rr); vec3 nrm = normalize(vec3(q, z));
            float lit = clamp(dot(nrm, normalize(vec3(-0.5, 0.35, 0.8))), 0.0, 1.0);
            float bands = vn(vec3(nrm.y*14.0, nrm.x*2.0, 1.0)) * .5 + vn(vec3(nrm.y*40., nrm.x*4., 3.))*.25;
            vec3 pc = uBodyCol * (0.25 + bands*0.9) * (0.04 + lit);
            pc += uBodyCol * pow(1.0 - z, 3.0) * 0.5;
            col = pc;
          } else if (rr < 1.2) { col += uBodyCol * pow(1.0 - (rr-1.0)/0.2, 3.0) * 0.18; }
          if (uRing > 0.0) {
            float c = cos(uTilt), s = sin(uTilt);
            vec2 qr = vec2(q.x, q.y*c - s*0.0) ; qr.y /= max(0.12, abs(sin(uTilt+0.3)));
            float rrr = length(qr);
            float ringA = smoothstep(1.25, 1.3, rrr) * (1.0 - smoothstep(2.0, 2.05, rrr)) * (0.6 + 0.4*sin(rrr*60.));
            float front = (q.y*qr.y > -9.) ? 1. : 0.;
            bool behindPlanet = (rr < 1.0) && (qr.y < 0.0);
            if (!behindPlanet) col = mix(col, uBodyCol*1.2, ringA*0.65*uRing);
          }
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}

/** Environment map: sky + a few area-light panels, baked once per theme into a PMREM cube. */
export function makeEnvironment(renderer, theme, panels) {
  const scene = new THREE.Scene();
  const sky = makeSky(theme); sky.material.uniforms.uTime.value = 0; scene.add(sky);
  for (const p of panels ?? []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...p.size), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.intensity) }));
    m.position.set(...p.pos); scene.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  return rt.texture;
}
