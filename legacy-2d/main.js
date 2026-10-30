// src/main.js
// Browser entry point: input, the frame loop, and the wiring between the headless Game,
// the menus, the audio layer and the renderer. Holds no game rules.

import { Game, DISCOVERY_COUNT, DISCOVERIES, nextSpeed } from './game.js';
import { LEVELS } from './levels.js';
import { DT, WORLD_W, WORLD_H } from './sim.js';
import { render, drawHud, drawMenu, setLargeText } from './render.js';
import { Sound } from './audio.js';
import { encodeSave, decodeSave } from './save.js';
import { createMenu, activate, escape, move, openScreen, itemsFor, statLines, menuItemAt, discoveryLines } from './menu.js';
import { stepCursor } from './cursor.js';
import { startingSettings } from './settings.js';
import { scrubTo, SCRUB_SMALL, SCRUB_LARGE } from './scrub.js';

const STORE_KEY = 'the-world-is-a-recording.v1';
const MAX_STEPS_PER_FRAME = 8;

// ---------- storage (best effort: storage may be blocked or full) ----------

function loadStore() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(data) {
  try {
    globalThis.localStorage && globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    // Storage can be full or disabled. The game still works; progress just isn't kept.
  }
}

const store = loadStore();
const settings = startingSettings(store.settings, window.innerWidth);

const game = new Game(LEVELS, store.progress || {});
const sound = new Sound();
sound.setMuted(settings.muted);
const menu = createMenu();

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');

const view = {
  time: 0,
  debug: false,
  showHint: settings.hintsOn,
  flashes: [],
  events: [],     // { text, t, ttl }
  settings,
  hover: null,    // world position under the pointer, for the debug inspector
  speed: 1,       // simulation speed while playing (Tab cycles 1, 2 and 0.5)
  cursor: null,   // keyboard cursor in world coordinates, set by the arrow keys
  scrub: null,    // debug timeline position in frames; null follows the live world
  frameMs: 16,    // smoothed frame time, shown in the debug panel
};

setLargeText(settings.largeText);

// ---------- saving ----------

const progressSignature = () => JSON.stringify(game.progress);
let savedSignature = progressSignature();

function persist() {
  saveStore({ settings: { ...settings }, progress: game.progress });
  savedSignature = progressSignature();
}

// ---------- layout ----------

let scale = 1, offX = 0, offY = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H);
  offX = (canvas.width - WORLD_W * scale) / 2;
  offY = (canvas.height - WORLD_H * scale) / 2;
}
window.addEventListener('resize', resize);
// Phones resize the visible area when the address bar moves; the canvas should follow it.
window.visualViewport?.addEventListener('resize', resize);
resize();

function toWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  const px = (ev.clientX - rect.left) * dpr;
  const py = (ev.clientY - rect.top) * dpr;
  return { x: (px - offX) / scale, y: (py - offY) / scale };
}

// ---------- menus ----------

const playing = () => menu.screen === 'playing';
const isTouch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

function menuContext() {
  return {
    levelTitles: game.levels.map((l) => l.title),
    maxUnlocked: game.maxUnlocked,
    resumeLevel: game.lastLevel,
    bestTicks: game.levels.map((l) => game.best[l.id]),
    settings,
    armed: menu.armed,
    playing: playing(),
    found: game.discoveries.size,
    total: DISCOVERY_COUNT,
    statLines: statLines(game.stats, game.discoveries.size, DISCOVERY_COUNT),
    discoveryLines: discoveryLines(game.discoveries, DISCOVERIES),
    touch: isTouch,
  };
}

// Side effects of a setting that the rest of the game needs to see straight away.
const SETTING_EFFECTS = {
  largeText: () => setLargeText(settings.largeText),
  hintsOn: () => { view.showHint = settings.hintsOn; },
  muted: () => sound.setMuted(settings.muted),
};

