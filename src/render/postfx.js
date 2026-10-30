// Post-processing: MSAA HDR scene → ambient occlusion → bloom → "grade" (chromatic aberration, temporal
// interference tears, split-toned colour grade, vignette, grain, daltonisation) → tone-map/sRGB output.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uInterference: { value: 0 }, uAb: { value: 0.0012 },
    uGrain: { value: 0.035 }, uVignette: { value: 0.55 }, uExposure: { value: 1.0 }, uContrast: { value: 1.0 },
    uShadowTint: { value: new THREE.Color(0.9, 1.0, 1.12) }, uHighTint: { value: new THREE.Color(1.1, 1.02, 0.9) },
    uSat: { value: 1.0 }, uFlash: { value: 0 }, uCB: { value: 0 }, uPulse: { value: new THREE.Color(1, 0.4, 0.3) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uInterference, uAb, uGrain, uVignette, uExposure, uContrast, uSat, uFlash; uniform int uCB;
    uniform vec3 uShadowTint, uHighTint, uPulse; varying vec2 vUv;
    float hash(float n){ return fract(sin(n*91.3458)*47453.5453); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv = vUv;
      float bandId = floor(uv.y * 46.0);
      float bn = hash(bandId + floor(uTime * 9.0));
      float tear = step(0.86, bn) * uInterference;
      uv.x += (bn - 0.5) * 0.045 * tear;
      uv += (vec2(hash2(vec2(bandId, uTime)), 0.0) - 0.5) * 0.002 * uInterference;
      vec2 d = uv - 0.5; float r2 = dot(d, d);
      float ab = uAb * (1.0 + uInterference * 4.0) * (0.4 + r2 * 4.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + d * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ab).b);
      col *= uExposure;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = mix(col * uShadowTint, col * uHighTint, smoothstep(0.02, 1.2, l));       // split tone
      col = (col - 0.18) * uContrast + 0.18;
      col = max(col, 0.0);
      col *= 1.0 - uVignette * smoothstep(0.25, 0.95, length(d) * 1.35);
      col += (hash2(uv * vec2(1920.0, 1080.0) + uTime) - 0.5) * uGrain * (0.4 + 0.6 * (1.0 - clamp(l, 0.0, 1.0)));
      col += uPulse * uFlash * (0.5 + 0.5 * smoothstep(0.2, 0.9, length(d)));
      if (uCB == 1) { // protanopia daltonisation
        mat3 m = mat3(0.567, 0.558, 0.0, 0.433, 0.442, 0.242, 0.0, 0.0, 0.758); col = m * col;
      } else if (uCB == 2) { mat3 m = mat3(0.625, 0.7, 0.0, 0.375, 0.3, 0.3, 0.0, 0.0, 0.7); col = m * col; }
      else if (uCB == 3) { mat3 m = mat3(0.95, 0.0, 0.0, 0.05, 0.433, 0.475, 0.0, 0.567, 0.525); col = m * col; }
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, q) {
    this.renderer = renderer; this.q = q;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: q.msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = null;
    if (q.ao) {
      this.gtao = new GTAOPass(scene, camera, size.x, size.y);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.4, scale: 1.1, samples: 12 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * q.bloomScale, size.y * q.bloomScale), 0.5, 0.65, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  resize(w, h) { this.composer.setSize(w, h); }
  render(dt, params) {
    const u = this.grade.uniforms;
    u.uTime.value = params.time; u.uInterference.value = params.interference; u.uFlash.value = params.flash;
    u.uAb.value = params.reducedMotion ? 0.0004 : 0.0012;
    u.uGrain.value = params.reducedMotion ? 0.015 : 0.035;
    u.uContrast.value = params.highContrast ? 1.22 : params.contrast ?? 1;
    u.uExposure.value = params.exposure ?? 1;
    u.uCB.value = params.colorblind | 0;
    if (params.tint) { u.uShadowTint.value.set(...params.tint.shadow); u.uHighTint.value.set(...params.tint.high); }
    this.bloom.strength = params.bloom ?? 0.5;
    this.composer.render(dt);
  }
  dispose() { this.composer.dispose?.(); }
}
