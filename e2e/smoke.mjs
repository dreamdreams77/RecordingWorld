// End-to-end smoke test in real (software-GL) Chromium. Drives the actual Game object through its input
// path, checks recording → playback → progression → save/load → ending, audio output, and captures
// real screenshots into docs/screenshots. Run: npm run dev (other terminal) then npm run e2e.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.URL ?? 'http://localhost:4173/';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };
const shot = (n) => page.screenshot({ path: `${OUT}${n}.png` });

// -- boot and title
await page.goto(`${BASE}?quality=low&audio=1`);
await page.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await page.waitForTimeout(1500); await shot('01-title');
check('title screen reached with a live attract-mode scene', true);

// -- Begin → chapter I
await page.click('text=Begin');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
check('chapter I loads from the menu', true);
await page.evaluate(() => { window.__game.testNoRender = true; });

// helper: run N frames with held keys
const frames = (n, keys = [], extra = '') => page.evaluate(([n, keys, extra]) => {
  const g = window.__game;
  for (let i = 0; i < n; i++) { for (const k of keys) g.input.down.add(k); if (extra) eval(extra); g.playFrame(1 / 60); g.input.endFrame(); for (const k of keys) g.input.down.delete(k); }
}, [n, keys, extra]);
const hit = (code) => page.evaluate((c) => { window.__game.input.pressed.add(c); window.__game.input.down.add(c); }, code);
const walkTo = (x, z) => page.evaluate(([x, z]) => {
  const g = window.__game, P = g.world.player.st;
  for (let i = 0; i < 1500; i++) {
    const dx = x - P[0], dz = z - P[2], d = Math.hypot(dx, dz); if (d < 0.25) break;
    g.yaw = Math.atan2(-dx, -dz); g.input.down.add('KeyW'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete('KeyW');
  }
}, [x, z]);
const state = (js) => page.evaluate(js);

// -- real input path: frame, pin, record, play
await walkTo(-5, -12);
await state(() => { window.__game.pitch = -1.2; });
await hit('KeyQ'); await frames(1);
await state(() => { window.__game.input.clicks.push(0); });
await frames(1);
check('left click pins a recording volume', await state(() => !!window.__game.pinned));
await hit('KeyR'); await frames(1);
check('R starts recording', await state(() => !!window.__game.world.recorder));
await frames(200);
await hit('KeyR'); await frames(1);
const rec = await state(() => { const r = window.__game.world.recordings[0]; return r && { len: r.length, kf: r.keyframes, tracks: r.tracks.size }; });
check('recording stored with real keyframes', rec && rec.len > 150 && rec.kf > 0, JSON.stringify(rec));
await state(() => { window.__game.pitch = 0; });
await walkTo(0, -14);
await hit('KeyL'); await frames(1); await hit('KeyT'); await frames(60);
check('replay: echo presses the plate and opens the door', await state(() => window.__game.world.R.get('plateA') === 1 && window.__game.world.byId.get('doorA').st[0] > 0.9));
await state(() => { const g = window.__game; g.yaw = 0.2; g.pitch = -0.06; g.testNoRender = false; });
await frames(2); await page.waitForTimeout(800); await shot('02-echo-holds-door');
await state(() => { window.__game.testNoRender = true; });

// -- frame mode + conflict visual for screenshots
await state(() => { const g = window.__game; g.frameMode = true; g.testNoRender = false; });
await frames(2); await page.waitForTimeout(600); await shot('03-frame-mode');
await state(() => { const g = window.__game; g.frameMode = false; g.testNoRender = true; });

// -- progression: teleport to the exit and complete the chapter
await state(() => { const g = window.__game; g.world.teleportPlayer([0, 0, -85], 0); });
await frames(3);
check('reaching the exit completes the chapter and shows the summary', await state(() => window.__game.state === 'ended' && document.getElementById('complete').classList.contains('on')));
await state(() => { window.__game.testNoRender = false; }); await page.waitForTimeout(700); await shot('04-chapter-complete');
check('progress saved: chapter II unlocked', await state(() => JSON.parse(localStorage.getItem('twiar.progress.v1')).unlocked >= 2));

// -- save / load round trip (exact world hash)
await page.click('text=Replay chapter');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await state(() => { window.__game.testNoRender = true; });
await walkTo(-5, -12); await frames(30);
const before = await state(() => { const g = window.__game; g.quickSave(); return { h: g.world.hash(), t: g.world.tick }; });
await frames(100);
const snap = await state(() => !!localStorage.getItem('twiar.snapshot.v1'));
check('quick-save stored a snapshot', snap);
await state(async () => { await window.__game.toTitle(); });
await page.waitForFunction(() => window.__game.state === 'title', null, { timeout: 90000 });
await state(() => { window.__game.testHold = true; }); // freeze the sim so real-time frames cannot advance it before we read the hash
await page.click('text=Continue');
await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
const after = await state(() => ({ h: window.__game.world.hash(), t: window.__game.world.tick }));
check('load restores the exact simulation state', before.h === after.h && before.t === after.t, `${before.h} vs ${after.h} @ ${before.t}/${after.t}`);
await state(() => { window.__game.testHold = false; });


// -- recovery: rollback of recordings, rewind, section reset (through the real key path)
await state(async () => { await window.__game.startLevel('ch1'); window.__game.menus.hide(); window.__game.testNoRender = true; });
await walkTo(-5, -12);
await state(() => { const g = window.__game; g.pitch = -1.2; g.input.pressed.add('KeyR'); g.playFrame(1 / 60); g.input.endFrame(); });
await frames(60);
await hit('KeyR'); await frames(1);
check('recording stored for the rollback test', await state(() => !!window.__game.world.recordings[0]));
await hit('Backspace'); await frames(1);
check('Backspace erases the slot', await state(() => window.__game.world.recordings[0] === null));
await state(() => { const g = window.__game; g.input.down.add('ShiftLeft'); g.input.pressed.add('Backspace'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete('ShiftLeft'); });
check('Shift+Backspace rolls the recording back', await state(() => !!window.__game.world.recordings[0]));
const rw = await state(() => { const g = window.__game; g.pushRewind(); const t0 = g.world.tick, x0 = g.world.player.st[0]; for (let i = 0; i < 200; i++) { g.input.down.add('KeyD'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete('KeyD'); } const moved = g.world.player.st[0] - x0; g.input.pressed.add('F6'); g.playFrame(1 / 60); g.input.endFrame(); return { moved, back: Math.abs(g.world.player.st[0] - x0) < 0.05, tickBack: g.world.tick < t0 + 20 }; });
check('F6 rewinds the whole world to an earlier capture', rw.moved > 2 && rw.back && rw.tickBack, JSON.stringify(rw));
const rs = await state(() => { const g = window.__game; g.world.byId.get('plateA').st[0] = 0; const before = g.director.sectionIndex; g.world.teleportPlayer([3, 0, -20], 0); g.input.down.add('ShiftLeft'); g.input.pressed.add('KeyK'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete('ShiftLeft'); return { before, recs: !!g.world.recordings[0], x: g.world.player.st[0] }; });
check('Shift+K resets the section and keeps your recordings', rs.recs && Math.abs(rs.x - 3) > 0.5, JSON.stringify(rs));

// -- canon through the real game path: ledger + selected slot, consequences persist and shape a later chapter
await state(async () => { localStorage.removeItem('twiar.progress.v1'); await window.__game.startLevel('ch3'); window.__game.menus.hide(); window.__game.testNoRender = true; });
await state(() => { const g = window.__game; g.world.teleportPlayer([0, 0, -102], 0); g.director.loadTape(g.director.tapes.find((t) => t.id === 'tE'), 0); g.world.play(0, { mode: 'hold' }); for (let i = 0; i < 160; i++) { g.input.endFrame(); g.playFrame(1 / 60); } });
await state(() => { const g = window.__game, P = g.world.player.st; g.world.teleportPlayer([5, 0, -131.5], 0); const e = g.world.eye(); g.yaw = Math.atan2(-(5 - e[0]), -(-134 - e[2])); g.pitch = Math.atan2(0.6 - e[1], Math.hypot(5 - e[0], -134 - e[2])); g.selected = 0; g.input.pressed.add('KeyE'); g.playFrame(1 / 60); g.input.endFrame(); g.playFrame(1 / 60); g.input.endFrame(); });
const cn = await state(() => ({ canon: window.__game.progress.canon?.ch3, pin: window.__game.world.pins.forkE, sealedW: window.__game.world.sealed.has('forkW'), led: window.__game.world.R.get('ledE') }));
check('E at the ledger canonises the selected history and records the choice', cn.canon === 'archive' && cn.pin > 0.9 && cn.sealedW && cn.led === 1, JSON.stringify(cn));
await state(async () => { await window.__game.startLevel('ch6'); window.__game.menus.hide(); });
const c6 = await state(() => ({ witness: window.__game.world.byId.has('witnessA') && !window.__game.world.byId.has('witnessO'), slots: window.__game.world.caps.slots, perk: window.__game.perk }));
check('the choice shapes Chapter VI (a witness waits; an extra slot)', c6.witness && c6.slots === 5 && /Archive/.test(c6.perk ?? ''), JSON.stringify(c6));
await state(() => { window.__game.testNoRender = false; }); await page.waitForTimeout(800); await shot('12-canon-consequence');

// -- every chapter loads and renders without errors
await state(() => { window.__game.testNoRender = false; });
for (const id of ['ch2', 'ch3', 'ch4', 'ch5', 'ch6']) {
  await state(async (id) => { await window.__game.startLevel(id); window.__game.menus.hide(); }, id);
  await page.waitForTimeout(1200); await shot(`10-${id}`);
  check(`${id} loads and renders`, await state(() => window.__game.state === 'play'));
}

// -- audio produces signal
await page.waitForTimeout(1500);
const audio = await state(() => { const a = window.__game.audio; return { state: a.ctx?.state, rms: a.meter.rms, voices: a.meter.voices }; });
check('audio context running and emitting signal', audio.state === 'running' && audio.rms > 0.0005, JSON.stringify(audio));

// -- the ending
await state(async () => { await window.__game.startLevel('ch6'); window.__game.menus.hide(); window.__game.testNoRender = true; window.__game.beginEnding(); });
await state(() => { const g = window.__game; for (let i = 0; i < 60 * 40; i++) g.cineFrame(1 / 60); g.testNoRender = false; });
await page.waitForTimeout(800); await shot('05-ending-reveal');
await state(() => { window.__game.testNoRender = true; const g = window.__game; for (let i = 0; i < 60 * 14; i++) g.cineFrame(1 / 60); });
check('ending reaches the Release/Hold choice', await state(() => document.getElementById('choice').classList.contains('on')));
await page.click('text=Release the recording');
await state(() => { const g = window.__game; for (let i = 0; i < 60 * 12; i++) g.cineFrame(1 / 60); });
check('ending completes with credits and unlocks the sandbox', await state(() => document.getElementById('credits').classList.contains('on') && JSON.parse(localStorage.getItem('twiar.progress.v1')).sandbox === true));
await state(() => { window.__game.testNoRender = false; }); await page.waitForTimeout(600); await shot('06-ending-release');

// -- sandbox uses the same simulation
await state(async () => { await window.__game.startLevel('sandbox'); window.__game.menus.hide(); });
check('sandbox starts with six slots', await state(() => window.__game.world.caps.slots === 6));
await state(() => { const g = window.__game; g.testNoRender = true; g.world.spawn({ type: 'crate', pos: [0, 5, 10], size: [1, 1, 1] }); for (let i = 0; i < 120; i++) g.world.step({ mx: 0, mz: 0, jump: false, interact: false, tone: 0 }); });
check('sandbox-spawned crates obey physics', await state(() => { const c = [...window.__game.world.items].filter((x) => x.def.dyn)[0]; return c && Math.abs(c.st[1] - 0.5) < 0.05; }));
await state(() => { window.__game.testNoRender = false; }); await page.waitForTimeout(600); await shot('11-sandbox');

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} e2e check(s) FAILED` : '\nAll e2e checks passed');
process.exit(failed ? 1 : 0);