function performAction(action) {
  switch (action.type) {
    case 'begin':
    case 'level':
      game.jumpTo(action.index);
      break;
    case 'restart':
      game.loadLevel(game.levelIndex);
      break;
    case 'setting':
      settings[action.key] = !settings[action.key];
      SETTING_EFFECTS[action.key]?.();
      persist();
      break;
    case 'erase':
      game.eraseProgress();
      persist();
      break;
    case 'copy-save':
      copySave();
      break;
    case 'load-save':
      loadSave();
      break;
    case 'download-save':
      downloadSave();
      break;
    case 'upload-save':
      uploadSave();
      break;
    default:
      break;
  }
}

// Runs the highlighted menu item. Shared by the Enter key and by taps.
function activateCurrent() {
  const c = menuContext();
  const action = activate(menu, c);
  performAction(action);
  if (['begin', 'level', 'restart', 'resume'].includes(action.type)) sound.playback();
}

// A tap in a menu: the bottom strip (where "Esc back" is written) and the controls screen both go
// back; otherwise a tap on an item selects and runs it.
function menuTap(ev) {
  const p = toWorld(ev);
  if (menu.screen === 'controls' || p.y > WORLD_H - 56) {
    escape(menu);
  } else {
    const c = menuContext();
    const i = menuItemAt(p.x, p.y, menu.screen, itemsFor(menu.screen, c).length);
    if (i < 0) return;
    menu.index = i;
    activateCurrent();
  }
  announceMenu();
}

function menuKey(k) {
  const c = menuContext();
  if (k === 'ArrowUp') move(menu, -1, c);
  else if (k === 'ArrowDown') move(menu, 1, c);
  else if (k === 'Enter') activateCurrent();
  else if (k === 'Escape') {
    escape(menu);
  }
  announceMenu();
}

// ---------- save codes ----------

// Puts text on the clipboard. If the clipboard is refused, the text is shown so it can be copied by hand.
async function copyText(text, doneMessage) {
  try {
    await navigator.clipboard.writeText(text);
    game.events.push(doneMessage);
  } catch {
    window.prompt('Copy this text:', text);
  }
}

function copySave() {
  return copyText(encodeSave(game.progress), 'SAVE CODE COPIED');
}

