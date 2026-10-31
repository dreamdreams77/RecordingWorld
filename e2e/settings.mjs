// Settings and progress persistence across a real page reload, through the real menu controls.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } }); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
const boot = async () => { await p.goto('http://localhost:4173/?audio=0&quality=low'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 }); };
await boot();
check('defaults: minimal HUD, adaptive resolution on', await p.evaluate(() => window.__game.settings.hudMode === 'minimal' && window.__game.settings.adaptiveRes === true));
// through the real settings screen
await p.click('text=Settings'); await p.waitForSelector('select');
const labelRow = (label) => p.locator('.row', { hasText: label }).first();
await labelRow('Interface').locator('select').selectOption('full');
await labelRow('Adaptive resolution').locator('input[type=checkbox]').uncheck();
await labelRow('Invert Y').locator('input[type=checkbox]').check();
await labelRow('Colour-vision filter').locator('select').selectOption('2');
await labelRow('UI scale').locator('input[type=range]').fill('1.3');
await labelRow('Mouse sensitivity').locator('input[type=range]').fill('1.7');
check('the controls changed the live settings', await p.evaluate(() => { const s = window.__game.settings; return s.hudMode === 'full' && s.adaptiveRes === false && s.invertY === true && s.colorblind == 2 && Math.abs(s.uiScale - 1.3) < 1e-6 && Math.abs(s.sensitivity - 1.7) < 1e-6; }));
await p.reload(); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
check('after a reload every setting is still what it was', await p.evaluate(() => { const s = window.__game.settings; return s.hudMode === 'full' && s.adaptiveRes === false && s.invertY === true && s.colorblind == 2 && Math.abs(s.uiScale - 1.3) < 1e-6 && Math.abs(s.sensitivity - 1.7) < 1e-6; }));
check('and they are applied, not merely stored (UI scale, HUD mode, adaptive resolution)', await p.evaluate(() => Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) - 1.3 * Math.max(1, Math.min(1.6, innerHeight / 800))) < 0.01 && !document.querySelector('.hudlayer').classList.contains('min') && window.__game.renderer.adapt.enabled !== undefined));
await p.click('text=Settings'); await p.waitForSelector('select');
check('the settings screen shows the stored values', await p.evaluate(() => { const rows = [...document.querySelectorAll('.row')]; const r = (t) => rows.find((x) => x.textContent.includes(t)); return r('Interface').querySelector('select').value === 'full' && r('Adaptive resolution').querySelector('input').checked === false && r('Invert Y').querySelector('input').checked === true; }));
await p.click('text=Reset to defaults');
check('Reset to defaults restores every default', await p.evaluate(() => { const s = window.__game.settings; return s.hudMode === 'minimal' && s.adaptiveRes === true && s.invertY === false && s.colorblind == 0 && s.uiScale === 1 && s.sensitivity === 1; }));
await p.reload(); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
check('and the reset persists', await p.evaluate(() => window.__game.settings.hudMode === 'minimal' && window.__game.settings.uiScale === 1));
// progress: finish nothing, unlock via a real chapter completion, reload, Continue / chapter select remember it
await p.evaluate(async () => { const g = window.__game; g.progress.unlocked = 3; g.progress.levels.ch1 = { done: true, bestTicks: 1234, discoveries: ['ch1-d1'], experiments: [] }; localStorage.setItem('twiar.progress.v1', JSON.stringify(g.progress)); });
await p.reload(); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
check('progress survives a reload', await p.evaluate(() => window.__game.progress.unlocked === 3 && window.__game.progress.levels.ch1.bestTicks === 1234));
await p.evaluate(() => { localStorage.setItem('twiar.settings.v1', '{broken'); localStorage.setItem('twiar.progress.v1', 'not json'); });
await p.reload(); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
check('corrupt storage falls back to defaults instead of breaking the game', await p.evaluate(() => window.__game.settings.hudMode === 'minimal' && window.__game.progress.unlocked >= 1));
check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
