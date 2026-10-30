// Captures the new sections for visual review: node e2e/sections.mjs [outdir]
import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.argv[2] ?? 'docs/screenshots/'; fs.mkdirSync(OUT, { recursive: true });
const URL0 = process.env.URL ?? 'http://localhost:5173/';
const shots = [
  ['ch2', 'dead-field', [0, 0, -112], 0, 0, `g=>{}`],
  ['ch3', 'fork', [0, 0, -104], 0, 0.02, `g=>{ g.director.loadTape(g.director.tapes[4],0); g.director.loadTape(g.director.tapes[5],1); g.world.play(0,{mode:'hold'}); g.world.play(1,{mode:'hold'}); for(let i=0;i<300;i++) g.world.step({mx:0,mz:0,yaw:g.yaw,pitch:0,tone:0}); }`],
  ['ch4', 'carillon', [0, 0, -114], 0.5, 0, `g=>{ g.world.byId.get('go1').st[0]=1; }`],
  ['ch5', 'prism-hall', [0, 18, -106], 0, 0, `g=>{}`],
  ['ch6', 'well-bottom', [0, 0, -100], 0, -0.05, `g=>{ g.world.byId.get('P').st[0]=1; g.world.teleportPlayer([0,-12,-101],0); }`],
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
for (const [id, name, pos, yaw, pitch, fn] of shots) {
  await page.goto(`${URL0}?level=${id}&quality=low`);
  await page.waitForFunction(() => window.__game?.state === 'play', null, { timeout: 120000 });
  await page.evaluate(([pos, yaw, pitch, fn]) => { const g = window.__game; g.testNoRender = true; g.world.teleportPlayer(pos, yaw); g.yaw = yaw; g.pitch = pitch; for (let i = 0; i < 20; i++) { g.world.step({ mx: 0, mz: 0, yaw, pitch, tone: 0 }); g.director.update(); } eval(`(${fn})`)(g); for (let i = 0; i < 90; i++) { g.world.step({ mx: 0, mz: 0, yaw, pitch, tone: 0 }); g.director.update(); } g.testNoRender = false; }, [pos, yaw, pitch, fn]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('shot', name);
}
console.log(errs.length ? 'ERRORS: ' + errs.slice(0, 5).join(' | ') : 'no console errors');
await browser.close();