// A save file is the same text as a save code, saved as a .txt file so it survives a browser restart.
function downloadSave() {
  const url = URL.createObjectURL(new Blob([encodeSave(game.progress)], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'the-world-is-a-recording.save.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  game.events.push('SAVE FILE DOWNLOADED');
}

// One hidden file input for the whole page. The LOAD SAVE FILE item opens it; a chosen file is read
// and imported. Keeping the input in the page (rather than creating one per use) means it is always
// there when the item is chosen.
const saveFileInput = document.createElement('input');
saveFileInput.type = 'file';
saveFileInput.accept = '.txt,text/plain';
saveFileInput.id = 'save-file-input';
saveFileInput.hidden = true;
document.body.appendChild(saveFileInput);
saveFileInput.addEventListener('change', async () => {
  const file = saveFileInput.files && saveFileInput.files[0];
  saveFileInput.value = ''; // so choosing the same file again still counts as a change
  if (!file) return;
  try {
    game.importProgress(decodeSave(await file.text()));
    persist();
  } catch {
    game.events.push('NOT A VALID SAVE FILE');
  }
});

function uploadSave() {
  saveFileInput.click();
}

function loadSave() {
  const input = window.prompt('Paste a save code. This replaces your saved progress.');
  if (!input) return;
  try {
    game.importProgress(decodeSave(input));
    persist();
  } catch {
    game.events.push('NOT A VALID SAVE CODE');
  }
}

// ---------- live region (screen readers) ----------

const live = document.getElementById('live');
function announce(text) {
  if (live) live.textContent = text;
}

function announceMenu() {
  if (playing()) return; // play has no menu items to announce
  const items = itemsFor(menu.screen, menuContext());
  const item = items[menu.index];
  if (item) announce(item.label.trim());
}

// ---------- pausing when the player is away ----------

function autoPause() {
  if (!playing()) return;
  press = null;
  regionPreview = null;
  escape(menu);
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

// ---------- input ----------

// Where the keyboard cursor starts: the middle of the room, until the arrow keys move it.
function cursorOrCentre() {
  return view.cursor || { x: WORLD_W / 2, y: WORLD_H / 2 };
}

function drawCursor(c) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,210,122,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c.x - 9, c.y); ctx.lineTo(c.x + 9, c.y);
  ctx.moveTo(c.x, c.y - 9); ctx.lineTo(c.x, c.y + 9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// press: the pointer-down that is still in progress. mode: 'emitter' | 'region' | 'click'.
let press = null;
let regionPreview = null; // { x0, y0, x1, y1 } while a region is being dragged

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointermove', (ev) => {
  const p = toWorld(ev);
  view.hover = (p.x >= 0 && p.x <= WORLD_W && p.y >= 0 && p.y <= WORLD_H) ? p : null;
  if (!press || !playing()) return;
  if (press.mode === 'emitter') {
    game.moveEmitter(press.emitter, p.x);
    press.moved = true;
  } else if (Math.hypot(p.x - press.x, p.y - press.y) > 8) {
    press.moved = true;
    press.mode = 'region';
    regionPreview = { x0: press.x, y0: press.y, x1: p.x, y1: p.y };
  }
  if (regionPreview) { regionPreview.x1 = p.x; regionPreview.y1 = p.y; }
});

canvas.addEventListener('pointerdown', (ev) => {
  sound.ensure();
  if (!playing()) {
    if (ev.button === 0) menuTap(ev);
    return;
  }
  const p = toWorld(ev);
  if (ev.button === 2) { game.clearRegion(); return; }
  const emitter = game.emitterAt(p.x, p.y);
  if (emitter && !game.recorder) {
    press = { x: p.x, y: p.y, moved: false, mode: 'emitter', emitter };
  } else {
    press = { x: p.x, y: p.y, moved: false, mode: 'click' };
  }
  canvas.setPointerCapture(ev.pointerId);
});

canvas.addEventListener('pointerup', (ev) => {
  if (!press) return;
  const current = press;
  const preview = regionPreview;
  press = null;
  regionPreview = null;
  // A release after pausing (or from a menu) must not drop a ball or commit a region.
  if (!playing()) return;

  const p = toWorld(ev);
  if (current.mode === 'region' && preview) {
    game.setRegion(preview.x0, preview.y0, preview.x1 - preview.x0, preview.y1 - preview.y0);
  } else if (current.mode === 'click' && !current.moved) {
    // Door changes are sounded in pumpEvents, so a click here only changes state.
    game.act(p.x, p.y);
  }
});

// ---------- play actions ----------

// What each play control does. The keyboard and the on-screen touch bar both call these, so the
// two cannot disagree.
const PLAY_ACTIONS = {
  record() {
    const r = game.toggleRecording();
    if (r) sound.record(r === 'started');
  },
  play() { if (game.playSelected() > 0) sound.playback(); },
  stop() { game.stopPlayback(); },
  reset() { game.resetLevel(); },
  clearRegion() { game.clearRegion(); },
  // Selects the whole room as the region. On a touch screen this replaces dragging out a region.
  wholeRoom() { game.setRegion(0, 0, WORLD_W, WORLD_H); },
  deleteLast() { game.deleteLastRecording(); },
  clearAll() { game.clearRecordings(); },
  undo() { game.undoDrop(); },
  selectAll() { game.selectAll(); },
  speed() { view.speed = nextSpeed(view.speed); },
  hint() { view.showHint = !view.showHint; },
  advance() { game.advance(); },
  menu() { escape(menu); },
  mute() {
    settings.muted = !settings.muted;
    SETTING_EFFECTS.muted();
    persist();
  },
  // Acts at the keyboard cursor (G). On a touch screen, tapping the picture does the same job.
  act() {
    const c = cursorOrCentre();
    view.cursor = c;
    game.act(c.x, c.y);
  },
};

// The on-screen play bar, shown on touch screens while playing.
const touchBar = document.getElementById('touchbar');
if (touchBar) {
  touchBar.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-play]');
    if (!b || !playing()) return;
    sound.ensure();
    PLAY_ACTIONS[b.dataset.play]();
  });
}
const barToggle = document.getElementById('touchbar-toggle');
if (touchBar && barToggle) {
  // Collapses the bar to its toggle, so it stops covering the picture on a short screen.
  barToggle.addEventListener('click', () => {
    const collapsed = touchBar.classList.toggle('collapsed');
    barToggle.textContent = collapsed ? 'BAR ▴' : 'BAR ▾';
    barToggle.setAttribute('aria-expanded', String(!collapsed));
  });
}
const rotateHint = document.getElementById('rotate');
const rotateDismiss = document.getElementById('rotate-dismiss');
if (rotateDismiss && rotateHint) {
  rotateDismiss.addEventListener('click', () => { rotateHint.dataset.dismissed = ''; });
}

