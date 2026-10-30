// GameRenderer: owns the WebGL context, the scene graph for the current level, the camera and the
// post-processing chain, and draws the simulation each frame without ever mutating it.

import * as THREE from 'three';
import { MaterialLibrary } from './materials.js';
import { EntityViews, LightPool } from './entities.js';
import { BeamFX, ConflictFX, FrameFX, RecordingFX } from './fx.js';
import { PostFX } from './postfx.js';
import { makeSky, makeEnvironment } from './sky.js';
import { buildScenery } from './scenery.js';
import { QUALITY } from '../game/settings.js';
import { EYE_HEIGHT } from '../sim/types.js';
import { disposeTextures } from './textures.js';
import { disposeGeometryCache } from './materials.js';

export class GameRenderer {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    this.q = { ...QUALITY[settings.quality] };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, this.q.far);
    this.clock = 0; this.flash = 0; this.interf = 0; this.bob = 0;
    this.theme = null; this.sc = null; this.post = null; this.cinematic = null;
    this.stats = { calls: 0, tris: 0, frameMs: 0, fps: 0 };
    this.applyQuality(settings.quality);
  }

  applyQuality(name) {
    this.settings.quality = name;
    this.q = { ...QUALITY[name] };
    const dpr = Math.min(window.devicePixelRatio || 1, this.q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = this.q.shadows;
    if (this.world) this.rebuild();
    else this.resize();
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.post?.resize(w, h);
    if (this.reflRT) this.reflRT.setSize(Math.max(64, w * this.q.reflScale), Math.max(64, h * this.q.reflScale));
  }

  /** (Re)builds all scene content for a level. Async so the loading screen can paint between stages. */
  async loadLevel(level, world, progressCb = () => {}) {
    this.level = level; this.world = world;
    await this.rebuild(progressCb);
  }
  async rebuild(progressCb = () => {}) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const level = this.level;
    this.teardown();
    this.theme = level.theme;
    progressCb(0.05, 'Synthesising materials'); await tick();
    this.lib = new MaterialLibrary(this.q);
    for (const s of ['wall', 'floor', 'door', 'bridge', 'crate', 'metal', 'stone']) { this.lib.skin(this.theme, s); progressCb(0.1 + 0.05 * Math.random(), 'Synthesising materials'); await tick(); }
    progressCb(0.35, 'Raising architecture'); await tick();
    this.sc = buildScenery(this.theme, { lib: this.lib, level, quality: this.q, theme: this.theme });
    this.scene.add(this.sc.group);
    this.sky = makeSky(this.theme); this.scene.add(this.sky);
    this.env = makeEnvironment(this.renderer, this.theme, this.sc.panels);
    this.scene.environment = this.env; this.scene.environmentIntensity = 0.9;
    this.scene.fog = new THREE.FogExp2(this.sc.fog.color, this.sc.fog.density);
    this.scene.background = null;
    progressCb(0.6, 'Lighting'); await tick();
    this.hemi = new THREE.HemisphereLight(this.sc.ambient.sky, this.sc.ambient.ground, this.sc.ambient.intensity); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(this.sc.key.color, this.sc.key.intensity);
    this.key.castShadow = this.q.shadows;
    const sh = this.key.shadow; sh.mapSize.set(this.q.shadowMap, this.q.shadowMap);
    const e = 38; Object.assign(sh.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 160 });
    sh.bias = -0.0004; sh.normalBias = 0.05; sh.radius = 3;
    this.scene.add(this.key, this.key.target);
    this.lights = new LightPool(this.scene, this.q.lights);
    this.views = new EntityViews(this.scene, this.lib, this.lights, this.q);
    this.beams = new BeamFX(this.scene); this.conflicts = new ConflictFX(this.scene, this.lib.time);
    this.frameFx = new FrameFX(this.scene); this.recFx = new RecordingFX(this.scene);
    if (this.q.reflections) this.setupReflection();
    this.post = new PostFX(this.renderer, this.scene, this.camera, this.q);
    this.resize();
    progressCb(0.9, 'Compiling shaders'); await tick();
    this.renderer.compile(this.scene, this.camera);
    progressCb(1, 'Ready');
  }
  teardown() {
    for (const c of [...this.scene.children]) this.scene.remove(c);
    this.views?.clear(); this.post?.dispose(); this.post = null;
    this.reflRT?.dispose(); this.reflRT = null; this.reflMats = [];
    disposeTextures(); disposeGeometryCache();
  }

  // -------------------------------------------------------------- planar reflection for polished floors
  setupReflection() {
    this.reflRT = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 });
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflMatrix = new THREE.Matrix4();
    const floorMat = this.lib.skin(this.theme, 'floor');
    const amount = floorMat.userData.floor ? 0.95 : 0.3;
    const uniforms = { uReflTex: { value: this.reflRT.texture }, uReflMat: { value: this.reflMatrix }, uReflAmt: { value: amount } };
    floorMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uReflMat; varying vec4 vRP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = uReflMat * modelMatrix * vec4(transformed, 1.0);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uReflTex; uniform float uReflAmt; varying vec4 vRP;')
        .replace('#include <opaque_fragment>', `
          vec2 ruv = vRP.xy / vRP.w + normal.xy * 0.012;
          vec3 refl = texture2D(uReflTex, ruv).rgb;
          float fr = 0.12 + 0.88 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);
          outgoingLight += refl * uReflAmt * fr * (1.0 - roughnessFactor * 0.85);
          #include <opaque_fragment>`);
    };
    floorMat.needsUpdate = true;
  }
  renderReflection() {
    if (!this.reflRT) return;
    const cam = this.camera, rc = this.reflCam;
    if (cam.position.y < 0.2) return;
    rc.copy(cam); rc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    rc.up.set(up.x, -up.y, up.z);
    rc.lookAt(cam.position.x + dir.x, -(cam.position.y + dir.y), cam.position.z + dir.z);
    rc.updateMatrixWorld(); rc.updateProjectionMatrix();
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.reflMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    // oblique near plane at y = 0 (clip everything below the floor)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.002);
    plane.applyMatrix4(rc.matrixWorldInverse);
    const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix.elements;
    const q = new THREE.Vector4((Math.sign(cp.x) + pm[8]) / pm[0], (Math.sign(cp.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    cp.multiplyScalar(2 / cp.dot(q));
    pm[2] = cp.x; pm[6] = cp.y; pm[10] = cp.z + 1 - 0.003; pm[14] = cp.w;
    const floors = this.views.group.children.filter((c) => c.userData.static && c.children[0]?.material?.userData?.floor);
    for (const f of floors) f.visible = false;
    this.frameFx.group.visible && (this.frameFx.group.visible = false);
    this.renderer.setRenderTarget(this.reflRT);
    this.renderer.clear();
    this.renderer.render(this.scene, rc);
    this.renderer.setRenderTarget(null);
    for (const f of floors) f.visible = true;
    return true;
  }

  // -------------------------------------------------------------- per frame
  pulse(a = 0.18) { this.flash = Math.max(this.flash, this.settings.flashReduction ? a * 0.2 : a); }

  /**
   * @param {object} fs frame state {world, dt, time, ui:{frame, frameColor, recording, selected, showVolumes, showTraj}, player:{...}}
   */
  render(fs) {
    const t0 = performance.now();
    const { world, dt } = fs;
    this.clock += dt;
    this.lib.setTime(this.clock);
    this.sky.material.uniforms.uTime.value = this.clock;
    // camera
    const cam = this.camera, c = fs.cam;
    if (this.cinematic) {
      const k = this.cinematic;
      cam.position.set(...k.pos); cam.lookAt(...k.target); cam.fov = k.fov ?? this.settings.fov;
    } else {
      this.bob += (c.speed / 4.9) * dt * 9.5 * (c.ground ? 1 : 0);
      const bobAmt = this.settings.headBob && !this.settings.reducedMotion ? 0.035 : 0;
      cam.position.set(c.x, c.y - 0.9 + EYE_HEIGHT + Math.sin(this.bob) * bobAmt, c.z);
      cam.rotation.set(c.pitch, c.yaw, 0, 'YXZ');
      cam.fov = this.settings.fov;
    }
    cam.updateProjectionMatrix();
    // lights follow the player (snapped to avoid shadow shimmer)
    const sx = Math.round(cam.position.x / 2) * 2, sz = Math.round(cam.position.z / 2) * 2;
    const kd = this.sc.key.dir;
    this.key.target.position.set(sx, 0, sz);
    this.key.position.set(sx + kd[0] * 70, kd[1] * 70, sz + kd[2] * 70);
    // scene sync
    for (const f of this.sc.anim) f(this.clock);
    this.views.sync(world, this.theme, dt, this.clock);
    this.beams.update(world, this.clock);
    const nConf = this.conflicts.update(world);
    this.recFx.update(world, { showVolumes: fs.ui.showVolumes, showTraj: fs.ui.showTraj, selected: fs.ui.selected });
    this.frameFx.set(fs.ui.frame, fs.ui.frameColor ?? 0xffffff, fs.ui.recording, this.clock);
    this.lights.flush(cam.position);
    // post parameters: interference grows with conflicts and lost coherence
    let incoh = 0; for (const pb of world.playbacks) if (pb?.active) incoh = Math.max(incoh, 1 - pb.coherence);
    const target = Math.min(1, nConf * 0.25 + incoh * 1.2);
    this.interf += (target - this.interf) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 0.9);
    // the reflection pass already refreshed the shadow map this frame; skip it in the main pass
    this.renderer.shadowMap.autoUpdate = true;
    const reflected = this.renderReflection();
    this.renderer.shadowMap.autoUpdate = !reflected;
    this.frameFx.group.visible = !!fs.ui.frame;
    this.post.render(dt, {
      time: this.clock, interference: this.settings.reducedMotion ? this.interf * 0.3 : this.interf, flash: this.flash,
      reducedMotion: this.settings.reducedMotion, highContrast: this.settings.highContrast, colorblind: this.settings.colorblind,
      tint: this.sc.tint, exposure: this.sc.exposure, bloom: this.sc.bloom, contrast: 1.04,
    });
    this.renderer.shadowMap.autoUpdate = true;
    const info = this.renderer.info.render;
    this.stats.calls = info.calls; this.stats.tris = info.triangles;
    this.stats.frameMs = performance.now() - t0;
  }

  /** Project a world point to CSS pixels (for HUD labels). */
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight, visible: v.z < 1 && v.z > -1 };
  }
}
