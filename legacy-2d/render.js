// src/render.js
// Canvas 2D presentation. Draws the world in world coordinates (960 x 540).
// Echoes are drawn as translucent cyan ghosts with trails. Present light is
// amber. Conflicts flash. Everything is vector: no image assets.

import { WORLD_W, WORLD_H, FLOOR_Y, LAMP_RADIUS, hashWorld } from './sim.js';
import { itemsFor, menuLayout } from './menu.js';
import { TRAIL_LENGTH } from './recording.js';
import { easeToward } from './ease.js';

const C = {
  bg0: '#0a0e16',
  bg1: '#04060a',
  grid: 'rgba(120,160,200,0.055)',
  wall: '#141b28',
  wallEdge: '#2b3a55',
  floor: '#3fd0e0',
  door: '#1b2538',
  doorShut: '#ff5c6c',
  doorOpen: '#6dffb0',
  plate: '#f0b050',
  present: '#ffd27a',
  echo: '#7ff3ff',
  echoDim: 'rgba(127,243,255,0.25)',
  ball: '#e8eef8',
  conflict: '#ff6b8a',
  text: '#c8d6e8',
  dim: '#5d7090',
  accent: '#7ff3ff',
  rec: '#ff4d5e',
};

const RECORDING_COLORS = ['#7ff3ff', '#ffd27a', '#b7ff8a', '#c39bff', '#ff9ec4', '#8ad8ff', '#ffb37a', '#9bffd9', '#e0ff8a'];

export function recordingColor(index) {
  return RECORDING_COLORS[index % RECORDING_COLORS.length];
}

const PALETTES = {
  standard: { doorShut: '#ff5c6c', doorOpen: '#6dffb0' },
  // Orange and teal differ along the blue–yellow axis, which survives the common
  // red–green colour-vision deficiencies. Shut doors also carry a hatch (see drawDoors).
  colourBlind: { doorShut: '#ff9f1c', doorOpen: '#2ec4b6' },
};
let colourBlindOn = false;

// Large text multiplies every font size by one factor. Positions do not change, so the
// largest sizes may crowd the HUD; the setting is a readability aid, not a layout mode.
let fontScale = 1;
export const LARGE_TEXT_SCALE = 1.3;

export function setLargeText(on) {
  fontScale = on ? LARGE_TEXT_SCALE : 1;
}

// Scales every px size in a CSS font string by the current font scale.
function scaleFont(font) {
  if (fontScale === 1) return font;
  return font.replace(/(\d+(?:\.\d+)?)px/g, (_, n) => `${Math.round(Number(n) * fontScale * 10) / 10}px`);
}

function applyPalette(settings) {
  colourBlindOn = !!(settings && settings.colourBlind);
  const p = colourBlindOn ? PALETTES.colourBlind : PALETTES.standard;
  C.doorShut = p.doorShut;
  C.doorOpen = p.doorOpen;
}

export function render(ctx, game, view) {
  const { time, flashes, debug } = view;
  const w = game.world;
  // Reduced motion freezes every decorative animation. Flashes and fades still use real time,
  // because they carry information (what just happened), not decoration.
  const mt = view.settings && view.settings.reducedMotion ? 0 : time;
  applyPalette(view.settings);

  drawBackground(ctx, mt);
  drawGrid(ctx, mt);
  drawMotes(ctx, mt);
  drawDropZones(ctx, game, mt);
  drawBelts(ctx, w, mt);
  drawWalls(ctx, w);
  drawDoors(ctx, w, mt);
  drawDoorGlow(ctx, w);
  const reduced = !!(view.settings && view.settings.reducedMotion);
  updatePlateSink(game, time, reduced);
  drawPlates(ctx, w);
  if (colourBlindOn) drawPlateStripes(ctx, w);
  drawEchoLights(ctx, w, mt);
  drawLamps(ctx, w, mt);
  drawSensors(ctx, w, mt);
  drawEmitters(ctx, w, mt);
  drawBodies(ctx, w);
  drawEchoes(ctx, game, mt, !view.settings || view.settings.trails !== false);
  if (!(view.settings && view.settings.reduceFlashing)) drawFlashes(ctx, flashes, time);
  drawRegion(ctx, game, mt);
  drawVignette(ctx);
  if (debug) {
    drawDebug(ctx, game, view);
    drawDebugPanel(ctx, game, view);
    drawTimeline(ctx, game, view.scrub);
  }
}