window.addEventListener('keydown', (ev) => {
  sound.ensure();
  if (ev.repeat) return;
  const k = ev.key;

  // Help is available from play and from the pause menu. Back from help returns to the pause menu.
  if (k === '?' && (playing() || menu.screen === 'pause')) {
    ev.preventDefault();
    if (playing()) escape(menu);
    openScreen(menu, 'controls');
    return;
  }

  if (!playing()) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(k)) ev.preventDefault();
    menuKey(k);
    return;
  }

  if (k === ' ') {
    ev.preventDefault();
    PLAY_ACTIONS.record();
  } else if (ev.shiftKey && /^Digit[1-9]$/.test(ev.code)) {
    game.deleteRecording(Number(ev.code.slice(5)) - 1);
  } else if (/^[1-9]$/.test(k)) {
    game.toggleSelect(Number(k) - 1);
  } else if (k === 'p' || k === 'P') {
    PLAY_ACTIONS.play();
  } else if (k === 's' || k === 'S') {
    PLAY_ACTIONS.stop();
  } else if (k === 'x' || k === 'X') {
    PLAY_ACTIONS.reset();
  } else if (k === 'c' || k === 'C') {
    PLAY_ACTIONS.clearRegion();
  } else if (k === 'Backspace') {
    ev.preventDefault();
    if (ev.shiftKey) PLAY_ACTIONS.clearAll();
    else PLAY_ACTIONS.deleteLast();
  } else if (k === 'z' || k === 'Z') {
    PLAY_ACTIONS.undo();
  } else if (k === 'Tab') {
    ev.preventDefault();
    PLAY_ACTIONS.speed();
  } else if (k === 'Escape') {
    ev.preventDefault();
    PLAY_ACTIONS.menu();
  } else if (k === 'Enter') {
    PLAY_ACTIONS.advance();
  } else if ((k === 'a' || k === 'A') && !ev.ctrlKey && !ev.metaKey) {
    PLAY_ACTIONS.selectAll();
  } else if (view.debug && (k === '[' || k === ']' || k === '{' || k === '}')) {
    const step = (k === '[' || k === ']') ? SCRUB_SMALL : SCRUB_LARGE;
    scrubBy(k === '[' || k === '{' ? -step : step);
  } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
    ev.preventDefault();
    view.cursor = stepCursor(cursorOrCentre(), k, WORLD_W, WORLD_H);
  } else if (k === 'g' || k === 'G') {
    PLAY_ACTIONS.act();
  } else if (k === 'F4') {
    ev.preventDefault();
    copyText(JSON.stringify(game.debugSnapshot(), null, 2), 'DEBUG SNAPSHOT COPIED');
  } else if (k === 'F3') {
    ev.preventDefault();
    view.debug = !view.debug;
    view.scrub = null;
  } else if (k === 'h' || k === 'H') {
    PLAY_ACTIONS.hint();
  } else if (k === 'm' || k === 'M') {
    PLAY_ACTIONS.mute();
  }
});

// ---------- debug scrubber ----------

// Moves the timeline position. [ and ] move 10 frames; { and } move 60.
function scrubBy(delta) {
  const longest = Math.max(0, ...game.recordings.map((r) => r.length));
  view.scrub = scrubTo(view.scrub ?? game.world.tick, delta, longest);
}

// ---------- frame loop ----------

