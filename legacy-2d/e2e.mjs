// tools/e2e.mjs
// End-to-end check in a real browser. It drives the page with the keyboard and mouse the way a
// player would, asserts the outcomes, and with --screenshots writes images taken from the game's
// canvas into docs/screenshots/. Development only: not part of the runtime or the build.
//
//   npm run e2e                     checks only
//   npm run e2e -- --screenshots    also regenerate docs/screenshots/*.png
//
// Browser: set CHROME_PATH to a Chrome/Chromium binary, or install the devDependencies and the
// bundled Chromium is used.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8123);
const URL_ROOT = `http://localhost:${PORT}/`;
const WANT_SHOTS = process.argv.includes('--screenshots');
const SHOT_DIR = path.join(root, 'docs', 'screenshots');
const STORE_KEY = 'the-world-is-a-recording.v1';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadPuppeteer() {
  let puppeteer;
  try {
    puppeteer = (await import('puppeteer-core')).default;
  } catch {
    throw new Error('puppeteer-core is not installed. Run `npm install` (dev dependencies) first.');
  }
  if (process.env.CHROME_PATH) {
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true, defaultViewport: { width: 1280, height: 720 } });
  }
  let chromium;
  try {
    chromium = (await import('@sparticuz/chromium')).default;
  } catch {
    throw new Error('@sparticuz/chromium is not installed. Run `npm install`, or set CHROME_PATH.');
  }
  return puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
    defaultViewport: { width: 1280, height: 720 },
  });
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(URL_ROOT);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(100);
  }
  throw new Error('static server did not start');
}

