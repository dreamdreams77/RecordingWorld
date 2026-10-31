// Leak hunt in a real browser: cycle through every chapter several times (plus section resets and rewinds) and watch
// GPU resource counts (geometries / textures / programs), the JS heap, DOM node count and event listeners. Software GL, so
// frame times mean nothing here — only whether anything GROWS.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.addInitScript(() => { const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener; window.__listeners = 0; EventTarget.prototype.addEventListener = function (...a) { window.__listeners++; return add.apply(this, a); }; EventTarget.prototype.removeEventListener = function (...a) { window.__listeners--; return rem.apply(this, a); }; });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto('http://localhost:4173/?quality=low&audio=0'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
const sample = async () => { const f0 = await p.evaluate(() => window.__game.renderer.renderer.info.render.frame); await p.waitForFunction((f) => window.__game.renderer.renderer.info.render.frame > f + 4, f0, { timeout: 120000 }); return p.evaluate(() => { window.gc?.(); const r = window.__game.renderer.renderer.info; return { geo: r.memory.geometries, tex: r.memory.textures, prog: r.programs?.length ?? 0, heap: performance.memory.usedJSHeapSize / 1048576, dom: document.getElementsByTagName('*').length, lis: window.__listeners, voices: window.__game.audio.voices.size }; }); };
const cycle = async () => { for (const id of ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6']) { await p.evaluate(async (id) => { const g = window.__game; g.testNoRender = false; await g.startLevel(id); g.menus.hide(); const w = g.world; for (let i = 0; i < 3; i++) { w.startRecording(0, { x0: -4, x1: 4, y0: -1, y1: 4, z0: -4, z1: 8 }, 'm'); for (let k = 0; k < 30; k++) w.step({ mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 }); w.stopRecording(); w.play(0, { mode: 'loop' }); g.resetSection?.(); g.rewind?.(); } }, id); await p.waitForTimeout(400); } };
await cycle(); await cycle();                                   // warm up: first loads compile programs and fill caches
const base = await sample(); for (let i = 0; i < 4; i++) await cycle(); const after = await sample();
console.log('baseline', JSON.stringify(base)); console.log('after   ', JSON.stringify(after));
check('GPU geometries do not grow across 24 chapter loads', after.geo <= base.geo + 6, `${base.geo} → ${after.geo}`);
check('GPU textures do not grow', after.tex <= base.tex + 6, `${base.tex} → ${after.tex}`);
check('shader programs do not grow', after.prog <= base.prog + 4, `${base.prog} → ${after.prog}`);
check('JS heap does not grow materially (MB)', after.heap - base.heap < 25, `${base.heap.toFixed(1)} → ${after.heap.toFixed(1)}`);
check('DOM nodes do not grow', after.dom <= base.dom + 40, `${base.dom} → ${after.dom}`);
check('event listeners do not accumulate', after.lis <= base.lis + 10, `${base.lis} → ${after.lis}`);
check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
