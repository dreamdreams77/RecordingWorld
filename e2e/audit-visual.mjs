// Visual audit harness: per chapter — the plain world, six simultaneous echoes (the six palette colours) and the echo states
// side by side (frozen, reversed, slow, solo, omitted, normal). HUD hidden unless asked. Writes /tmp/audit/<chapter>-<shot>.png.
import { chromium } from 'playwright';
const chapters = (process.env.CH ?? 'ch1,ch2,ch3,ch4,ch5,ch6').split(','), Q = process.env.Q ?? 'medium', OUT = '/tmp/audit';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:4173/?quality=${Q}&audio=0`); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
for (const id of chapters) {
  await p.evaluate((c) => { window.__close = c; }, !!process.env.CLOSE);
  await p.evaluate(async (id) => {
    const g = window.__game; g.testNoRender = true; await g.startLevel(id); g.menus.hide(); g.hud.layer.style.display = 'none'; document.querySelector('.titlecard')?.remove(); g.settings.hudMode = 'minimal';
    const w = g.world, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 };
    w.caps.slots = 6; w.caps.maxTicks = 600; w.caps.modes = ['once', 'loop', 'pingpong', 'hold']; w.recordings = Array(6).fill(null); w.playbacks = Array(6).fill(null); w.undo = Array.from({ length: 6 }, () => []);
    const S = [0, 0, (window.__close ? 2.4 : 4)]; w.teleportPlayer(S, 0);
    for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.95; w.teleportPlayer([x, 0, 0.6], 0); for (let k = 0; k < 4; k++) w.step(IDLE);
      w.startRecording(i, { x0: x - 0.8, x1: x + 0.8, y0: -1, y1: 3.5, z0: -0.8, z1: 2 }, `e${i}`); for (let k = 0; k < 60; k++) w.step({ ...IDLE, mx: Math.sin(k / 9) > 0 ? 0.0 : 0 }); w.stopRecording(); }
    w.teleportPlayer(S, 0); g.yaw = 0; g.pitch = -0.04; for (let k = 0; k < 5; k++) w.step(IDLE); g.cur.set(w.player.st); g.prev.set(w.player.st);
    window.__shot = { g, w };
  }, id);
  const snap = async (name, setup) => {
    await p.evaluate((setup) => { const { g, w } = window.__shot; g.testHold = true; g.testNoRender = true; eval(setup); g.testNoRender = false; }, setup);
    await p.waitForTimeout(2200); await p.screenshot({ path: `${OUT}/${id}-${name}${process.env.CLOSE ? '-close' : ''}.png`, timeout: 180000 });
  };
  await snap('world', `for (let i = 0; i < 6; i++) { w.stop(i); } g.yaw = 0.0; g.pitch = -0.06; g.hud.layer.style.display = 'none';`);
  await snap('six', `w.playAll({ mode: 'loop' }); for (let i = 0; i < 6; i++) { const pb = w.playbacks[i]; pb.rate = 1; } for (let k = 0; k < 20; k++) w.step({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 }); g.testHold = false; for (let k = 0; k < 3; k++) { g.playFrame(1/60); g.input.endFrame(); } g.testHold = true;`);
  await snap('states', `w.playFrom(0, 30, { frozen: true }); w.playFrom(1, 30, { mode: 'loop' }); w.playbacks[1].rate = -1; w.playFrom(2, 30, { mode: 'loop' }); w.playbacks[2].rate = 0.25; w.playFrom(3, 30, { mode: 'loop' }); w.soloTrack(3, 'player'); w.playFrom(4, 30, { mode: 'loop' }); w.playFrom(5, 30, { mode: 'loop' }); w.muteTrack(5, 'player'); for (let k = 0; k < 6; k++) { g.testHold = false; g.playFrame(1/60); g.input.endFrame(); } g.testHold = true;`);
}
console.log('errors', errs.slice(0, 4)); await b.close();
