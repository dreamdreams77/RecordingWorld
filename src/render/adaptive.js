// Adaptive resolution: a small governor that trades pixels for frame rate so the game stays smooth on whatever it runs on.
// Pure logic (no DOM, no WebGL) so it can be unit-tested: feed it the time between frames, read back a render scale.
//   * It looks at a smoothed frame time, ignoring hitches (tab switches, level loads) and the frames right after a change.
//   * Sustained slowness lowers the scale in 10% steps (never below `min`); sustained headroom raises it in 5% steps.
//   * Hysteresis (different thresholds up and down, plus a cooldown) prevents oscillation.
export class AdaptiveRes {
  constructor({ min = 0.5, max = 1, targetMs = 16.7, slowMs = 21, fastMs = 13.5, warm = 90, cooldown = 45, downAfter = 24, upAfter = 150 } = {}) {
    Object.assign(this, { min, max, targetMs, slowMs, fastMs, warm, cooldown, downAfter, upAfter });
    this.scale = max; this.ema = targetMs; this.n = 0; this.cool = warm; this.slow = 0; this.fast = 0; this.enabled = true;
  }
  reset() { this.n = 0; this.cool = this.warm; this.slow = this.fast = 0; this.ema = this.targetMs; }
  /** @param ms time since the previous rendered frame. Returns the (possibly new) scale; `changed` is set on the instance. */
  sample(ms) {
    this.changed = false;
    if (!this.enabled) { if (this.scale !== this.max) { this.scale = this.max; this.changed = true; } return this.scale; }
    if (!(ms > 0) || ms > 1000) return this.scale;                // a tab switch or a level load: not a frame
    ms = Math.min(ms, 120);                                       // a single long frame cannot swing the average far; a *run* of them still does
    this.n++; this.ema += (ms - this.ema) * 0.12;
    if (this.cool > 0) { this.cool--; return this.scale; }
    if (this.ema > this.slowMs) { this.slow++; this.fast = 0; } else if (this.ema < this.fastMs) { this.fast++; this.slow = 0; } else this.slow = this.fast = 0;
    if (this.slow >= this.downAfter && this.scale > this.min) { this.scale = Math.max(this.min, +(this.scale * 0.9).toFixed(3)); this.change(); }
    else if (this.fast >= this.upAfter && this.scale < this.max) { this.scale = Math.min(this.max, +(this.scale * 1.05).toFixed(3)); this.change(); }
    return this.scale;
  }
  change() { this.changed = true; this.cool = this.cooldown; this.slow = this.fast = 0; this.ema = this.targetMs; }
}