// ---------- menus ----------

// Draws a menu screen over the (dimmed) scene. `info` = { levelTitles, maxUnlocked, settings }.
// The controls screen's lines. On a touch screen a line says how the play bar and taps work.
export function controlsLines(touch) {
  const lines = [
      'DRAG  select a region          SPACE  record / stop',
      'CLICK drop a ball in a zone     click a ball  remove it',
      'CLICK a door  open / shut       drag an emitter  slide it',
      '1–9 select recording    P replay    S stop    X reset level',
      'Backspace  delete last recording    C  clear region',
      'H  hint    F3  debug overlay    M  mute    Esc  pause',
      'Arrows move the cursor    G  act at cursor    Shift+1–9  delete recording',
      'Tab  speed 1× / 2× / ½×    F4  copy debug snapshot',
    ];
  if (touch) lines.push('Touch: tap MENU in the bar to pause, tap a ball or door to act, tap a menu item to choose.');
  return lines;
}

export function drawMenu(ctx, menu, info) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,10,0.82)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.textAlign = 'center';

  if (menu.screen === 'title') {
    ctx.fillStyle = C.accent;
    ctx.font = scaleFont('bold 34px ui-monospace, Menlo, Consolas, monospace');
    ctx.fillText('THE WORLD IS A RECORDING', WORLD_W / 2, 150);
    ctx.fillStyle = C.dim;
    ctx.font = scaleFont('13px ui-monospace, Menlo, Consolas, monospace');
    ctx.fillText('You control the world\'s memory, not a character.', WORLD_W / 2, 182);
    if (info.total) {
      ctx.fillStyle = C.dim;
      ctx.font = scaleFont('12px ui-monospace, Menlo, Consolas, monospace');
      ctx.fillText(`FOUND ${info.found} / ${info.total}`, WORLD_W / 2, 208);
    }
  } else {
    ctx.fillStyle = C.accent;
    ctx.font = scaleFont('bold 20px ui-monospace, Menlo, Consolas, monospace');
    const heading = {
      levels: 'LEVEL SELECT', settings: 'SETTINGS', controls: 'CONTROLS', pause: 'PAUSED', stats: 'STATISTICS', save: 'SAVE CODES', discoveries: 'DISCOVERIES',
    }[menu.screen] || '';
    ctx.fillText(heading, WORLD_W / 2, 150);
  }

  if (menu.screen === 'controls') {
    ctx.fillStyle = C.text;
    ctx.font = scaleFont('14px ui-monospace, Menlo, Consolas, monospace');
    controlsLines(!!info.touch).forEach((l, i) => ctx.fillText(l, WORLD_W / 2, 230 + i * 28));
  } else {
    const items = itemsFor(menu.screen, info);
    const { top, spacing } = menuLayout(menu.screen, items.length);
    if (menu.screen === 'stats') {
      ctx.fillStyle = C.text;
      ctx.font = scaleFont('15px ui-monospace, Menlo, Consolas, monospace');
      (info.statLines || []).forEach((line, i) => ctx.fillText(line, WORLD_W / 2, 236 + i * 32));
    }
    if (menu.screen === 'discoveries') {
      ctx.textAlign = 'left';
      ctx.font = scaleFont('12px ui-monospace, Menlo, Consolas, monospace');
      let y = 184;
      for (const line of info.discoveryLines || []) {
        ctx.fillStyle = line.startsWith('✓') ? C.text : C.dim;
        for (const part of wrapLines(ctx, line, 740)) { ctx.fillText(part, 110, y); y += 15; }
        y += 6;
      }
      ctx.textAlign = 'center';
    }
    items.forEach((item, i) => {
      const y = top + i * spacing;
      const selected = i === menu.index;
      ctx.fillStyle = item.disabled ? C.dim : selected ? C.present : C.text;
      ctx.font = scaleFont(`${selected ? 'bold ' : ''}16px ui-monospace, Menlo, Consolas, monospace`);
      ctx.fillText(`${selected ? '▸ ' : '  '}${item.label}`, WORLD_W / 2, y);
    });
    ctx.fillStyle = C.dim;
    ctx.font = scaleFont('11px ui-monospace, Menlo, Consolas, monospace');
    ctx.fillText('↑ ↓ choose    Enter select    Esc back', WORLD_W / 2, WORLD_H - 40);
  }
  ctx.restore();
}

