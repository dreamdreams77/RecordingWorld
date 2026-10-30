// Menus and flow screens: title, level select, settings, controls, archive, pause, chapter summary,
// the ending's choice and credits. Plain DOM, keyboard- and mouse-operable, honouring UI scale and
// reduced-motion settings.

import { TRUTHS } from '../levels/story.js';
import { LEVELS, CAMPAIGN } from '../levels/index.js';
import { QUALITY, DEFAULT_SETTINGS, saveSettings } from '../game/settings.js';
import { loadProgress, saveProgress, resetAll, hasSnapshot, loadSnapshot } from '../game/progress.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const mmss = (ticks) => { const s = Math.floor(ticks / 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const CONTROLS = [
  ['W A S D', 'Move'], ['Mouse', 'Look'], ['Space', 'Jump'], ['E', 'Use lever / mirror · load archive tape'],
  ['Q', 'Frame mode: aim a recording volume'], ['Left click', 'Pin the framed volume (in frame mode)'], ['Mouse wheel', 'Resize volume  (Shift: height only)'], ['Right click', 'Clear the pinned volume'],
  ['R', 'Record / stop (uses pinned volume, or a volume around you)'], ['1 – 6', 'Select recording slot'],
  ['T', 'Play / pause the selected slot'], ['Y', 'Stop (dismiss the echo)'], ['U', 'Play every slot on the same tick'], ['L', 'Cycle playback mode: once · loop · ping-pong · hold'],
  ['G', 'Reverse direction'], [', .', 'Scrub back / forward  (Shift: faster)'], ['[ ]', 'Playback rate'], ['Backspace', 'Erase the selected slot'],
  ['Z X C V B N M', 'Hold to sing notes C D E F G A B'], ['Tab', 'Expand the state comparison'], ['H', 'Show / hide the hint'],
  ['K', 'Return to checkpoint and recall crates'], ['Shift+K', 'Reset the section (keeps your recordings)'], ['F6', 'Rewind: step back through automatic captures'], ['Shift+Backspace', 'Roll the selected slot back to its previous take'], ['F5', 'Save a snapshot'], ['F3 · F4', 'Developer overlay · trajectories and volumes'], ['Esc', 'Pause'],
  ['Sandbox: B · Enter · Del · F', 'Cycle item · place · remove · link source → sink  (Shift+F: link inverted)'],
];

