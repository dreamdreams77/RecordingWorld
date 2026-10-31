// The REAL DOM keyboard path: Playwright sends genuine keydown/keyup events to the page (not injected state). Covers movement,
// jumping, frame mode, slot selection, the hint key, recording, the instrument keys (, . ; ' F T G L [ ]), the sandbox/note
// conflicts, and focus loss (a held key must not stay stuck when the window loses focus).
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto('http://localhost:4173/?quality=low&audio=0'); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await p.keyboard.press('Enter');                       // the real Enter on the title screen begins the game
await p.waitForFunction(() => window.__game.state === 'play', null, { timeout: 120000 });
await p.evaluate(() => { const g = window.__game; g.testNoRender = true; g.input.lock = () => { g.input.locked = true; }; g.input.locked = true; g.world.teleportPlayer([-5, 0, -12], 0); g.yaw = 0; g.pitch = 0; });
const S = (f, a) => p.evaluate(f, a), until = (f, a) => p.waitForFunction(f, a, { timeout: 20000 }).then(() => true, () => false);
await until(() => { const g = window.__game; window.__t0 ??= g.world.tick; return g.world.tick > window.__t0 + 45; }); // let the first frames (shader compilation) finish: the loop must be running
const z0 = await S(() => window.__game.world.player.st[2]);
await p.keyboard.down('KeyW'); await until(() => window.__game.world.player.st[2] < -12.8 || false); await p.keyboard.up('KeyW');
check('holding W (real keydown/keyup) walks forward', (await S(() => window.__game.world.player.st[2])) < z0 - 0.8, `z ${z0.toFixed(2)} → ${(await S(() => window.__game.world.player.st[2])).toFixed(2)}`);
const zStop = await S(() => window.__game.world.player.st[2]); await p.waitForTimeout(500);
check('releasing W stops the walk (no stuck key)', Math.abs((await S(() => window.__game.world.player.st[2])) - zStop) < 0.35);
await p.keyboard.down('KeyS'); await p.waitForTimeout(300); await p.evaluate(() => window.dispatchEvent(new Event('blur'))); const zb = await S(() => window.__game.world.player.st[2]); await p.waitForTimeout(500);
check('losing window focus while a key is held releases it', Math.abs((await S(() => window.__game.world.player.st[2])) - zb) < 0.4); await p.keyboard.up('KeyS');
await S(() => { window.__maxY = 0; const g = window.__game; clearInterval(window.__iv); window.__iv = setInterval(() => { window.__maxY = Math.max(window.__maxY, g.world.player.st[1]); }, 8); });
await p.keyboard.press('Space'); await p.waitForTimeout(500); check('Space jumps (real keypress)', (await S(() => window.__maxY)) > 1.5, `peak y ${(await S(() => window.__maxY)).toFixed(2)} (standing 0.90)`);
await p.waitForTimeout(900);
await p.keyboard.press('KeyQ'); check('Q toggles frame mode', await until(() => window.__game.frameMode === true)); await p.keyboard.press('KeyQ'); check('and again turns it off', await until(() => window.__game.frameMode === false));
await p.keyboard.press('Digit2'); check('2 selects slot 2', await until(() => window.__game.selected === 1)); await p.keyboard.press('Digit1'); await until(() => window.__game.selected === 0);
await p.keyboard.press('KeyH'); check('H shows the hint', await until(() => window.__game.hud.q('#folio .hint').textContent.length > 0));
// record yourself for ~1.5 s with the real R key, then walk the timeline with real keys
await S(() => { const g = window.__game; g.world.teleportPlayer([-5, 0, -12], 0); g.pitch = -1.2; });
await p.keyboard.press('KeyR'); check('R starts a recording', await until(() => !!window.__game.world.recorder)); await p.waitForTimeout(900); await p.keyboard.press('KeyR');
check('R again stores it', await until(() => !window.__game.world.recorder && !!window.__game.world.recordings[0]));
const L = await S(() => window.__game.world.recordings[0].length); check('the recording has real length', L > 30, `${L} ticks`);
await p.keyboard.press('Period'); check('"." steps the preview cursor exactly one tick', await until(() => window.__game.instr.cursor?.tick === 1));
await p.keyboard.press('Period'); await p.keyboard.press('Comma'); check('"," steps back one', await until(() => window.__game.instr.cursor?.tick === 1));
await p.keyboard.press('End'); check('End goes to the last tick', await until((L) => window.__game.instr.cursor?.tick === L - 1, L)); await p.keyboard.press('Home'); check('Home goes to the first', await until(() => window.__game.instr.cursor?.tick === 0));
await p.keyboard.down('Period'); await p.waitForTimeout(1200); await p.keyboard.up('Period'); const held = await S(() => window.__game.instr.cursor.tick); check('holding "." repeats and accelerates', held > 4, `reached tick ${held}`);
await S(() => { window.__game.world.teleportPlayer([-5, 0, -9], 0); });
await p.keyboard.press('KeyT'); check('T on a preview plays from there', await until(() => window.__game.world.playbacks[0].active && window.__game.world.playbacks[0].playing));
await p.keyboard.press('KeyF'); check('F freezes the echo', await until(() => window.__game.world.playbacks[0].playing === false)); await p.keyboard.press('KeyF'); check('F again releases it', await until(() => window.__game.world.playbacks[0].playing === true));
await p.keyboard.press('KeyG'); check('G reverses', await until(() => window.__game.world.playbacks[0].rate < 0)); await p.keyboard.press('KeyG');
await p.keyboard.press('BracketLeft'); check('[ slows to half', await until(() => Math.abs(window.__game.world.playbacks[0].rate) === 0.5)); await p.keyboard.press('BracketRight');
await p.keyboard.press('KeyL'); check('L cycles the mode', await until(() => window.__game.world.playbacks[0].mode !== 'once'));
await p.keyboard.press('KeyY'); check('Y stops the echo', await until(() => !window.__game.world.playbacks[0].active));
await p.keyboard.press('Escape'); check('Escape pauses', await until(() => window.__game.state === 'pause'));
check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
