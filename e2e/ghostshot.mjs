// Visual inspection harness: builds real scenes in real chapters, previews a recorded moment and screenshots it from a chosen camera.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const [, , scene = 'witness', out = '/tmp/ghost.png', W = '960', H = '540'] = process.argv;
const b = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext(process.env.TOUCH ? { ...devices['Pixel 7'], viewport: { width: +W, height: +H }, screen: { width: +W, height: +H } } : { viewport: { width: +W, height: +H } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://localhost:4173/?quality=medium&audio=0');
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
const S = { witness: { lvl: 'ch6', at: [-1, 0, -129], yaw: -0.8, pitch: -0.1, vol: { x0: -1, x1: 9, y0: -1, y1: 5, z0: -146, z1: -130 }, from: [6, 0, -137], path: [[6, -137]], tick: 55, id: 'xP' },
  ch2: { lvl: 'ch2', at: [0, 0, -2], yaw: 0.35, pitch: -0.1, vol: { x0: -9, x1: 9, y0: -1, y1: 6, z0: -26, z1: -2 }, from: [-3, 0, -9], press: ['btn1'], tick: 80 },
  stress: { lvl: 'ch1', at: [0, 0, -4], yaw: 0.56, pitch: -0.2, vol: { x0: -9, x1: 1, y0: -1, y1: 4, z0: -18, z1: -6 }, from: [-5, 0, -12], tick: 300, stress: true },
  ch1: { lvl: 'ch1', at: [0, 0, -4], yaw: 0.56, pitch: -0.2, vol: { x0: -9, x1: 1, y0: -1, y1: 4, z0: -18, z1: -6 }, from: [-5, 0, -12], tick: 50 } }[scene];
S.echo = process.env.ECHO || null; S.explore = !!process.env.EXPLORE; S.full = !!process.env.FULL; if (S.echo) { S.at = [-4, 0, -8.5]; S.yaw = 0.278; S.pitch = -0.12; }
if (process.env.CAM) { const [x, z, yaw, pitch = -0.1] = process.env.CAM.split(',').map(Number); S.at = [x, 0, z]; S.yaw = yaw; S.pitch = pitch; }
await p.evaluate(async (S) => {
  const g = window.__game; await g.startLevel(S.lvl); g.menus.hide(); g.testHold = true; g.hud.layer.style.display = '';
  const w = g.world, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0 };
  if (S.explore) { g.settings.hudMode = S.full ? 'full' : 'minimal'; g.applySettings(); g.hud.folioT = -1e9; g.input.poke(); w.teleportPlayer(S.at, 0); g.testHold = false; g.selected = 0; g.yaw = S.yaw; g.pitch = S.pitch; g.cur.set(w.player.st); g.prev.set(w.player.st); return; }
  w.teleportPlayer(S.at, 0); w.startRecording(0, S.vol, 'memory');
  if (S.stress) { for (let k = 0; k < 120; k++) { w.teleportPlayer(S.from, 0); w.step(IDLE); w.step(IDLE); w.teleportPlayer([S.from[0] + 4, 0, S.from[2]], 0); w.step(IDLE); w.step(IDLE); } w.teleportPlayer(S.at, 0); w.stopRecording(); }
  else {
  for (let i = 0; i < 20; i++) w.step(IDLE); w.teleportPlayer(S.from, 0); for (const id of S.press ?? []) w.byId.get(id).st[0] = 1; for (let i = 0; i < 70; i++) w.step(IDLE); w.teleportPlayer(S.at, 0); for (let i = 0; i < 20; i++) w.step(IDLE); w.stopRecording(); }
  g.selected = 0;
  if (S.echo) { const m = S.echo; if (m === 'frozen') w.playFrom(0, S.tick, { frozen: true }); else { w.play(0, { mode: 'loop' }); w.setHead(0, S.tick); w.playbacks[0].playing = true; if (m === 'reverse') w.reverse(0); if (m === 'slow') w.setRate(0, 0.25); } w.applyEchoStates(); g.testHold = false; for (let i = 0; i < 3; i++) { g.playFrame(1 / 60); g.input.endFrame(); } g.testHold = true; }
  else { g.instr.cursor = { slot: 0, tick: S.tick }; } g.instr.poke(); g.yaw = S.yaw; g.pitch = S.pitch; g.cur.set(w.player.st); g.prev.set(w.player.st);
}, S);
await p.waitForTimeout(2500);
await p.screenshot({ path: out, timeout: 120000 });
console.log('errors', errs.slice(0, 3));
await b.close();
