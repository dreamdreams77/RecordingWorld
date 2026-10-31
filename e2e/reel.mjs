// The instrument in a real browser: preview cursor, tick stepping, event jumping, jog wheel, ghost, freeze, omit/solo lanes,
// reel open/closed states, and the guarantee that previewing never touches the simulation.
import { chromium } from 'playwright';
import fs from 'node:fs';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const b = await chromium.launch({ executablePath: fs.existsSync(CHROME) ? CHROME : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 450 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let failed = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`); if (!ok) failed++; };
await p.goto(process.env.URL ?? 'http://localhost:4173/?quality=low&audio=0');
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
await p.evaluate(async () => {
  const g = window.__game; await g.startLevel('ch1'); g.menus.hide(); g.testNoRender = true;
  const w = g.world, plate = w.byId.get('plateA'), [px, , pz] = plate.def.pos, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0 };
  w.teleportPlayer([px + 4, 0, pz], 0); w.startRecording(0, { x0: px - 3, x1: px + 6, y0: -1, y1: 3, z0: pz - 3, z1: pz + 3 }, 'walk on');
  for (let i = 0; i < 20; i++) w.step(IDLE); w.teleportPlayer([px, 0, pz], 0); for (let i = 0; i < 40; i++) w.step(IDLE);
  w.teleportPlayer([px + 4, 0, pz], 0); for (let i = 0; i < 20; i++) w.step(IDLE); w.stopRecording();
  w.teleportPlayer([px + 4, 0, pz + 5], 0); g.selected = 0; g.pinned = null;
  window.__key = (code, shift = false, frames = 1) => { for (let i = 0; i < frames; i++) { g.input.pressed.add(code); g.input.down.add(code); if (shift) g.input.down.add('ShiftLeft'); g.playFrame(1 / 60); g.input.endFrame(); g.input.down.delete(code); g.input.down.delete('ShiftLeft'); } };
  window.__hold = (code, frames) => { for (let i = 0; i < frames; i++) { if (i === 0) g.input.pressed.add(code); g.input.down.add(code); g.playFrame(1 / 60); g.input.endFrame(); } g.input.down.delete(code); };
});
const S = (js, arg) => p.evaluate(js, arg);
check('a stored recording starts with no cursor and the reel closed', await S(() => { const g = window.__game; g.instr.lastTouch = -99; g.reel.update(); return g.instr.cursor === null && !g.reel.open; }));
await S(() => window.__key('Period'));
check('. moves the preview cursor by exactly one tick', await S(() => window.__game.instr.cursor?.tick === 1));
await S(() => window.__key('Period', false, 4)); check('four presses = four ticks', await S(() => window.__game.instr.cursor.tick === 5));
await S(() => window.__key('Comma')); check(', steps back exactly one', await S(() => window.__game.instr.cursor.tick === 4));
await S(() => window.__key('Period', true)); check('Shift moves ten ticks', await S(() => window.__game.instr.cursor.tick === 14));
await S(() => window.__hold('Period', 90)); check('holding repeats and accelerates', await S(() => window.__game.instr.cursor.tick > 40));
await S(() => window.__key('Home')); check('Home jumps to the first tick', await S(() => window.__game.instr.cursor.tick === 0));
await S(() => window.__key('End')); check('End jumps to the last tick', await S(() => window.__game.instr.cursor.tick === window.__game.world.recordings[0].length - 1));
await S(() => window.__key('Home')); await S(() => window.__key('Quote'));
const m1 = await S(() => window.__game.instr.cursor.tick); check("' jumps to the next event (the plate press)", m1 >= 19 && m1 <= 23, `tick ${m1}`);
await S(() => window.__key('Quote')); const m2 = await S(() => window.__game.instr.cursor.tick); check("' again reaches the release", m2 >= 59 && m2 <= 63, `tick ${m2}`);
await S(() => window.__key('Semicolon')); check('; goes back to the previous event', await S((m1) => window.__game.instr.cursor.tick === m1, m1));
check('previewing changed nothing in the simulation', await S(() => { const g = window.__game, w = g.world, h = w.hash(), I = g.instr; const t = I.cursor.tick; for (let i = 0; i < 300; i++) { I.scrubTo((i * 7) % 80, { quiet: true }); I.ghost(); I.jumpMarker(i % 2 ? 1 : -1); I.around(I.cursor.tick); } I.scrubTo(t, { quiet: true }); return w.hash() === h && !w.playbacks[0].active; }));
const gh = await S(() => { const g = window.__game, gh = g.instr.ghost(); g.renderer.ghost.update(gh, 1); const n = g.renderer.ghost.pool.filter((x) => x.visible).length + (g.renderer.ghost.body.visible ? 1 : 0); return { has: !!gh, n, entries: gh?.entries.filter((e) => e.alive).length }; });
check('the ghost draws the recorded objects at that moment', gh.has && gh.n >= 2, JSON.stringify(gh));
const ms = await S(() => { const g = window.__game, t0 = performance.now(); for (let i = 0; i < 200; i++) { g.instr.cursor.tick = i % 80; g.renderer.ghost.update(g.instr.ghost(), i * 0.016); } return (performance.now() - t0) / 200; });
check('ghost update is cheap', ms < 0.5, `${ms.toFixed(3)} ms/frame`);
await S((m1) => { window.__game.instr.cursor.tick = m1; }, m1);
check('the reel opens while examining a moment', await S(() => { const g = window.__game; g.reel.update(); return g.reel.open && !document.querySelector('.reel').classList.contains('closed'); }));
check('the reel names the moment: the plate press is listed', await S(() => { window.__game.reel.update(); return /pressed/.test(document.querySelector('.rl-say').innerText); }));
// commit: play from the previewed moment
await S(() => { window.__game.testHold = true; }); // the real-time loop keeps stepping between our calls; hold it so the head is exact
await S(() => window.__key('KeyT'));
const c1 = await S(() => { const w = window.__game.world, pb = w.playbacks[0]; return { active: pb.active, playing: pb.playing, head: pb.head, cursor: window.__game.instr.cursor }; });

check('T on a previewed moment plays from exactly that tick', c1.active && c1.playing && c1.cursor === null && c1.head === m1, JSON.stringify(c1));
await S(() => { window.__game.testHold = false; });
await S(() => window.__key('KeyF')); const f1 = await S(() => window.__game.world.playbacks[0].playing); check('F freezes a playing echo', f1 === false);
const hf = await S(() => window.__game.world.playbacks[0].head); await S(() => window.__hold('Space', 0)); await S(() => { for (let i = 0; i < 30; i++) { window.__game.playFrame(1 / 60); window.__game.input.endFrame(); } });
check('a frozen echo stays on its frame', (await S(() => window.__game.world.playbacks[0].head)) === hf);
await S(() => window.__key('Period')); check('stepping a frozen echo advances exactly one tick', (await S(() => window.__game.world.playbacks[0].head)) === hf + 1);
await S(() => window.__key('KeyF')); check('F again releases it', await S(() => window.__game.world.playbacks[0].playing === true));
await S(() => window.__key('KeyG')); check('G reverses the echo (rate negative)', await S(() => window.__game.world.playbacks[0].rate < 0));
await S(() => window.__key('BracketLeft')); check('[ slows it (half speed)', await S(() => Math.abs(window.__game.world.playbacks[0].rate) === 0.5));
await S(() => window.__key('KeyL')); await S(() => window.__key('KeyL')); check('L cycles the mode', await S(() => ['once', 'loop', 'pingpong', 'hold'].includes(window.__game.world.playbacks[0].mode)));
// jog wheel with the mouse: Ctrl + sideways movement scrubs and the view stays still
await S(() => { const g = window.__game; g.world.stop(0); g.instr.clear(); g.world.playbacks[0].rate = 1; g.input.down.add('ControlLeft'); g.instr.cursor = { slot: 0, tick: 30 }; g.input.dx = 20; g.yaw = 0.5; g.playFrame(1 / 60); g.input.endFrame(); });
const j = await S(() => ({ tick: window.__game.instr.cursor.tick, yaw: window.__game.yaw })); check('Ctrl + mouse movement drags through history without turning the view', j.tick > 30 && Math.abs(j.yaw - 0.5) < 1e-9, JSON.stringify(j));
await S(() => window.__game.input.down.delete('ControlLeft'));
// omit / solo through the lane API
await S(() => { const g = window.__game; g.instr.cursor = { slot: 0, tick: 40 }; });
check('omitting a lane removes it from the ghost', await S(() => { const g = window.__game; g.instr.lane('player'); return g.instr.ghost().entries.find((e) => e.id === 'player').alive === false; }));
await S(() => window.__game.instr.lane('player')); // bring the player back first
check('solo isolates one object', await S(() => { const g = window.__game; g.instr.lane('plateA', true); const pb = g.world.playbacks[0]; return pb.muted.size === pb.rec.tracks.size - 1 && !pb.muted.has('plateA'); }));
await S(() => { const g = window.__game; g.instr.lane('plateA', true); }); check('solo again restores everything', await S(() => window.__game.world.playbacks[0].muted.size === 0));
// edge cases
check('stepping with no recording is harmless', await S(() => { const g = window.__game; g.selected = 3; g.instr.scrubBy(1); g.instr.freezeHere(); g.instr.jumpMarker(1); g.instr.playHere(); g.selected = 0; return true; }));
check('starting a recording closes the preview and shows the recording reel', await S(() => { const g = window.__game; g.instr.cursor = { slot: 0, tick: 10 }; g.world.stop(0); g.selected = 1; g.pinned = { x0: -3, x1: 3, y0: -1, y1: 3, z0: -3, z1: 3 }; window.__key('KeyR'); g.reel.update(); const ok = !!g.world.recorder && g.instr.cursor === null && g.reel.open && document.querySelector('.reel').classList.contains('recording'); window.__key('KeyR'); return ok; }));
check('an erased slot clears the cursor', await S(() => { const g = window.__game; g.selected = 0; g.instr.cursor = { slot: 0, tick: 5 }; window.__key('Backspace'); return g.instr.cursor === null && !g.world.recordings[0]; }));
check('rolling back restores it (Shift+Backspace)', await S(() => { window.__key('Backspace', true); return !!window.__game.world.recordings[0]; }));
// save / load while a cursor exists: the cursor is transient, the recording and mutes are not
const snapOk = await S(() => { const g = window.__game; g.instr.cursor = { slot: 0, tick: 12 }; g.world.muteTrack(0, 'player'); const snap = g.world.snapshot(), h = g.world.hash(); g.world.restore(JSON.parse(JSON.stringify(snap))); return g.world.hash() === h && g.world.playbacks[0].muted.has('player'); });
check('save/load with a preview open is exact', snapOk);
// one real rendered frame with everything on: no shader or draw errors
await S(() => { const g = window.__game; g.world.muteTrack(0, 'player', false); g.instr.cursor = { slot: 0, tick: 40 }; g.instr.poke(); g.testNoRender = false; });
await p.waitForFunction(() => window.__game.renderer.ghost.group.visible, null, { timeout: 120000 }).then(() => check('the ghost is part of a real rendered frame', true), () => check('the ghost is part of a real rendered frame', false));
await p.screenshot({ path: new URL('../docs/screenshots/14-reel-preview.png', import.meta.url).pathname, timeout: 120000 }).catch(() => {});
check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await b.close(); process.exit(failed ? 1 : 0);
