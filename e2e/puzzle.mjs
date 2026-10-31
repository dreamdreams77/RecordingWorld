// "The Witness" (VI) solved in a real browser through the real input path only: Q, click, R, T, aim at the echo, O.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } }); const errors = [];
p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto('http://localhost:4173/?quality=low&audio=0'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await p.evaluate(async () => {
  const g = window.__game; await g.startLevel('ch6'); g.menus.hide(); g.testNoRender = true; g.settings.hints = false;
  g.world.caps.slots = 4; g.world.caps.maxVolume = [18, 12, 26];
  window.__key = (code, n = 1, shift = false) => { for (let i = 0; i < n; i++) { g.input.pressed.add(code); g.input.down.add(code); if (shift) g.input.down.add('ShiftLeft'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete(code); g.input.down.delete('ShiftLeft'); } };
  window.__frames = (n) => { for (let i = 0; i < n; i++) { g.playFrame(1 / 60); g.input.endFrame(); } };
  window.__look = (tx, ty, tz) => { const e = g.world.eye(); const dx = tx - e[0], dy = ty - e[1], dz = tz - e[2]; g.yaw = Math.atan2(-dx, -dz); g.pitch = Math.atan2(dy, Math.hypot(dx, dz)); };
});
const S = (f, a) => p.evaluate(f, a);
// stand on the plate; the Eye sees you; the door is shut
await S(() => { const g = window.__game; g.world.teleportPlayer([6, 0, -137], 0); window.__frames(20); });
check('standing on the plate: pressed, seen, door shut', await S(() => { const w = window.__game.world; return w.R.get('xP') === 1 && w.R.get('xEye1') === 1 && w.byId.get('g1').st[0] < 0.05; }));
// Q, aim down, click to pin, R to record, stay, R to stop — exactly as a player would
await S(() => { const g = window.__game; g.pitch = -1.2; window.__key('KeyQ'); g.input.clicks.push(0); window.__frames(2); });
check('frame pinned around you and the plate', await S(() => !!window.__game.pinned));
await S(() => { window.__key('KeyR'); window.__frames(70); window.__key('KeyR'); });
check('recording stored (you, the plate and the Eye)', await S(() => { const r = window.__game.world.recordings[0]; return !!r && r.tracks.has('player') && r.tracks.has('xP'); }));
// step out into the hall opposite the doorway, play it back
await S(() => { const g = window.__game; g.world.teleportPlayer([0, 0, -137], 0); g.pinned = null; window.__frames(5); window.__key('KeyL'); window.__key('KeyT'); window.__frames(30); window.__reelOpen = (window.__game.reel.update(), window.__game.reel.open); });
check('L set the loop mode', await S(() => window.__game.world.playbacks[0].mode === 'loop'));
check('replay: the echo of you stands on the plate and the Eye sees it — the door stays shut', await S(() => { const w = window.__game.world; return w.playbacks[0].active && w.R.get('xP') === 1 && w.R.get('xEye1') === 1 && w.byId.get('g1').st[0] < 0.2; }));
// the reel opened by itself while handling the echo
check('the reel opened by itself when the echo started playing', await S(() => window.__reelOpen === true));
// aim at the echo and press O: leave yourself out of your own memory
await S(() => { const w = window.__game.world; const it = w.playbacks[0].items.get('player'); window.__look(it.st[0], it.st[1], it.st[2]); window.__frames(2); window.__key('KeyO'); });
check('O on the aimed echo leaves it out of the recording', await S(() => window.__game.world.playbacks[0].muted.has('player')));
await S(() => window.__frames(200));
check('omitting only yourself is not enough: the Eye in the frame remembers seeing you', await S(() => { const w = window.__game.world; return w.R.get('xEye1') === 1 && w.byId.get('g1').st[0] < 0.1; }));
check('the causality read-out names the echo as the reason', await S(() => { const w = window.__game.world; const x = w.explain('xEye1'); return x.echoDriven === true; }));
// the Eye's own memory: aim at it and leave it out too
await S(() => { const w = window.__game.world; window.__look(8.6, 2.6, -137); window.__frames(2); window.__key('KeyO'); });
check('O on the Eye’s echo leaves its memory out as well', await S(() => window.__game.world.playbacks[0].muted.has('xEye1')));
await S(() => window.__frames(300));
check('the door opens: the plate still remembers being pressed, nobody is seen', await S(() => window.__game.world.byId.get('g1').st[0] > 0.98));
check('and it was the reconciliation that did it (plate down, Eye blind)', await S(() => { const w = window.__game.world; return w.R.get('xP') === 1 && w.R.get('xEye1') === 0; }));
// the reverse path: put yourself back (O again) and the door shuts
await S(() => { window.__game.world.muteTrack(0, 'player', false); window.__frames(300); });
await S(() => { const w = window.__game.world; const it = w.playbacks[0].items.get('xEye1'); });
check('putting yourself back (O again) closes it again', await S(() => window.__game.world.byId.get('g1').st[0] < 0.1));
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
