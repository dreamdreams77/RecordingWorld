// Adaptive resolution in a real browser: software GL cannot hold 60 fps, so the governor must walk the render scale down,
// the canvas backing store must actually shrink, rendering must continue without errors, and turning it off restores full size.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto('http://localhost:4173/?quality=medium&audio=0'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await p.evaluate(async () => { const g = window.__game; await g.startLevel('ch1'); g.menus.hide(); g.settings.adaptiveRes = true; g.renderer.adapt.reset(); });
const size0 = await p.evaluate(() => ({ w: window.__game.canvas.width, s: window.__game.renderer.adapt.scale }));
// drive many rendered frames (each is slow in software GL) and watch the scale fall
await p.evaluate(() => { const g = window.__game; g.renderer.adapt.warm = 8; g.renderer.adapt.downAfter = 6; g.renderer.adapt.cooldown = 6; g.renderer.adapt.reset(); });
await p.waitForFunction(() => window.__game.renderer.adapt.scale < 0.8, null, { timeout: 240000 }).then(() => check('sustained slow frames lower the render scale', true), () => check('sustained slow frames lower the render scale', false));
const mid = await p.evaluate(() => ({ w: window.__game.canvas.width, s: window.__game.renderer.adapt.scale, pr: window.__game.renderer.renderer.getPixelRatio() }));
check('the canvas backing store actually shrank', mid.w < size0.w, `${size0.w} → ${mid.w} px wide at scale ${mid.s}`);
check('the composer follows the pixel ratio', mid.pr < 1.01 && mid.pr > 0.4, `pixel ratio ${mid.pr}`);
await p.waitForTimeout(3000);
check('it never goes below the floor', await p.evaluate(() => window.__game.renderer.adapt.scale >= 0.5));
await p.evaluate(() => { window.__game.settings.adaptiveRes = false; });
await p.waitForFunction(() => window.__game.renderer.adapt.scale === 1, null, { timeout: 120000 }).then(() => check('turning it off restores full resolution', true), () => check('turning it off restores full resolution', false));
check('rendering is still alive (the world keeps ticking)', await p.evaluate(async () => { const t = window.__game.world.tick; await new Promise((r) => setTimeout(r, 6000)); return window.__game.world.tick > t; }));
check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