const TOUCH_CONTROLS = [
  ['Left thumb', 'Move stick (appears where you touch)'], ['Right thumb', 'Drag to look · quick tap = click (pin the frame / place)'],
  ['FRAME · REC · USE · PLAY · JUMP', 'The main actions (Q · R · E · T · Space)'], ['① button', 'Cycle the recording slot'], ['⟲', 'Rewind (F6)'], ['☰', 'Pause menu'],
  ['⋯', 'More: STOP · MODE · REV · scrub ◂ ▸ · size − + · unpin ✕ · TAB · ALL · HINT · ×½ ×2 · ERASE · UNDO · RESET'], ['♪', 'Sing notes C D E F G A B (hold)'],
];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Menus {
  constructor(root, game) {
    this.root = root; this.game = game; this.current = null; this.stack = [];
    this.screens = {};
    for (const n of ['title', 'levels', 'settings', 'controls', 'archive', 'pause', 'complete', 'loading', 'choice', 'credits', 'confirm']) {
      const s = el('div', 'screen'); s.id = n; root.appendChild(s); this.screens[n] = s;
    }
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.current) {
        if (this.current === 'pause') this.game.resume();
        else if (['settings', 'controls', 'archive', 'levels'].includes(this.current)) this.back();
      }
      if (this.current && ['Enter', 'NumpadEnter'].includes(e.code) && !['loading', 'confirm-x'].includes(this.current)) {
        const ae = document.activeElement;
        if (!(ae && ae.tagName === 'BUTTON' && this.screens[this.current].contains(ae))) {
          const first = this.screens[this.current].querySelector('button:not([disabled])');
          if (first) { first.click(); e.preventDefault(); }
        }
      }
      if (this.current && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) this.moveFocus(e.code === 'ArrowDown' ? 1 : -1, e);
    });
  }
  moveFocus(d, e) {
    const btns = [...this.screens[this.current].querySelectorAll('button:not([disabled])')];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement);
    btns[(i + d + btns.length) % btns.length].focus(); e.preventDefault();
  }

  show(name, push = false) {
    if (push && this.current) this.stack.push(this.current);
    for (const [k, s] of Object.entries(this.screens)) s.classList.toggle('on', k === name);
    this.current = name;
    this.game.hud.layer.style.display = 'none';
    this.render(name);
    this.screens[name].querySelector('button')?.focus();
  }
  hide() {
    for (const s of Object.values(this.screens)) s.classList.remove('on');
    this.current = null; this.stack = [];
    this.game.hud.layer.style.display = '';
  }
  back() {
    const prev = this.stack.pop();
    if (prev) this.show(prev); else this.show(this.game.state === 'pause' ? 'pause' : 'title');
  }
  btn(label, fn, small = '') { const b = el('button', '', `${label}${small ? `<small>${small}</small>` : ''}`); b.onclick = () => { this.game.audio?.init(); this.game.audio?.event('select'); fn(); }; return b; }

  render(name) {
    const s = this.screens[name]; s.innerHTML = '';
    const m = el('div', 'menu'); s.appendChild(m);
    const P = this.game.progress = loadProgress();
    const g = this.game;
    switch (name) {
      case 'title': {
        m.innerHTML = `<h1>The World <em>Is a</em> Recording</h1><div class="sub">A game about the physical history of a world</div>`;
        const snap = hasSnapshot() ? loadSnapshot() : null;
        const anyProgress = Object.keys(P.levels).length > 0;
        if (snap) m.appendChild(this.btn('Continue', () => this.startFromSnapshot(snap), `${LEVELS[snap.levelId]?.title ?? ''}`));
        else if (anyProgress) m.appendChild(this.btn('Continue', () => this.start(CAMPAIGN[Math.min(P.unlocked, CAMPAIGN.length) - 1]), `Chapter ${ROMAN[Math.min(P.unlocked, 6)]}`));
        m.appendChild(this.btn(snap || anyProgress ? 'New campaign' : 'Begin', () => { if (snap || anyProgress) this.confirm('Start a new campaign? Progress and saved snapshot will be erased.', () => { resetAll(); g.progress = loadProgress(); this.start('ch1'); }); else this.start('ch1'); }));
        m.appendChild(this.btn('Chapters', () => this.show('levels', true)));
        m.appendChild(this.btn('Sandbox', () => this.start('sandbox'), P.sandbox ? '' : 'unlocks after the ending'));
        if (!P.sandbox) m.lastChild.disabled = true;
        m.appendChild(this.btn('Archive', () => this.show('archive', true), 'recovered logs'));
        m.appendChild(this.btn('Settings', () => this.show('settings', true)));
        m.appendChild(this.btn('Controls', () => this.show('controls', true)));
        const f = el('div', 'tiny', (document.body.classList.contains('touch') ? 'Tap Begin · Headphones recommended · landscape works best' : 'Press Enter to begin · Headphones recommended · mouse and keyboard · Chrome, Edge, Firefox')); f.style.marginTop = '18px'; m.appendChild(f);
        break;
      }
      case 'levels': {
        m.innerHTML = `<h1>Chapters</h1><div class="sub">Six environments · one mechanic</div>`;
        CAMPAIGN.forEach((id, i) => {
          const L = LEVELS[id], r = P.levels[id], locked = i + 1 > P.unlocked;
          const b = this.btn('', () => this.start(id));
          b.className = 'lvl'; b.disabled = locked;
          b.innerHTML = `<span class="rn">${ROMAN[L.index]}</span><span style="flex:1">${L.title}<br><span class="tiny">${locked ? 'locked' : `${r?.done ? 'complete · ' + mmss(r.bestTicks ?? 0) + ' · ' : ''}logs ${(r?.discoveries.length ?? 0)}/${L.discoveries.length} · experiments ${(r?.experiments.length ?? 0)}/${L.experiments.length}`}</span></span>`;
          m.appendChild(b);
        });
        m.appendChild(this.btn('Back', () => this.back()));
        break;
      }
      case 'settings': this.renderSettings(m); break;
      case 'controls': {
        m.innerHTML = `<h1>Controls</h1><div class="sub">The Recollector instrument</div>`;
        const k = el('div', 'keys'); for (const [a, b] of (document.body.classList.contains('touch') ? TOUCH_CONTROLS : CONTROLS)) k.innerHTML += `<b>${a}</b><span>${b}</span>`; m.appendChild(k);
        const note = el('p', '', 'A recording captures the state of everything inside the pinned volume. Replays are physical: they press plates, carry weight, hold doors, spin machines, shine light and sing — and the world reconciles them with the present by fixed rules.'); note.style.marginTop = '18px'; m.appendChild(note);
        m.appendChild(this.btn('Back', () => this.back()));
        break;
      }
      case 'archive': {
        m.innerHTML = `<h1>Archive</h1><div class="sub">Recovered logs and completed experiments</div>`;
        let n = 0, tot = 0;
        for (const id of CAMPAIGN) {
          const L = LEVELS[id], r = P.levels[id];
          m.appendChild(el('h2', '', `${ROMAN[L.index]} · ${L.title}`));
          for (const d of L.discoveries) { tot++; const have = r?.discoveries.includes(d.id); if (have) n++; m.appendChild(el('p', '', have ? `<b style="color:var(--gold)">${d.title}</b><br>${d.text}` : `<span style="color:var(--dim)">— unrecovered —</span>`)); }
        }
        const got = P.truths ?? [];
        m.appendChild(el('h2', '', `What you understand · ${got.length} of ${TRUTHS.length}`));
        for (const t of TRUTHS) { const h = got.includes(t.id); m.appendChild(el('p', '', h ? `<b style="color:var(--gold)">${t.title}</b><br>${t.text}` : `<span style="color:var(--dim)">— not yet understood —</span>`)); }
        m.appendChild(el('div', 'tiny', `${n} of ${tot} logs recovered`));
        m.appendChild(this.btn('Back', () => this.back()));
        s.style.overflowY = 'auto'; s.style.alignItems = 'flex-start'; m.style.padding = '40px 0';
        break;
      }
      case 'pause': {
        m.innerHTML = `<h1>Paused</h1><div class="sub">${g.level?.title ?? ''} — the simulation holds its breath</div>`;
        m.appendChild(this.btn('Resume', () => g.resume()));
        m.appendChild(this.btn('Save snapshot', () => { g.quickSave(); }, 'F5'));
        m.appendChild(this.btn('Return to checkpoint', () => { g.resume(); g.restartSection(); }));
        m.appendChild(this.btn('Settings', () => this.show('settings', true)));
        m.appendChild(this.btn('Controls', () => this.show('controls', true)));
        m.appendChild(this.btn('Quit to title', () => this.confirm('Quit to the title screen? Unsaved progress in this chapter is lost.', () => g.toTitle())));
        break;
      }
      case 'confirm': break;
      default:
    }
  }

  confirm(text, yes) {
    const s = this.screens.confirm; s.innerHTML = '';
    const m = el('div', 'menu'); s.appendChild(m);
    m.appendChild(el('p', '', text));
    m.appendChild(this.btn('Yes', () => { s.classList.remove('on'); yes(); }));
    m.appendChild(this.btn('Cancel', () => { s.classList.remove('on'); }));
    s.classList.add('on'); s.style.zIndex = 30; m.querySelector('button').focus();
  }

  renderSettings(m) {
    const g = this.game, S = g.settings;
    m.innerHTML = `<h1>Settings</h1><div class="sub">Graphics · audio · accessibility</div>`;
    const row = (label, ctl) => { const r = el('div', 'row'); r.appendChild(el('label', '', label)); r.appendChild(ctl); m.appendChild(r); return r; };
    const slider = (key, min, max, step, fmt = (v) => v.toFixed(2)) => { const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S[key]; const v = el('span', 'tiny', fmt(+S[key])); i.oninput = () => { S[key] = +i.value; v.textContent = fmt(S[key]); g.applySettings(); }; const w = el('div'); w.style.display = 'flex'; w.style.gap = '10px'; w.append(i, v); return w; };
    const check = (key, after) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!S[key]; i.onchange = () => { S[key] = i.checked; g.applySettings(); after?.(); }; return i; };
    const select = (key, opts, after) => { const i = el('select'); for (const [v, l] of opts) { const o = el('option', '', l); o.value = v; if (String(S[key]) === String(v)) o.selected = true; i.appendChild(o); } i.onchange = () => { S[key] = isNaN(+i.value) ? i.value : +i.value; g.applySettings(); after?.(); }; return i; };
    m.appendChild(el('h2', '', 'Graphics'));
    row('Quality preset', select('quality', Object.entries(QUALITY).map(([k, q]) => [k, q.label]), () => g.applyQuality(S.quality)));
    row('Field of view', slider('fov', 60, 110, 1, (v) => `${v.toFixed(0)}°`));
    m.appendChild(el('h2', '', 'Audio'));
    row('Master', slider('master', 0, 1, 0.01)); row('Effects', slider('sfx', 0, 1, 0.01)); row('Ambience', slider('ambience', 0, 1, 0.01)); row('Music & chimes', slider('music', 0, 1, 0.01)); row('Voice (Recollector)', slider('voice', 0, 1, 0.01));
    m.appendChild(el('h2', '', 'Controls'));
    row('Mouse sensitivity', slider('sensitivity', 0.2, 3, 0.05)); row('Invert Y', check('invertY'));
    m.appendChild(el('h2', '', 'Accessibility'));
    row('Reduced motion (no head bob, calmer post-processing)', check('reducedMotion', () => { S.headBob = !S.reducedMotion; }));
    row('Head bob', check('headBob')); row('High contrast', check('highContrast'));
    row('Colour-vision filter', select('colorblind', [[0, 'Off'], [1, 'Protanopia'], [2, 'Deuteranopia'], [3, 'Tritanopia']]));
    row('Reduce flashing', check('flashReduction')); row('UI scale', slider('uiScale', 0.8, 1.6, 0.05, (v) => `${(v * 100).toFixed(0)}%`));
    row('Subtitles', check('subtitles')); row('Hints on', check('hints')); row('Autosave at checkpoints', check('autosave'));
    row('Developer overlay (F3)', check('devMode', () => { g.dev = S.devMode; }));
    m.appendChild(this.btn('Reset to defaults', () => { Object.assign(S, DEFAULT_SETTINGS); g.applySettings(); g.renderer.applyQuality(S.quality); this.render('settings'); }));
    m.appendChild(this.btn('Back', () => this.back()));
    this.screens.settings.style.overflowY = 'auto'; this.screens.settings.style.alignItems = 'flex-start'; m.style.padding = '40px 0';
  }

  // ---------------------------------------------------------------- flow
  loading(text, p) {
    const s = this.screens.loading;
    if (!s.classList.contains('on')) { s.innerHTML = `<div class="menu" id="loading"><h1><em>Loading</em></h1><div class="sub" id="ltxt"></div><div class="bar"><i></i></div></div>`; }
    for (const [k, v] of Object.entries(this.screens)) v.classList.toggle('on', k === 'loading');
    this.current = 'loading';
    s.querySelector('#ltxt').textContent = text; s.querySelector('.bar i').style.width = `${p * 100}%`;
  }
  async start(id, snapshot = null) {
    this.game.audio?.init();
    this.loading(snapshot ? 'Restoring the recording' : 'Preparing', 0.02);
    const order = ['ultra', 'high', 'medium', 'low'];
    for (;;) {
      try {
        await this.game.startLevel(id, { snapshot, loadingCb: (p, t) => this.loading(t, p) });
        this.hide();
        return;
      } catch (err) {
        console.error('Level failed to start', err);
        const q = this.game.settings.quality, next = order[order.indexOf(q) + 1];
        if (next) { // some GPUs reject a heavy effect: step down one preset and retry
          this.game.settings.quality = next; this.game.renderer.q = { ...QUALITY[next] }; this.game.renderer.applyQualityQuiet?.(next);
          this.loading(`Graphics error on ${q}; retrying on ${next}`, 0.05);
          continue;
        }
        this.showError(err);
        return;
      }
    }
  }
  startFromSnapshot(snap) { return this.start(snap.levelId, snap); }
  showError(err) {
    const s = this.screens.confirm; s.innerHTML = '';
    const m = el('div', 'menu'); s.appendChild(m);
    m.innerHTML = `<h1>Could not start</h1><div class="sub">The renderer reported an error</div><p>${String(err?.message ?? err).slice(0, 300)}</p>`;
    m.appendChild(this.btn('Back to title', () => { s.classList.remove('on'); this.game.toTitle(); }));
    for (const [k, v] of Object.entries(this.screens)) v.classList.toggle('on', k === 'confirm');
    this.current = 'confirm-x';
  }
  rating(used, par) {
    const tier = used <= par ? 'Gold' : used <= par + 2 ? 'Silver' : 'Bronze';
    return `${tier} — ${used} recording${used === 1 ? '' : 's'} (par ${par}, from the scripted solution)`;
  }
  showComplete(level, director, ticks) {
    const s = this.screens.complete; s.innerHTML = '';
    const idx = CAMPAIGN.indexOf(level.id), m = el('div', 'menu'); s.appendChild(m);
    m.innerHTML = `<h1><em>${ROMAN[level.index]}.</em> ${level.title}</h1><div class="sub">Chapter complete</div>
      <p>${level.narrative?.outro ?? ''}</p>
      <div class="keys"><b>Time</b><span>${mmss(ticks)} (${ticks} ticks)</span><b>Recordings</b><span>${director.stats.recordings}</span>
      <b>Logs</b><span>${[...director.found].filter((d) => level.discoveries.some((x) => x.id === d)).length} / ${level.discoveries.length}</span>
      <b>Experiments</b><span>${[...director.done].length} / ${level.experiments.length}</span>
      <b>Economy</b><span>${this.rating(director.stats.recordings, level.par?.recordings ?? 0)}</span></div><br>`;
    if (idx >= 0 && idx < CAMPAIGN.length - 1) m.appendChild(this.btn(`Chapter ${ROMAN[idx + 2]}: ${LEVELS[CAMPAIGN[idx + 1]].title}`, () => this.start(CAMPAIGN[idx + 1])));
    m.appendChild(this.btn('Replay chapter', () => this.start(level.id)));
    m.appendChild(this.btn('Chapters', () => this.show('levels')));
    m.appendChild(this.btn('Title', () => this.game.toTitle()));
    this.current = 'complete';
    for (const [k, v] of Object.entries(this.screens)) v.classList.toggle('on', k === 'complete');
    this.game.hud.layer.style.display = 'none';
    m.querySelector('button')?.focus();
  }
  showChoice(onRelease, onHold) {
    const s = this.screens.choice; s.innerHTML = '';
    const m = el('div', 'menu'); s.appendChild(m);
    m.innerHTML = `<h1>The playhead is <em>yours</em></h1><div class="sub">There is no wrong frame to stop on</div><p>The recording is almost over. Beyond its last frame is the present it was made to protect. You can let the playhead go, or you can hold this moment forever.</p><br>`;
    m.appendChild(this.btn('Release the recording', onRelease, 'let the present resume'));
    m.appendChild(this.btn('Hold the last frame', onHold, 'keep the last day, forever'));
    for (const [k, v] of Object.entries(this.screens)) v.classList.toggle('on', k === 'choice');
    this.current = 'choice'; m.querySelector('button').focus();
  }
  showCredits(ending, onDone) {
    const s = this.screens.credits; s.innerHTML = '';
    const m = el('div', 'menu'); s.appendChild(m);
    const line = ending === 'release'
      ? 'The recording ends. The playhead stops. Behind it, the present resumes — and the first thing it does is move.'
      : 'Nothing ends. The last day plays again, and each time a little more of it is true, because you are in it.';
    m.innerHTML = `<h1><em>The World</em> Is a Recording</h1><div class="sub">${ending === 'release' ? 'Ending: Release' : 'Ending: Hold'}</div><p>${line}</p>
      <p style="color:var(--dim);font-size:.85em">Design, engineering, rendering, audio and level design by the studio of one.<br>All geometry, textures, music and sound are generated procedurally at runtime.<br>Built with three.js and Vite · MIT licensed.</p>
      <div class="tiny">The Sandbox is now unlocked.</div><br>`;
    m.appendChild(this.btn('Return to title', onDone));
    for (const [k, v] of Object.entries(this.screens)) v.classList.toggle('on', k === 'credits');
    this.current = 'credits'; m.querySelector('button').focus();
  }
}
