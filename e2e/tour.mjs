// Presentation tour: each chapter, from every section checkpoint, looking down the hall. HUD hidden. Writes /tmp/tour/<chapter>-<section>.png
// Env: CH=ch4,ch5 SEC=a,b Q=medium YAW=0 PITCH=-0.05
import { chromium } from 'playwright';
const chapters = (process.env.CH ?? 'ch1,ch2,ch3,ch4,ch5,ch6').split(','), only = process.env.SEC?.split(','), Q = process.env.Q ?? 'medium', OUT = process.env.OUT ?? '/tmp/tour';
const { mkdirSync } = await import('node:fs'); mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:4173/?quality=${Q}&audio=0`); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
for (const id of chapters) {
  const secs = await p.evaluate(async (id) => { const g = window.__game; g.testNoRender = true; await g.startLevel(id); g.menus.hide(); document.querySelector('.titlecard')?.remove(); return g.world.level.sections.map((s) => s.id); }, id);
  for (const sid of secs) {
    if (only && !only.includes(sid)) continue;
    await p.evaluate(({ id, sid, yaw, pitch }) => {
      const g = window.__game, w = g.world, s = w.level.sections.find((x) => x.id === sid), c = s.checkpoint, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 };
      g.hud.layer.style.display = 'none'; g.testHold = true; w.teleportPlayer(c.pos, c.yaw ?? 0); for (let k = 0; k < 6; k++) w.step(IDLE);
      g.yaw = yaw; g.pitch = pitch; g.cur.set(w.player.st); g.prev.set(w.player.st); g.testNoRender = false;
    }, { id, sid, yaw: +(process.env.YAW ?? 0), pitch: +(process.env.PITCH ?? -0.05) });
    await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/${id}-${sid}.png`, timeout: 180000 });
    await p.evaluate(() => { window.__game.testNoRender = true; });
  }
}
console.log('errors', errs.slice(0, 4)); await b.close();
