// injected into the page: stage an echo scene (record on plate A, replay, look at it)
(() => {
  const g = window.__game, w = g.world, P = w.player.st;
  const step = (n, inp = {}) => { for (let i = 0; i < n; i++) w.step({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: g.yaw, pitch: 0, ...inp }); };
  const walk = (x, z, max = 600) => { for (let i = 0; i < max; i++) { const dx = x - P[0], dz = z - P[2], d = Math.hypot(dx, dz); if (d < 0.25) break; g.yaw = Math.atan2(-dx, -dz); step(1, { mz: Math.min(1, d / 0.6), yaw: g.yaw }); } step(6); };
  walk(-5, -12);
  w.startRecording(0, { x0: -8, x1: -2, y0: -0.5, y1: 4, z0: -15, z1: -9 }, 'plate A'); step(150); w.stopRecording();
  walk(0, -14);
  w.play(0, { mode: 'loop' }); step(70);
  g.yaw = 0.15; g.pitch = -0.05; g.selected = 0;
  P[0] = 1.5; P[2] = -4; w.refreshDerived?.();
  window.__staged = true;
})();