// ---------- world ----------

function drawBackground(ctx, time) {
  const g = ctx.createRadialGradient(WORLD_W / 2, WORLD_H * 0.42, 60, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.7);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Scanline shimmer, purely visual.
  ctx.fillStyle = 'rgba(127,243,255,0.012)';
  const off = (time * 20) % 4;
  for (let y = off; y < WORLD_H; y += 4) ctx.fillRect(0, y, WORLD_W, 1);
}

function drawGrid(ctx, time) {
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const drift = (time * 6) % 48;
  for (let x = -drift; x <= WORLD_W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); }
  for (let y = 0; y <= WORLD_H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); }
  ctx.stroke();
}

function drawDropZones(ctx, game, time) {
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -time * 12;
  ctx.strokeStyle = 'rgba(127,243,255,0.22)';
  for (const z of game.level.dropZones) ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(127,243,255,0.35)';
  ctx.font = scaleFont('10px ui-monospace, Menlo, Consolas, monospace');
  for (const z of game.level.dropZones) ctx.fillText('DROP ZONE', z.x + 6, z.y + 12);
  ctx.restore();
}

function drawBelts(ctx, w, time) {
  for (const b of w.belts) {
    ctx.fillStyle = 'rgba(63,208,224,0.10)';
    ctx.fillRect(b.x, b.y - 4, b.w, 4);
    ctx.strokeStyle = 'rgba(63,208,224,0.45)';
    ctx.lineWidth = 1;
    const dir = Math.sign(b.speed) || 1;
    const step = 22;
    const shift = (time * Math.abs(b.speed) * 0.5) % step;
    ctx.beginPath();
    for (let x = b.x + shift; x < b.x + b.w; x += step) {
      const cx = x + dir * 4;
      ctx.moveTo(cx - dir * 4, b.y - 8); ctx.lineTo(cx, b.y - 4); ctx.lineTo(cx - dir * 4, b.y);
    }
    ctx.stroke();
  }
}

