// Audio lifecycle in a real browser audio context: do echo voices start when an echo sings, end when it stops / is omitted /
// is erased / the chapter changes, avoid piling up over repeated cycles, and stay clear of clipping with six echoes?
// (Whether any of it SOUNDS good cannot be checked here.)
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto('http://localhost:4173/?quality=low'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await p.evaluate(async () => {
  const g = window.__game; g.audio.init(); g.applySettings(); await g.startLevel('ch4'); g.menus.hide(); g.testNoRender = true; g.testHold = true;
  const w = g.world, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 };
  w.caps.slots = 6; w.recordings = Array(6).fill(null); w.playbacks = Array(6).fill(null); w.undo = Array.from({ length: 6 }, () => []); w.caps.modes = ['once', 'loop', 'pingpong', 'hold'];
  window.__IDLE = IDLE;
  window.__frames = (n) => { for (let i = 0; i < n; i++) { g.testHold = false; g.playFrame(1 / 60); g.input.endFrame(); g.testHold = true; } };
  window.__sing = (slot, x, ticks = 90) => { w.teleportPlayer([x, 0, -2], 0); w.startRecording(slot, { x0: x - 2, x1: x + 2, y0: -1, y1: 4, z0: -5, z1: 1 }, 's'); for (let i = 0; i < ticks; i++) w.step({ ...IDLE, tone: 3 }); w.stopRecording(); w.teleportPlayer([0, 0, 6], 0); };
  window.__voices = () => [...g.audio.voices.keys()].filter((k) => /\|voice$/.test(k) && !k.startsWith('me'));
});
const S = (f, a) => p.evaluate(f, a);
check('the audio engine is live', await S(() => window.__game.audio.ready === true));
await S(() => { window.__sing(0, 0); const w = window.__game.world; w.play(0, { mode: 'loop' }); window.__frames(12); });
check('an echo that sings has a voice', (await S(() => window.__voices())).length === 1);
await S(() => { window.__game.world.stop(0); window.__frames(20); });
check('the voice ends when the echo stops', (await S(() => window.__voices())).length === 0);
await S(() => { const w = window.__game.world; w.play(0, { mode: 'loop' }); window.__frames(12); });
await S(() => { window.__game.world.muteTrack(0, 'player'); window.__frames(20); });
check('the voice ends when the singer is omitted', (await S(() => window.__voices())).length === 0);
await S(() => { const w = window.__game.world; w.muteTrack(0, 'player', false); window.__frames(12); });
check('and returns when un-omitted', (await S(() => window.__voices())).length === 1);
await S(() => { window.__game.world.playFrom(0, 40, { frozen: true }); window.__frames(40); });
check('a frozen singing echo holds its note (it is the same sound, held)', (await S(() => window.__voices())).length === 1);
await S(() => { window.__game.world.eraseRecording(0); window.__frames(20); });
check('erasing the recording silences it', (await S(() => window.__voices())).length === 0);
// repeated cycles must not accumulate voices or audio nodes
const base = await S(() => window.__game.audio.voices.size);
await S(() => { const w = window.__game.world; for (let i = 0; i < 40; i++) { window.__sing(0, 0, 40); w.play(0, { mode: i % 2 ? 'loop' : 'once' }); window.__frames(10); w.stop(0); window.__frames(10); } });
check('40 record/play/stop cycles leave no voices behind', (await S(() => window.__voices())).length === 0 && (await S(() => window.__game.audio.voices.size)) <= base + 1, `voices ${await S(() => window.__game.audio.voices.size)}`);
// six at once: loudness and clipping
await S(() => { for (let i = 0; i < 6; i++) window.__sing(i, -3 + i, 120); const w = window.__game.world; w.playAll({ mode: 'loop' }); window.__frames(20); });
check('six singing echoes: six voices', (await S(() => window.__voices())).length === 6, String((await S(() => window.__voices())).length));
const peak = await S(async () => { const a = window.__game.audio, buf = new Float32Array(a.analyser.fftSize); let pk = 0; for (let i = 0; i < 40; i++) { window.__frames(2); a.analyser.getFloatTimeDomainData(buf); for (const v of buf) pk = Math.max(pk, Math.abs(v)); await new Promise((r) => setTimeout(r, 25)); } return pk; });
check('and the master output does not clip', peak < 0.98, `peak ${peak.toFixed(3)}`);
await S(() => { window.__game.world.stop(0); for (let i = 0; i < 6; i++) window.__game.world.stop(i); window.__frames(20); });
check('stopping all of them silences all of them', (await S(() => window.__voices())).length === 0);
// chapter change retires everything, pause suspends the context
await S(() => { window.__game.world.playAll({ mode: 'loop' }); window.__frames(10); });
await S(async () => { await window.__game.startLevel('ch1'); });
check('loading another chapter leaves no old voices', (await S(() => [...window.__game.audio.voices.keys()].filter((k) => !k.startsWith('me') && /\|/.test(k) && k !== 'interference').length)) === 0);
await S(() => { window.__game.pause(); });
check('pausing suspends the audio context', await S(() => window.__game.audio.ctx.state === 'suspended'));
await S(() => { window.__game.resume(); });
await p.waitForTimeout(300);
check('resuming brings it back', await S(() => window.__game.audio.ctx.state === 'running'));
check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
