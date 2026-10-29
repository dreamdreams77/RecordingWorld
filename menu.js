// src/menu.js
// Pure menu navigation: which screen is open, which item is selected, what an activation
// means. No DOM, no canvas. The renderer draws whatever this module says, and main.js
// carries out the actions it returns. Tested in tests/menu.test.js.

export function createMenu() {
  return {
    screen: 'title',
    stack: [],     // screens to return to
    index: 0,
    armed: null,   // a destructive item waiting for its confirming press
  };
}

// Items for a screen. `ctx` = { levelTitles, maxUnlocked, settings, playing }.
export function itemsFor(screen, ctx) {
  switch (screen) {
    case 'title':
      return [
        { id: 'begin', label: ctx.maxUnlocked > 0 ? 'CONTINUE' : 'BEGIN' },
        { id: 'levels', label: 'LEVEL SELECT' },
        { id: 'settings', label: 'SETTINGS' },
        { id: 'stats', label: 'STATISTICS' },
        { id: 'discoveries', label: 'DISCOVERIES' },
        { id: 'controls', label: 'CONTROLS' },
      ];
    case 'stats':
      return [{ id: 'back', label: 'BACK' }];
    case 'discoveries':
      return [{ id: 'back', label: 'BACK' }];
    case 'levels': {
      const items = ctx.levelTitles.map((title, i) => {
        const best = ctx.bestTicks && ctx.bestTicks[i];
        const bestText = best ? `   best ${(best / 60).toFixed(1)}s` : '';
        const done = best ? '✓ ' : '  ';
        return {
          id: 'level',
          index: i,
          label: i <= ctx.maxUnlocked ? `${done}${title.trim()}${bestText}` : `  ${title.trim()}  (locked)`,
          disabled: i > ctx.maxUnlocked,
        };
      });
      items.push({ id: 'back', label: 'BACK' });
      return items;
    }
    case 'settings': {
      const on = (v) => (v ? 'ON' : 'OFF');
      const s = ctx.settings;
      return [
        { id: 'toggle-motion', label: `REDUCED MOTION   ${on(s.reducedMotion)}` },
        { id: 'toggle-palette', label: `COLOUR-BLIND PALETTE   ${on(s.colourBlind)}` },
        { id: 'toggle-text', label: `LARGE TEXT   ${on(s.largeText)}` },
        { id: 'toggle-hints', label: `HINTS SHOWN   ${on(s.hintsOn)}` },
        { id: 'toggle-sound', label: `SOUND   ${s.muted ? 'OFF' : 'ON'}` },
        { id: 'toggle-trails', label: `ECHO TRAILS   ${on(s.trails)}` },
        { id: 'toggle-flashes', label: `REDUCE FLASHING   ${on(s.reduceFlashing)}` },
        { id: 'save-codes', label: 'SAVE CODES' },
        { id: 'erase', label: ctx.armed === 'erase' ? 'PRESS ENTER AGAIN TO ERASE' : 'ERASE SAVED PROGRESS' },
        { id: 'back', label: 'BACK' },
      ];
    }
    case 'save':
      return [
        { id: 'copy-save', label: 'COPY SAVE CODE' },
        { id: 'load-save', label: 'LOAD SAVE CODE' },
        { id: 'download-save', label: 'DOWNLOAD SAVE FILE' },
        { id: 'upload-save', label: 'LOAD SAVE FILE' },
        { id: 'back', label: 'BACK' },
      ];
    case 'controls':
      return [{ id: 'back', label: 'BACK' }];
    case 'pause': {
      const items = [{ id: 'resume', label: 'RESUME' }];
      items.push({ id: 'restart', label: 'RESTART LEVEL' });
      items.push({ id: 'levels', label: 'LEVEL SELECT' });
      items.push({ id: 'settings', label: 'SETTINGS' });
      items.push({ id: 'title', label: 'TITLE' });
      return items;
    }
    default:
      throw new Error(`unknown screen ${screen}`);
  }
}

// The lines on the discoveries screen, in table order. A found discovery shows its text; an unfound
// one shows that it is still hidden, so the player can see how many are left.
export function discoveryLines(found, all) {
  return Object.entries(all).map(([id, text]) => (found.has(id) ? `✓  ${text}` : '?  hidden until you find it'));
}

// The lines shown on the statistics screen. Kept here so the text can be tested.
export function statLines(stats, found, total) {
  const mins = Math.floor(stats.playTicks / 3600);
  const secs = Math.floor((stats.playTicks % 3600) / 60);
  return [
    `RECORDINGS MADE      ${stats.recordingsMade}`,
    `LEVEL COMPLETIONS    ${stats.levelsCompleted}`,
    `TIME IN LEVELS       ${mins}m ${String(secs).padStart(2, '0')}s`,
    `DISCOVERIES          ${found} / ${total}`,
  ];
}

