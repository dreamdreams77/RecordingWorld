// A headless "player": drives the real World through the same input channel as the human player.
// Used by the automated solution tests and the benchmark, so a level can only be marked solvable if
// it is solvable through the actual controls and physics.

import { World, IDLE } from './world.js';

export class Bot {
  constructor(level, opts) {
    this.w = opts?.world ?? new World(level, opts);
    this.yaw = this.w.level.spawn?.yaw ?? 0;
    this.pitch = 0;
    this.log = [];
  }
  get p() { return this.w.player.st; }
  step(n = 1, input = {}) {
    for (let i = 0; i < n; i++) this.w.step({ ...IDLE, yaw: this.yaw, pitch: this.pitch, ...input });
  }
  seconds(s, input) { this.step(Math.round(s * 60), input); }
  faceXZ(x, z) { this.yaw = Math.atan2(-(x - this.p[0]), -(z - this.p[2])); }
  lookAt(x, y, z) {
    const e = this.w.eye();
    this.yaw = Math.atan2(-(x - e[0]), -(z - e[2]));
    this.pitch = Math.atan2(y - e[1], Math.hypot(x - e[0], z - e[2]));
  }
  /** Walk in a straight line to (x,z); optionally jump when a gap/ledge is reached. */
  walkTo(x, z, { tol = 0.25, max = 1800, jumpAt = null, tone = 0 } = {}) {
    for (let i = 0; i < max; i++) {
      const dx = x - this.p[0], dz = z - this.p[2], d = Math.hypot(dx, dz);
      if (d < tol) break;
      this.faceXZ(x, z);
      const jump = jumpAt ? Math.hypot(jumpAt[0] - this.p[0], jumpAt[1] - this.p[2]) < 0.6 : false;
      this.step(1, { mz: Math.min(1, d / 0.6), jump, tone });
    }
    this.step(6);
    const d = Math.hypot(x - this.p[0], z - this.p[2]);
    if (d > Math.max(tol * 2, 0.6)) throw new Error(`Bot could not reach (${x}, ${z}); stopped at (${this.p[0].toFixed(2)}, ${this.p[2].toFixed(2)}) y=${this.p[1].toFixed(2)}`);
  }
  /** Walk through a list of [x,z] waypoints. */
  path(pts, opts) { for (const [x, z, o] of pts) this.walkTo(x, z, { ...opts, ...(o ?? {}) }); }
  jumpForward(ticks = 30) { this.step(ticks, { mz: 1, jump: true }); }
  press(id) { // look at an interactable and use it
    const L = this.w.byId.get(id);
    const a = L.def.pos;
    this.lookAt(a[0], a[1], a[2]);
    this.step(1, { interact: true });
    this.step(2);
  }
  sing(note, seconds) { this.step(Math.round(seconds * 60), { tone: note }); }
  record(slot, vol, seconds, fn, name) {
    this.w.startRecording(slot, vol, name);
    if (fn) fn(this);
    if (seconds) this.seconds(seconds);
    return this.w.stopRecording();
  }
  vol(cx, cy, cz, hx, hy, hz) { return { x0: cx - hx, y0: cy - hy, z0: cz - hz, x1: cx + hx, y1: cy + hy, z1: cz + hz }; }
  signal(id) { return this.w.R.get(id) ?? 0; }
  st(id, ch) { const L = this.w.byId.get(id); return L.st[L.type.I[ch]]; }
}