let acc = 0;
let last = performance.now();
const prevPressed = new Map();
const prevOpen = new Map();
let seenGeneration = -1;
let prevCompleted = false;

// Turns game events into sounds, flashes and log lines. Runs once per frame.
function pumpEvents() {
  // A rebuilt world starts with its own plates and doors. Record their state silently; only
  // changes within the same world make sound.
  const fresh = game.generation !== seenGeneration;
  seenGeneration = game.generation;

  for (const imp of game.pendingImpacts) sound.impact(imp.speed, imp.x, imp.echo);
  game.pendingImpacts.length = 0;

  for (const c of game.pendingConflicts) {
    view.flashes.push({ x: c.x, y: c.y, type: c.type, born: view.time });
    if (c.type !== 'memory') sound.conflict(c.x);
  }
  game.pendingConflicts.length = 0;
  if (view.flashes.length > 60) view.flashes.splice(0, view.flashes.length - 60);

  for (const p of game.world.plates) {
    const was = prevPressed.get(p.name);
    if (!fresh && was !== undefined && was !== p.pressed) sound.plate(p.pressed, p.x + p.w / 2);
    prevPressed.set(p.name, p.pressed);
  }
  for (const d of game.world.doors) {
    const was = prevOpen.get(d.name);
    if (!fresh && was !== undefined && was !== d.open) sound.door(d.open, d.x + d.w / 2);
    prevOpen.set(d.name, d.open);
  }

  if (game.completed && !prevCompleted) sound.complete();
  prevCompleted = game.completed;

  for (const e of game.events) {
    const text = typeof e === 'string' ? e : e.text;
    const ttl = typeof e === 'string' ? 6 : e.ttl;
    view.events.unshift({ text, t: view.time, ttl });
    announce(text);
  }
  game.events.length = 0;
  if (view.events.length > 6) view.events.length = 6;

  if (progressSignature() !== savedSignature) persist();
}

function drawEnding() {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,10,0.78)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7ff3ff';
  ctx.font = 'bold 22px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('THE WORLD IS A RECORDING', WORLD_W / 2, 210);
  ctx.fillStyle = '#c8d6e8';
  ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('You kept what happened, and the present had to answer for it.', WORLD_W / 2, 250);
  ctx.fillText('Memory is not the past. It is an instruction the world must reconcile.', WORLD_W / 2, 272);
  ctx.fillStyle = '#ffd27a';
  ctx.fillText('ENTER  —  enter the Open Lab. Nothing left to solve there. Everything left to try.', WORLD_W / 2, 330);
  ctx.restore();
}

function frame(now) {
  const rawMs = Math.max(0, now - last);
  const dt = Math.min(0.1, rawMs / 1000);
  last = now;
  view.frameMs = view.frameMs * 0.9 + rawMs * 0.1;
  view.time += dt;

  // The simulation only advances while playing. Menus freeze the world.
  if (playing()) {
    acc += dt * view.speed;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      game.tick();
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) acc = 0;
  } else {
    acc = 0;
  }

  pumpEvents();
  if (touchBar) touchBar.hidden = !playing();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);

  // Show the region being dragged without committing it to the game state.
  const original = game.region;
  if (regionPreview && !game.recorder && playing()) {
    game.region = {
      x: Math.min(regionPreview.x0, regionPreview.x1),
      y: Math.min(regionPreview.y0, regionPreview.y1),
      w: Math.abs(regionPreview.x1 - regionPreview.x0),
      h: Math.abs(regionPreview.y1 - regionPreview.y0),
    };
  }
  // The scene is drawn underneath every screen; menus dim it.
  render(ctx, game, view);
  game.region = original;

  if (playing()) {
    drawHud(ctx, game, view);
    if (view.cursor) drawCursor(view.cursor);
    if (game.completed && game.endingPending) drawEnding();
  } else {
    drawMenu(ctx, menu, menuContext());
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Read-only handles for the browser console and the end-to-end test (tools/e2e.mjs).
globalThis.__game = game;
globalThis.__menu = menu;
globalThis.__view = view;