// Where a menu's items sit, in world units. render.js draws with this and main.js uses it to find
// the item under a tap, so the two always agree.
export const MENU_CENTRE_X = 480;
export function menuLayout(screen, count) {
  const top = screen === 'title' ? 240 : screen === 'stats' ? 360 : screen === 'discoveries' ? 450 : 200;
  const spacing = count > 8 ? 28 : 34;
  return { top, spacing };
}

// Index of the menu item nearest to a world position, or -1 if the position is off the list.
export function menuItemAt(x, y, screen, count) {
  if (count === 0 || Math.abs(x - MENU_CENTRE_X) > 200) return -1;
  const { top, spacing } = menuLayout(screen, count);
  const i = Math.round((y - top) / spacing);
  if (i < 0 || i >= count) return -1;
  // Taps a little beyond the first or last row still count; anything further away does not.
  if (Math.abs(y - (top + i * spacing)) > spacing * 1.5) return -1;
  return i;
}

export function openScreen(menu, screen, { push = true } = {}) {
  if (push) menu.stack.push(menu.screen);
  menu.screen = screen;
  menu.index = 0;
  menu.armed = null;
  return menu;
}

export function back(menu) {
  menu.armed = null;
  if (menu.stack.length === 0) {
    menu.screen = 'title';
    menu.index = 0;
    return menu;
  }
  menu.screen = menu.stack.pop();
  menu.index = 0;
  return menu;
}

export function move(menu, delta, ctx) {
  menu.armed = null;
  const items = itemsFor(menu.screen, ctx);
  let i = menu.index;
  for (let step = 0; step < items.length; step++) {
    i = (i + delta + items.length) % items.length;
    if (!items[i].disabled) { menu.index = i; return menu; }
  }
  return menu;
}

// Activating an item returns an action for main.js to perform. Navigation within the menu
// is handled here; anything that changes the game is returned as an action.
export function activate(menu, ctx) {
  const items = itemsFor(menu.screen, ctx);
  const item = items[menu.index];
  if (!item || item.disabled) return { type: 'none' };
  switch (item.id) {
    case 'begin': openDirect(menu); return { type: 'begin', index: ctx.resumeLevel ?? ctx.maxUnlocked };
    case 'levels': openScreen(menu, 'levels'); return { type: 'none' };
    case 'settings': openScreen(menu, 'settings'); return { type: 'none' };
    case 'controls': openScreen(menu, 'controls'); return { type: 'none' };
    case 'back': back(menu); return { type: 'none' };
    case 'level': menu.screen = 'playing'; menu.stack = []; return { type: 'level', index: item.index };
    case 'resume': menu.screen = 'playing'; menu.stack = []; return { type: 'resume' };
    case 'title': menu.screen = 'title'; menu.stack = []; menu.index = 0; return { type: 'title' };
    case 'restart': menu.screen = 'playing'; menu.stack = []; menu.armed = null; return { type: 'restart' };
    case 'toggle-motion': return { type: 'setting', key: 'reducedMotion' };
    case 'toggle-palette': return { type: 'setting', key: 'colourBlind' };
    case 'toggle-text': return { type: 'setting', key: 'largeText' };
    case 'toggle-hints': return { type: 'setting', key: 'hintsOn' };
    case 'toggle-sound': return { type: 'setting', key: 'muted' };
    case 'toggle-trails': return { type: 'setting', key: 'trails' };
    case 'toggle-flashes': return { type: 'setting', key: 'reduceFlashing' };
    case 'save-codes': openScreen(menu, 'save'); return { type: 'none' };
    case 'copy-save': return { type: 'copy-save' };
    case 'load-save': return { type: 'load-save' };
    case 'download-save': return { type: 'download-save' };
    case 'upload-save': return { type: 'upload-save' };
    case 'stats': openScreen(menu, 'stats'); return { type: 'none' };
    case 'discoveries': openScreen(menu, 'discoveries'); return { type: 'none' };
    case 'erase':
      // Erasing is destructive, so it takes two presses: the first arms it, the second confirms.
      if (menu.armed !== 'erase') { menu.armed = 'erase'; return { type: 'none' }; }
      menu.armed = null;
      return { type: 'erase' };
    default: return { type: 'none' };
  }
}

function openDirect(menu) {
  menu.screen = 'playing';
  menu.stack = [];
  menu.index = 0;
}

// Esc: from play it opens the pause menu; from a menu it goes back.
export function escape(menu) {
  if (menu.screen === 'playing') {
    openScreen(menu, 'pause');
    return { type: 'paused' };
  }
  if (menu.screen === 'pause') {
    menu.screen = 'playing';
    menu.stack = [];
    menu.index = 0;
    return { type: 'resume' };
  }
  back(menu);
  return { type: 'none' };
}