function drawWalls(ctx, w) {
  for (const s of w.walls) {
    ctx.fillStyle = C.wall;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = C.wallEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }
  // The floor's top edge is the single brightest structural line.
  ctx.strokeStyle = C.floor;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y + 0.5);
  ctx.lineTo(WORLD_W, FLOOR_Y + 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDoors(ctx, w, time) {
  for (const d of w.doors) {
    if (d.open) {
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(109,255,176,0.45)';
      ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = C.door;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = C.wallEdge;
      ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1);
      if (colourBlindOn) {
        // A shape cue that does not depend on colour: shut doors are hatched.
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x, d.y, d.w, d.h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,159,28,0.5)';
        ctx.beginPath();
        for (let k = -d.h; k < d.w + d.h; k += 6) { ctx.moveTo(d.x + k, d.y + d.h); ctx.lineTo(d.x + k + d.h, d.y); }
        ctx.stroke();
        ctx.restore();
      }
    }
    // Indicator LED at the top.
    ctx.fillStyle = d.open ? C.doorOpen : C.doorShut;
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 3);
    ctx.beginPath();
    ctx.arc(d.x + d.w / 2, d.y - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// How far each plate has sunk, 0 (up) to 1 (pressed), eased over a few frames. Keyed by plate id
// and cleared when the world is rebuilt, so a new level's plates never inherit an old state.
const plateDepth = new Map();
let plateGeneration = -1;
let plateClock = null;
const PLATE_SINK = 3; // world units a fully pressed plate sinks

function updatePlateSink(game, time, reduced) {
  if (game.generation !== plateGeneration) {
    plateDepth.clear();
    plateGeneration = game.generation;
    plateClock = null;
  }
  const dt = plateClock === null ? 0 : time - plateClock;
  plateClock = time;
  for (const p of game.world.plates) {
    const target = p.pressed ? 1 : 0;
    const cur = plateDepth.has(p.id) ? plateDepth.get(p.id) : target;
    plateDepth.set(p.id, easeToward(cur, target, dt, reduced));
  }
}

function plateSink(p) {
  return (plateDepth.has(p.id) ? plateDepth.get(p.id) : (p.pressed ? 1 : 0)) * PLATE_SINK;
}

function drawPlates(ctx, w) {
  for (const p of w.plates) {
    const s = plateSink(p);
    const top = p.y + s;
    if (p.pressed) {
      const g = ctx.createRadialGradient(p.x + p.w / 2, top, 2, p.x + p.w / 2, top, 40);
      g.addColorStop(0, 'rgba(255,210,122,0.35)');
      g.addColorStop(1, 'rgba(255,210,122,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - 40, top - 40, p.w + 80, 80);
    }
    ctx.fillStyle = p.pressed ? C.plate : '#3a2f1e';
    ctx.fillRect(p.x, top, p.w, p.h - s);
    ctx.strokeStyle = p.pressed ? '#ffe2a6' : '#6b5638';
    ctx.strokeRect(p.x + 0.5, top + 0.5, p.w - 1, p.h - s - 1);
  }
}

function drawLamps(ctx, w) {
  for (const l of w.lamps) {
    if (l.on) {
      const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, LAMP_RADIUS);
      g.addColorStop(0, 'rgba(255,210,122,0.30)');
      g.addColorStop(1, 'rgba(255,210,122,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.x, l.y, LAMP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = l.on ? C.present : '#2c2618';
    ctx.beginPath();
    ctx.arc(l.x, l.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = l.on ? '#fff0c4' : '#5a4d30';
    ctx.stroke();
  }
}

function drawEchoLights(ctx, w, time) {
  for (const l of w.echoLights) {
    const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r);
    g.addColorStop(0, 'rgba(127,243,255,0.22)');
    g.addColorStop(1, 'rgba(127,243,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.setLineDash([2, 5]);
    ctx.lineDashOffset = time * 20;
    ctx.strokeStyle = C.echoDim;
    ctx.beginPath();
    ctx.arc(l.x, l.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSensors(ctx, w) {
  for (const s of w.sensors) {
    ctx.fillStyle = s.pressed ? (s.litByEcho ? C.echo : C.present) : '#202838';
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = s.litByEcho ? C.echo : C.wallEdge;
    ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
  }
}

function drawEmitters(ctx, w, time) {
  for (const e of w.emitters) {
    ctx.strokeStyle = 'rgba(120,160,200,0.35)';
    ctx.beginPath();
    ctx.moveTo(40, e.y); ctx.lineTo(WORLD_W - 40, e.y);
    ctx.stroke();
    // Machine body
    ctx.fillStyle = C.wall;
    ctx.fillRect(e.x - 22, e.y - 14, 44, 22);
    ctx.strokeStyle = C.wallEdge;
    ctx.strokeRect(e.x - 22 + 0.5, e.y - 14 + 0.5, 43, 21);
    // Progress bar: phase toward next emission.
    const frac = e.running ? e.phase / 80 : 0;
    ctx.fillStyle = e.running ? C.present : '#2a3446';
    ctx.fillRect(e.x - 18, e.y + 2, 36 * frac, 3);
    // Nozzle
    ctx.fillStyle = e.running ? C.present : '#2c3650';
    ctx.beginPath();
    ctx.moveTo(e.x - 6, e.y + 8); ctx.lineTo(e.x + 6, e.y + 8); ctx.lineTo(e.x, e.y + 14);
    ctx.fill();
    // Status LED
    ctx.globalAlpha = e.running ? 0.6 + 0.4 * Math.sin(time * 6) : 0.4;
    ctx.fillStyle = e.running ? C.doorOpen : C.doorShut;
    ctx.beginPath();
    ctx.arc(e.x + 16, e.y - 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Splits text into lines no wider than maxWidth, measured with the font currently set.
function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const trial = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(trial).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawBodies(ctx, w) {
  for (const b of w.bodies) {
    if (b.echo) continue;
    // A soft shadow down and to the right, so each ball reads as sitting in the room.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(b.x + 3, b.y + 5, b.r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(b.x - 4, b.y - 4, 1, b.x, b.y, b.r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#8a97ad');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEchoes(ctx, game, time, trails) {
  for (const p of game.playbacks.list) {
    for (const e of p.echoes) {
      if (!e.body.alive) continue;
      const b = e.body;
      // Trail: oldest to newest, fading.
      ctx.lineWidth = 1.5;
      for (let i = 0; trails && i < e.count - 1; i++) {
        const idxA = (e.head - e.count + i + TRAIL_LENGTH * 2) % TRAIL_LENGTH;
        const idxB = (idxA + 1) % TRAIL_LENGTH;
        const a = i / TRAIL_LENGTH;
        ctx.strokeStyle = `rgba(127,243,255,${(a * 0.5).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(e.trail[idxA * 2], e.trail[idxA * 2 + 1]);
        ctx.lineTo(e.trail[idxB * 2], e.trail[idxB * 2 + 1]);
        ctx.stroke();
      }
      // Soft halo: what makes an echo read as a memory rather than a solid ball.
      const halo = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 3.2);
      halo.addColorStop(0, b.ghost ? 'rgba(127,243,255,0.02)' : 'rgba(127,243,255,0.22)');
      halo.addColorStop(1, 'rgba(127,243,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.ghost ? 'rgba(127,243,255,0.05)' : C.echoDim;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = b.ghost ? C.dim : C.echo;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -time * 30;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// Slow dust motes drifting up through the room. Purely visual: reduced motion freezes them at time 0.
function drawMotes(ctx, time) {
  ctx.fillStyle = 'rgba(160,200,230,1)';
  for (let i = 0; i < 36; i++) {
    const x = (i * 271.3) % WORLD_W;
    const y = WORLD_H - ((time * (6 + (i % 5)) + i * 83.7) % WORLD_H);
    ctx.globalAlpha = 0.18 + 0.16 * Math.sin(time * 1.3 + i);
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
}

// Darkens the corners so the eye settles on the middle of the room.
function drawVignette(ctx) {
  const g = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

// Colour-blind mode stripes every plate, so plates are told apart by pattern as well as colour.
function drawPlateStripes(ctx, w) {
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const p of w.plates) {
    ctx.save();
    ctx.beginPath();
    const top = p.y + plateSink(p);
    const h = p.h - (top - p.y);
    ctx.rect(p.x, top, p.w, h);
    ctx.clip();
    ctx.beginPath();
    for (let x = p.x - h; x < p.x + p.w; x += 4) {
      ctx.moveTo(x, top + h);
      ctx.lineTo(x + h, top);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// A faint warm wash over the floor of each open door, so open doors read at a glance.
function drawDoorGlow(ctx, w) {
  for (const d of w.doors) {
    if (!d.open) continue;
    const g = ctx.createLinearGradient(d.x, 0, d.x + d.w, 0);
    g.addColorStop(0, 'rgba(109,255,176,0.10)');
    g.addColorStop(0.5, 'rgba(109,255,176,0.0)');
    g.addColorStop(1, 'rgba(109,255,176,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(d.x - 4, d.y, d.w + 8, d.h);
  }
}

// Transition timeline (debug overlay): one row per recording, a tick for every door change in it.
// Rows are scaled to the longest recording so they can be compared. With a scrub position set
// ([ and ] move it), a marker shows that frame and each recording's door states at that frame.
function drawTimeline(ctx, game, scrub) {
  const x0 = 440, y0 = 330, barX = x0 + 70, barW = 290;
  const recs = game.recordings;
  const scrubbing = typeof scrub === 'number';
  ctx.save();
  ctx.font = scaleFont('10px ui-monospace, Menlo, Consolas, monospace');
  ctx.textAlign = 'left';
  ctx.fillStyle = C.accent;
  ctx.fillText('TRANSITIONS   tick = door change     [ ] scrub 10   { } scrub 60', x0, y0);
  if (recs.length === 0) {
    ctx.fillStyle = C.dim;
    ctx.fillText('no recordings yet', x0, y0 + 16);
    ctx.restore();
    return;
  }
  const longest = Math.max(1, ...recs.map((r) => r.length));
  const xAt = (frame) => barX + (Math.min(frame, longest) / longest) * barW;
  recs.forEach((rec, row) => {
    const y = y0 + 16 + row * 16;
    ctx.fillStyle = recordingColor(row);
    ctx.fillText(rec.name, x0, y + 9);
    ctx.fillStyle = 'rgba(120,160,200,0.12)';
    ctx.fillRect(barX, y + 1, barW, 9);
    for (const [key, tr] of rec.byKey) {
      if (!key.startsWith('door:')) continue;
      for (let i = 1; i < tr.n; i++) {
        if (tr.at(i, 0) === tr.at(i - 1, 0)) continue;
        ctx.fillStyle = tr.at(i, 0) > 0.5 ? C.doorOpen : C.doorShut;
        ctx.fillRect(xAt(i), y, 2, 11);
      }
    }
    if (scrubbing) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(xAt(scrub), y, 1, 11);
    }
  });
  if (scrubbing) {
    const yR = y0 + 16 + recs.length * 16 + 10;
    ctx.fillStyle = C.text;
    ctx.fillText(`frame ${scrub}   ${(scrub / 60).toFixed(2)}s`, x0, yR);
    const maxLines = Math.max(0, Math.floor((WORLD_H - 14 - (yR + 14)) / 12));
    recs.slice(0, maxLines).forEach((rec, i) => {
      const states = [...rec.byKey]
        .filter(([k]) => k.startsWith('door:') && rec.byKey.get(k).n > 0)
        .map(([k, tr]) => `${k.slice(5)} ${tr.at(Math.max(0, Math.min(scrub, tr.n - 1)), 0) > 0.5 ? 'open' : 'shut'}`);
      ctx.fillStyle = recordingColor(i);
      ctx.fillText(`${rec.name}: ${states.join(', ') || 'no doors'}`, x0, yR + 14 + i * 12);
    });
  }
  ctx.restore();
}

function drawFlashes(ctx, flashes, time) {
  for (const f of flashes) {
    const age = time - f.born;
    if (age > 0.6) continue;
    const k = age / 0.6;
    ctx.strokeStyle = f.type === 'presence' ? C.conflict : f.type === 'memory' ? C.present : C.echo;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 10 + k * 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawRegion(ctx, game, time) {
  const r = game.recorder ? game.recorder.region : game.region;
  if (!r) return;
  const recording = !!game.recorder;
  const color = recording ? C.rec : C.accent;
  const pulse = recording ? 0.55 + 0.45 * Math.sin(time * 5) : 0.8;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  // Corner brackets
  const L = 16;
  ctx.lineWidth = 2;
  const corners = [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x, r.y + r.h, 1, -1], [r.x + r.w, r.y + r.h, -1, -1]];
  ctx.beginPath();
  for (const [cx, cy, sx, sy] of corners) {
    ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy);
  }
  ctx.stroke();
  if (recording) {
    ctx.fillStyle = C.rec;
    ctx.font = scaleFont('11px ui-monospace, Menlo, Consolas, monospace');
    ctx.fillText('● REC', r.x + 6, r.y + r.h - 6);
  }
  ctx.restore();
}

// ---------- debug overlay (F3) ----------

function drawDebug(ctx, game, view) {
  const w = game.world;
  ctx.save();
  ctx.font = scaleFont('10px ui-monospace, Menlo, Consolas, monospace');

  // Recorded trajectories, one colour per recording. Body tracks are polylines;
  // fixture transitions are ticks on the timeline.
  game.recordings.forEach((rec, ri) => {
    const color = recordingColor(ri);
    ctx.strokeStyle = color;
    ctx.globalAlpha = game.selected.has(ri + 1) ? 0.7 : 0.25;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    for (const tr of rec.tracks) {
      if (tr.kind !== 'body' || tr.n < 2) continue;
      ctx.beginPath();
      ctx.moveTo(tr.at(0, 0), tr.at(0, 1));
      for (let i = 1; i < tr.n; i++) ctx.lineTo(tr.at(i, 0), tr.at(i, 1));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });

  // Region bounds for every recording.
  for (const rec of game.recordings) {
    const r = rec.region;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
  }

  // Echo ids and live bodies.
  ctx.fillStyle = C.echo;
  for (const p of game.playbacks.list) {
    for (const e of p.echoes) {
      if (!e.body.alive) continue;
      ctx.fillText(`echo#${e.body.id} trk@${e.tr.start}+${e.tr.n}`, e.body.x + 14, e.body.y - 10);
    }
  }
  ctx.fillStyle = C.dim;
  for (const b of w.bodies) if (!b.echo) ctx.fillText(`body#${b.id}`, b.x + 14, b.y + 4);

  // Active conflicts this tick.
  for (const c of w.conflicts) {
    ctx.fillStyle = C.conflict;
    ctx.fillText(`${c.type} ${c.key}`, c.x + 8, c.y - 8);
  }

  ctx.restore();
}

function drawDebugPanel(ctx, game, view) {
  const w = game.world;
  ctx.save();
  ctx.font = scaleFont('10px ui-monospace, Menlo, Consolas, monospace');
  ctx.textAlign = 'left';
  const x = 18;
  let y = 290;
  const line = (text, color = C.text) => { ctx.fillStyle = color; ctx.fillText(text, x, y); y += 13; };

  line(`DEBUG  tick ${w.tick}   hash ${hashWorld(w)}`, C.accent);
  if (view.frameMs) line(`frame ${view.frameMs.toFixed(1)} ms   ${Math.round(1000 / view.frameMs)} fps`);
  line(`bodies ${w.bodies.length}   playbacks ${game.playbacks.activeCount}   conflicts ${w.conflicts.length}`);
  const ghosts = w.bodies.filter((b) => b.echo && b.ghost).length;
  line(`echoes ${w.bodies.filter((b) => b.echo).length}   ghosts ${ghosts}`);

  // Recorded fixture transitions for the selected recordings, one line each.
  line('transitions (selected recordings):', C.dim);
  let shown = 0;
  game.recordings.forEach((rec, ri) => {
    if (!game.selected.has(ri + 1)) return;
    for (const tr of rec.tracks) {
      if (tr.kind === 'body' || tr.kind === 'lamp' || tr.kind === 'sensor' || tr.kind === 'plate') continue;
      for (let i = 1; i < tr.n && shown < 8; i++) {
        const v = tr.at(i, 0), pv = tr.at(i - 1, 0);
        if (v !== pv) {
          line(`  ${rec.name} ${tr.kind} ${v > 0.5 ? 'on ' : 'off'} @ frame ${i}`, recordingColor(ri));
          shown++;
        }
      }
    }
  });
  if (shown === 0) line('  none', C.dim);

  // Object history for whatever the pointer is over.
  if (view.hover) {
    const info = game.describeAt(view.hover.x, view.hover.y);
    if (info) {
      y += 6;
      line(`under pointer: ${info.kind}${info.id ? ' #' + info.id : info.name ? ' ' + info.name : ''}`, C.accent);
      if (info.kind === 'body') line(`  pos ${info.x.toFixed(1)}, ${info.y.toFixed(1)}   vel ${info.vx.toFixed(1)}, ${info.vy.toFixed(1)}`);
      if (info.kind === 'echo') {
        line(`  pos ${info.x.toFixed(1)}, ${info.y.toFixed(1)}   ${info.ghost ? 'GHOST' : 'coherent'}`);
        if (info.discord !== undefined) line(`  discord ${info.discord.toFixed(2)}   memory ${info.track || '—'}`);
      }
      if (info.kind === 'door') {
        line(`  ${info.open ? 'open' : 'shut'}`);
        for (const t of info.transitions.slice(0, 5)) line(`  ${t}`, C.dim);
        if (info.transitions.length === 0) line('  no recorded transitions', C.dim);
      }
    }
  }
  ctx.restore();
}

// ---------- HUD (drawn in world coordinates over the scene) ----------

const EVENT_COLUMN_WIDTH = 200;

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawHud(ctx, game, view) {
  const { time, events } = view;
  ctx.save();
  const mono = '12px ui-monospace, Menlo, Consolas, monospace';
  const small = '10px ui-monospace, Menlo, Consolas, monospace';

  // Top-left: level and brief
  ctx.fillStyle = C.accent;
  ctx.font = scaleFont(`bold 14px ui-monospace, Menlo, Consolas, monospace`);
  ctx.fillText(`THE WORLD IS A RECORDING  ·  ${game.level.title.trim()}`, 18, 26);
  ctx.font = scaleFont(mono);
  ctx.fillStyle = C.text;
  game.level.brief.forEach((line, i) => ctx.fillText(line, 18, 46 + i * 15));
  const goalY = 46 + game.level.brief.length * 15 + 8;
  if (game.level.goalText) {
    const done = game.completed;
    ctx.fillStyle = done ? C.doorOpen : C.present;
    ctx.fillText(`${done ? '✓' : '◇'} ${game.level.goalText}`, 18, goalY);
  }
  ctx.fillStyle = C.dim;
  if (game.completed && game.lastResult) {
    const r = game.lastResult;
    const n = game.recordings.length;
    ctx.fillStyle = C.present;
    ctx.fillText(`done in ${(r.ticks / 60).toFixed(1)}s${r.newBest ? '  ·  new best' : ''}  ·  ${n} recording${n === 1 ? '' : 's'}`, 18, goalY + 16);
    ctx.fillStyle = C.dim;
  }
  if (game.level.hint) {
    if (view.showHint) {
      // Revealed hints sit bottom-left, wrapped, clear of the right-hand panel.
      const lines = wrapText(ctx, `hint: ${game.level.hint}`, 560);
      lines.forEach((l, i) => ctx.fillText(l, 18, 486 - (lines.length - 1 - i) * 14 - 16));
    } else if (!game.completed) {
      ctx.fillText('H  show hint', 18, goalY + 16);
    }
  }

  // Top-right: status and time
  const mode = game.recorder ? 'RECORDING' : game.playbacks.activeCount > 0 ? `REPLAY ×${game.playbacks.activeCount}` : 'LIVE';
  const modeColor = game.recorder ? C.rec : game.playbacks.activeCount > 0 ? C.echo : C.dim;
  ctx.font = scaleFont(mono);
  ctx.textAlign = 'right';
  ctx.fillStyle = modeColor;
  ctx.fillText(mode, WORLD_W - 18, 26);
  ctx.fillStyle = C.dim;
  ctx.font = scaleFont(small);
  const speedTag = view.speed !== 1 ? `   SPEED ×${view.speed}` : '';
  ctx.fillText(`tick ${game.world.tick}   t=${(game.world.tick / 60).toFixed(2)}s${speedTag}`, WORLD_W - 18, 42);
  ctx.textAlign = 'left';

  // Event log: a narrow column (440–640) so it never runs into the right-hand legend.
  // Long messages wrap. Newest first, fading.
  ctx.font = scaleFont(small);
  ctx.textAlign = 'left';
  let ey = 130;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const a = Math.max(0, 1 - (time - e.t) / (e.ttl || 6));
    if (a <= 0 || ey > 300) continue;
    ctx.fillStyle = `rgba(200,214,232,${(a * 0.85).toFixed(3)})`;
    for (const line of wrapText(ctx, e.text, EVENT_COLUMN_WIDTH)) {
      ctx.fillText(line, 440, ey);
      ey += 12;
    }
    ey += 4;
  }

  // Right-hand column: recordings, then controls. Kept above the floor line.
  const colX = WORLD_W - 18;
  let y = 74;
  ctx.textAlign = 'right';
  ctx.font = scaleFont(small);
  ctx.fillStyle = C.dim;
  ctx.fillText('RECORDINGS', colX, y);
  y += 16;
  if (game.recordings.length === 0) {
    ctx.fillText('none yet', colX, y);
    y += 15;
  }
  game.recordings.forEach((rec, i) => {
    const sel = game.selected.has(i + 1);
    ctx.fillStyle = recordingColor(i);
    ctx.fillText(`${sel ? '■' : '□'} ${i + 1}  ${rec.name}  ${(rec.length / 60).toFixed(1)}s  ${rec.tracks.length} tracks`, colX, y);
    y += 15;
  });
  ctx.fillStyle = C.dim;
  ctx.fillText('1–9 select · P replay · S stop · ⌫ delete last', colX, y);
  y += 30;

  const lines = [
    'DRAG    select region',
    'SPACE   record / stop',
    'CLICK   drop ball in zone · remove ball',
    '        toggle door · slide emitter',
    'X       reset level (keeps recordings)',
    'H       hint      F3  debug overlay      M  mute',
  ];
  lines.forEach((l) => { ctx.fillText(l, colX, y); y += 14; });
  if (game.completed && game.level.goalText) {
    y += 8;
    ctx.fillStyle = C.doorOpen;
    ctx.font = scaleFont(mono);
    ctx.fillText(game.isSandbox ? '' : 'ENTER  continue', colX, y);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