async function main() {
  const server = spawn(process.execPath, [path.join(root, 'tools', 'serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  let browser;
  try {
    await waitForServer();
    browser = await loadPuppeteer();
    // Clipboard access is granted before the page loads; granting it afterwards is not enough in headless Chrome.
    await browser.defaultBrowserContext().overridePermissions(new URL(URL_ROOT).origin, ['clipboard-read', 'clipboard-sanitized-write']);
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    // The save-code prompts are browser dialogs. Answer the one a step is waiting for; otherwise
    // dismiss it, so a stray prompt can never hang the run.
    let dialogReply = null;
    page.on('dialog', (d) => { const reply = dialogReply; dialogReply = null; if (reply) reply(d); else d.dismiss(); });
    await page.goto(URL_ROOT, { waitUntil: 'load' });
    await page.waitForFunction(() => globalThis.__menu && globalThis.__game, { timeout: 15000 });

    const screen = () => page.evaluate(() => globalThis.__menu.screen);
    const press = async (k) => { await page.keyboard.press(k); await sleep(120); };
    const stored = () => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, STORE_KEY);
    const shot = async (name) => {
      if (!WANT_SHOTS) return;
      const data = await page.evaluate(() => document.getElementById('scene').toDataURL('image/png'));
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      fs.writeFileSync(path.join(SHOT_DIR, name), Buffer.from(data.split(',')[1], 'base64'));
      console.log(`      saved docs/screenshots/${name}`);
    };

    // ---- menus ----
    await sleep(400);
    check('opens on the title screen', (await screen()) === 'title');
    await shot('title.png');

    await press('ArrowDown'); await press('Enter');
    check('LEVEL SELECT opens from the title', (await screen()) === 'levels');
    await shot('level-select.png');
    await press('Escape');
    check('Esc returns to the title', (await screen()) === 'title');

    await press('ArrowDown'); await press('ArrowDown'); await press('Enter');
    check('SETTINGS opens', (await screen()) === 'settings');
    await press('ArrowDown'); await press('ArrowDown'); await press('Enter');
    const afterToggle = await stored();
    check('LARGE TEXT toggles and is saved', afterToggle && afterToggle.settings && afterToggle.settings.largeText === true);
    await shot('settings-large-text.png');
    await press('Enter'); // turn large text back off, leaving the default look for play
    check('LARGE TEXT can be turned back off', ((await stored()) || {}).settings?.largeText === false);
    await press('Escape');

    // ---- play level 1 through real pointer input ----
    await press('Enter'); // BEGIN
    check('BEGIN enters play', (await screen()) === 'playing');
    check('the first level is LATCH', await page.evaluate(() => globalThis.__game.level.id === 'l1-latch'));

    const geo = await page.evaluate(() => {
      const r = document.getElementById('scene').getBoundingClientRect();
      const s = Math.min(r.width / 960, r.height / 540);
      return { left: r.left, top: r.top, s, ox: (r.width - 960 * s) / 2, oy: (r.height - 540 * s) / 2 };
    });
    const toScreen = (x, y) => ({ x: geo.left + geo.ox + x * geo.s, y: geo.top + geo.oy + y * geo.s });

    // Drag a region over the whole room.
    const a = toScreen(2, 2), b = toScreen(958, 538);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 12 });
    await page.mouse.up();
    await sleep(100);
    const regionOk = await page.evaluate(() => !!globalThis.__game.region && globalThis.__game.region.w > 900);
    check('dragging selects a region', regionOk);

    // Record while dropping a ball in the zone.
    await press(' ');
    check('Space starts a recording', await page.evaluate(() => !!globalThis.__game.recorder));
    const drop = toScreen(80, 190);
    await page.mouse.click(drop.x, drop.y);
    const t0 = await page.evaluate(() => globalThis.__game.world.tick);
    await page.waitForFunction((t) => globalThis.__game.world.tick - t >= 600, { timeout: 60000, polling: 100 }, t0);
    await shot('level-01-recording.png');
    await press(' ');
    check('Space saves the recording', await page.evaluate(() => globalThis.__game.recordings.length === 1));

    await press('x');
    check('X rebuilds the world empty and keeps the recording', await page.evaluate(() => globalThis.__game.recordings.length === 1 && globalThis.__game.world.bodies.length === 0));
    await press('p');
    await page.waitForFunction(() => globalThis.__game.completed, { timeout: 60000, polling: 100 });
    check('the replay completes the level', await page.evaluate(() => globalThis.__game.completed === true));
    await shot('level-01-complete.png');

    await press('Enter');
    check('Enter advances to SHADOW', await page.evaluate(() => globalThis.__game.level.id === 'l2-shadow'));

    // Debug scrubber and Shift+digit deletion. The recording is made through the game API so the
    // checks have something to act on; the keys themselves are pressed for real.
    await page.evaluate(() => {
      const g = globalThis.__game;
      const z = g.level.dropZones[0];
      g.setRegion(0, 0, 960, 540);
      g.toggleRecording();
      g.dropAt(z.x + z.w / 2, z.y + z.h / 2);
      for (let i = 0; i < 120; i++) g.tick();
      g.toggleRecording();
    });
    await press('F3');
    await page.evaluate(() => { globalThis.__view.scrub = 0; });
    await press(']');
    check('] moves the timeline cursor 10 frames', await page.evaluate(() => globalThis.__view.scrub === 10));
    await press('}');
    check('} moves it 60 frames', await page.evaluate(() => globalThis.__view.scrub === 70));
    for (let i = 0; i < 5; i++) await press('}');
    check('the timeline cursor stops at the end of the longest recording',
      await page.evaluate(() => globalThis.__view.scrub === globalThis.__game.recordings[0].length));
    await press('F3');
    await page.keyboard.down('Shift');
    await press('Digit1');
    await page.keyboard.up('Shift');
    check('Shift+1 deletes the first recording', await page.evaluate(() => globalThis.__game.recordings.length === 0));

    // Keyboard play: the arrow keys move the cursor in play.
    await press('ArrowLeft'); await press('ArrowLeft'); await press('ArrowLeft');
    check('arrow keys move the keyboard cursor', await page.evaluate(() => !!globalThis.__view.cursor && Math.round(globalThis.__view.cursor.x) === 456));

    // ---- pause, debug inspector ----
    await press('Escape');
    check('Esc pauses', (await screen()) === 'pause');
    await shot('pause.png');
    await press('?');
    check('? opens the controls over the pause menu', (await screen()) === 'controls');
    await shot('controls.png');
    await press('Escape');
    check('Esc from help returns to the pause menu', (await screen()) === 'pause');
    await press('Enter');
    check('RESUME returns to play', (await screen()) === 'playing');
    await press('F3');
    const hover = toScreen(300, 300);
    await page.mouse.move(hover.x, hover.y, { steps: 3 });
    await sleep(300);
    await shot('debug-inspector.png');
    await press('F3');

    const progress = await stored();
    // ---- save codes: copy, download, upload, a bad code; then F4 and the discoveries screen ----
    const dl = fs.mkdtempSync(path.join(os.tmpdir(), 'wiar-e2e-'));
    const bcdp = await browser.target().createCDPSession();
    await bcdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    const decodeCode = (text) => { try { return JSON.parse(Buffer.from(text, 'base64').toString('utf8')); } catch { return null; } };
    const waitForFile = async (name) => {
      for (let i = 0; i < 50; i++) {
        const f = path.join(dl, name);
        if (fs.existsSync(f)) return f;
        await sleep(100);
      }
      return null;
    };
    // Waits up to 5 s for the game to report something, instead of sleeping a fixed time.
    const waitForEvent = async (text) => {
      try {
        await page.waitForFunction((t) => (globalThis.__view.events || []).some((e) => e.text === t), { timeout: 5000, polling: 50 }, text);
        return true;
      } catch { return false; }
    };

    await press('Escape'); // pause
    for (let i = 0; i < 3; i++) await press('ArrowDown');
    await press('Enter'); // SETTINGS
    for (let i = 0; i < 7; i++) await press('ArrowDown');
    await press('Enter'); // SAVE CODES
    check('SAVE CODES opens its screen', (await screen()) === 'save');

    // COPY SAVE CODE. The clipboard write can take a moment, so poll the clipboard itself.
    await press('Enter');
    let copiedSave = null;
    for (let i = 0; i < 60 && !copiedSave; i++) {
      await sleep(100);
      copiedSave = decodeCode(await page.evaluate(() => navigator.clipboard.readText().catch(() => '')));
    }
    check('COPY SAVE CODE puts a readable save code on the clipboard', !!copiedSave && copiedSave.v === 1 && !!copiedSave.progress);

    await press('ArrowDown'); await press('ArrowDown'); // DOWNLOAD SAVE FILE
    await press('Enter');
    const savedFile = await waitForFile('the-world-is-a-recording.save.txt');
    const saved = savedFile ? decodeCode(fs.readFileSync(savedFile, 'utf8')) : null;
    check('DOWNLOAD SAVE FILE writes a readable save file', !!saved && saved.v === 1);

    // LOAD SAVE FILE opens the page's file input. The test sets the file on that input directly,
    // which runs the same change handler a chosen file would, without the browser's file dialog.
    await press('ArrowDown');
    const uploadPath = path.join(dl, 'upload-test.save.txt');
    fs.writeFileSync(uploadPath, Buffer.from(JSON.stringify({
      v: 1, progress: { maxUnlocked: 4, discoveries: [], best: {}, stats: { recordingsMade: 0, levelsCompleted: 0, playTicks: 0 } },
    })).toString('base64'));
    await press('Enter');
    const fileInput = await page.waitForSelector('#save-file-input', { timeout: 5000 });
    await fileInput.uploadFile(uploadPath);
    await sleep(400);
    check('LOAD SAVE FILE replaces progress from the file', await page.evaluate(() => globalThis.__game.maxUnlocked === 4));

    // LOAD SAVE CODE: the browser prompt is answered with text that is not a save code.
    await press('ArrowUp'); await press('ArrowUp');
    dialogReply = (d) => d.accept('not a save code');
    await press('Enter');
    const refused = await waitForEvent('NOT A VALID SAVE CODE');
    check('a bad save code is refused with a message', refused);

    for (let i = 0; i < 3; i++) await press('Escape'); // save -> settings -> pause -> play
    check('Esc from SAVE CODES returns to play', (await screen()) === 'playing');

    await press('F4');
    await sleep(300);
    let snapshot = null;
    try { snapshot = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())); } catch { /* checked below */ }
    check('F4 copies a debug snapshot', !!snapshot && typeof snapshot.hash === 'string' && Array.isArray(snapshot.recordings));

    // Pause, then TITLE, then DISCOVERIES from the title screen.
    await press('Escape');
    for (let i = 0; i < 4; i++) await press('ArrowDown');
    await press('Enter'); // TITLE
    check('TITLE returns to the title screen', (await screen()) === 'title');
    for (let i = 0; i < 4; i++) await press('ArrowDown');
    await press('Enter'); // DISCOVERIES
    check('DISCOVERIES opens from the title', (await screen()) === 'discoveries');
    await shot('discoveries.png');
    await press('Escape');
    check('Esc returns from DISCOVERIES to the title', (await screen()) === 'title');

    check('progress is saved (level 2 unlocked)', progress && progress.progress && progress.progress.maxUnlocked >= 1);
    check('no page errors', pageErrors.length === 0, pageErrors.join(' | '));

    // ---- phone: touch only, emulated landscape phone, then portrait ----
    const phone = await browser.newPage();
    const phoneErrors = [];
    phone.on('pageerror', (e) => phoneErrors.push(e.message));
    await phone.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await phone.goto(URL_ROOT, { waitUntil: 'load' });
    await phone.waitForFunction(() => globalThis.__menu && globalThis.__game, { timeout: 15000 });
    await sleep(400);
    const phoneToPage = async (x, y) => phone.evaluate((wx, wy) => {
      const r = document.getElementById('scene').getBoundingClientRect();
      const s = Math.min(r.width / 960, r.height / 540);
      return { x: r.left + (r.width - 960 * s) / 2 + wx * s, y: r.top + (r.height - 540 * s) / 2 + wy * s };
    }, x, y);
    const phoneTapWorld = async (x, y) => { const p = await phoneToPage(x, y); await phone.touchscreen.tap(p.x, p.y); await sleep(200); };
    const phoneScreen = () => phone.evaluate(() => globalThis.__menu.screen);
    const styleOf = (sel) => phone.evaluate((q) => { const el = document.querySelector(q); return el ? getComputedStyle(el).display : 'missing'; }, sel);

    await phoneTapWorld(480, 240); // first title item: BEGIN or CONTINUE
    check('a tap on a title item starts play', (await phoneScreen()) === 'playing');
    check('the touch bar shows while playing on a touch screen', (await styleOf('#touchbar')) !== 'none');
    check('the portrait hint stays hidden in landscape', (await styleOf('#rotate')) === 'none');

    const zone = await phone.evaluate(() => {
      const z = globalThis.__game.level.dropZones[0];
      return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
    });
    const before = await phone.evaluate(() => globalThis.__game.world.bodies.length);
    await phoneTapWorld(zone.x, zone.y);
    check('a tap in a drop zone drops a ball', (await phone.evaluate(() => globalThis.__game.world.bodies.length)) === before + 1);

    await phone.tap('[data-play="wholeRoom"]');
    await sleep(150);
    check('the ALL button selects the whole room as the region', await phone.evaluate(() => !!globalThis.__game.region && globalThis.__game.region.w === 960));
    await phone.tap('[data-play="record"]');
    await sleep(150);
    check('the REC button starts a recording', await phone.evaluate(() => !!globalThis.__game.recorder));
    await phone.tap('[data-play="record"]');
    await sleep(150);
    check('the REC button stops and saves it', await phone.evaluate(() => !globalThis.__game.recorder && globalThis.__game.recordings.length >= 1));

    await phone.tap('#touchbar-toggle');
    await sleep(100);
    check('the BAR toggle collapses the bar', await phone.evaluate(() => document.getElementById('touchbar').classList.contains('collapsed')));
    await phone.tap('#touchbar-toggle');
    await sleep(100);
    check('the BAR toggle opens it again', await phone.evaluate(() => !document.getElementById('touchbar').classList.contains('collapsed')));

    await phone.tap('[data-play="menu"]');
    await sleep(150);
    check('the MENU button opens the pause menu', (await phoneScreen()) === 'pause');
    check('the touch bar hides in menus', await phone.evaluate(() => document.getElementById('touchbar').hidden === true));
    await phoneTapWorld(480, 200); // RESUME
    check('tapping RESUME returns to play', (await phoneScreen()) === 'playing');

    await phone.tap('[data-play="menu"]');
    await sleep(150);
    await phoneTapWorld(480, 200 + 34 * 4); // TITLE
    check('tapping TITLE goes back to the title screen', (await phoneScreen()) === 'title');

    await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await sleep(400);
    check('a portrait phone is offered the sideways hint', (await styleOf('#rotate')) !== 'none');
    await phone.tap('#rotate-dismiss');
    await sleep(100);
    check('the hint can be dismissed', (await styleOf('#rotate')) === 'none');
    check('the page does not scroll sideways on a phone', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('no page errors on the phone', phoneErrors.length === 0, phoneErrors.join(' | '));
    await phone.close();
    // A first visit on a phone held upright starts with large text. Saved settings are cleared before the
    // game loads; this is the last check that uses this origin's storage.
    const upright = await browser.newPage();
    await upright.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch { /* storage blocked */ } });
    await upright.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await upright.goto(URL_ROOT, { waitUntil: 'load' });
    await upright.waitForFunction(() => globalThis.__view, { timeout: 15000 });
    check('a first visit on a narrow screen starts with large text', await upright.evaluate(() => globalThis.__view.settings.largeText === true));
    await upright.close();

    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
