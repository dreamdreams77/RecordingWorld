// The reel: the instrument's timeline. It is not a video scrubber — each recorded object has its own lane, showing when it
// was inside the volume and when it changed state, with the significant moments (a plate pressed, a door opening, a note
// sung…) marked where they happened. It opens while recording or handling an echo and falls away while exploring.
// Touch and an un-locked mouse drag it directly; with the mouse locked, Ctrl + mouse move is the jog wheel.

const HUES = ['#ffa94d', '#62e0b4', '#ff6459', '#b7a0ff', '#d5f25c', '#ffc2d4'];
const KIND = {
  plate: ['#f0c070', '▼'], switch: ['#e8d8a8', '◆'], door: ['#9fc8e8', '▮'], logic: ['#b8a8d8', '◇'], sound: ['#8fe0c8', '♪'], note: ['#8fe0c8', '♪'],
  light: ['#ffe9a0', '✦'], eye: ['#ff8a70', '◉'], machine: ['#d8a070', '⚙'], wear: ['#c0b090', '▫'], glass: ['#bfe4ff', '✧'], enter: ['#ffffff', '▸'], leave: ['#a0a0a0', '◂'],
  jump: ['#cfcfcf', '▴'], move: ['#d0b090', '▪'], state: ['#cccccc', '●'],
};
const LANE_H = 17, RULER_H = 15, EVT_H = 15, PAD_L = 64, PAD_R = 8;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const secs = (t) => (t / 60).toFixed(2);

export class Reel {
  constructor(game) {
    this.g = game; this.I = game.instr;
    this.root = el('div', 'reel'); this.root.hidden = false;
    this.root.innerHTML = `<div class="rl-hd"><span class="rl-pill"></span><span class="rl-name"></span><span class="rl-chips"></span><span class="rl-read"></span></div>
      <canvas class="rl-cv"></canvas><div class="rl-say"></div><div class="rl-bar"></div>`;
    document.body.appendChild(this.root);
    this.q = (s) => this.root.querySelector(s);
    this.cv = this.q('.rl-cv'); this.say = this.q('.rl-say'); this.cache = null; this.hover = null; this.drag = null; this.W = 600; this.H = 60; this.lanes = [];
    this.buttons();
    this.pointers();
    this.open = false; this.root.classList.add('closed');
  }

  // ---------------------------------------------------------------- buttons (work with mouse and touch)
  buttons() {
    const I = this.I, bar = this.q('.rl-bar');
    const b = (label, sub, fn, cls = '') => {
      const e = el('button', `rl-b ${cls}`, `<span>${label}</span>${sub ? `<small>${sub}</small>` : ''}`); e.type = 'button';
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); e.classList.add('on'); fn(); I.poke(); });
      const up = () => e.classList.remove('on'); e.addEventListener('pointerup', up); e.addEventListener('pointerleave', up); e.addEventListener('pointercancel', up);
      bar.appendChild(e); return e;
    };
    b('⏮', ';', () => I.jumpMarker(-1), 'sm'); this.stepBack = b('◂', ',', () => I.scrubBy(-1), 'sm'); this.stepFwd = b('▸', '.', () => I.scrubBy(1), 'sm'); b('⏭', "'", () => I.jumpMarker(1), 'sm');
    this.bPlay = b('▶ PLAY', 'T', () => (I.isPreview() ? I.playHere() : I.togglePlay()), 'main');
    this.bFreeze = b('❄ FREEZE', 'F', () => I.freezeHere(), 'main ice');
    this.bRev = b('◀ REV', 'G', () => I.reverse()); b('½', '[', () => I.rate(-1), 'sm'); b('×2', ']', () => I.rate(1), 'sm'); b('↻', 'L', () => I.cycleMode(), 'sm');
    // press-and-hold repeat for the single-tick buttons, so a hard puzzle can be walked frame by frame or run quickly
    for (const [btn, dir] of [[this.stepBack, -1], [this.stepFwd, 1]]) {
      let timer = null, rep = null;
      btn.addEventListener('pointerdown', () => { timer = setTimeout(() => { rep = setInterval(() => I.scrubBy(dir), 40); }, 320); });
      const stop = () => { clearTimeout(timer); clearInterval(rep); rep = null; };
      btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); btn.addEventListener('pointercancel', stop);
    }
  }

  // ---------------------------------------------------------------- pointer: drag the timeline, tap a lane to omit it
  tickAt(x) { const r = this.I.rec; if (!r) return 0; const t = (x - PAD_L) / (this.W - PAD_L - PAD_R); return Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1)))); }
  local(e) { const r = this.cv.getBoundingClientRect(); return [(e.clientX - r.left) * (this.W / r.width), (e.clientY - r.top) * (this.H / r.height)]; }
  laneAt(y) { const i = Math.floor((y - RULER_H - EVT_H) / LANE_H); return i >= 0 && i < this.lanes.length ? this.lanes[i] : null; }
  pointers() {
    const cv = this.cv, I = this.I;
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); cv.setPointerCapture(e.pointerId);
      const [x, y] = this.local(e), lane = x < PAD_L ? this.laneAt(y) : null;
      if (lane) { // lane label: tap omits, shift/long-press solos
        const t0 = performance.now(); this.drag = { lane, t0, solo: e.shiftKey, moved: false };
        return;
      }
      this.drag = { scrub: true }; I.scrubTo(this.tickAt(x)); I.poke();
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = this.local(e); this.hover = { x, y };
      if (this.drag?.scrub) { I.scrubTo(this.tickAt(x)); I.poke(); }
    });
    const end = (e) => {
      const d = this.drag; this.drag = null;
      if (d?.lane) { const solo = d.solo || performance.now() - d.t0 > 450; I.lane(d.lane.id, solo); }
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', () => { this.drag = null; });
    cv.addEventListener('pointerleave', () => { this.hover = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); I.scrubBy(-Math.sign(e.deltaY) * (e.shiftKey ? 10 : 1)); }, { passive: false });
  }

  // ---------------------------------------------------------------- per-frame
  update() {
    const g = this.g, I = this.I, w = g.world;
    const playing = g.state === 'play' || g.state === 'cinematic';
    const rec = I.rec, recorder = w?.recorder;
    const show = playing && !!w && (!!recorder || (!!rec && I.expanded()));
    if (show !== this.open) { this.open = show; this.root.classList.toggle('closed', !show); document.body.classList.toggle('reel-open', show); }
    g.hud.setCompact?.(!show);
    if (!show) return;
    const pb = I.pb, slot = I.slot, hue = HUES[slot % 6];
    this.root.style.setProperty('--hue', hue);
    this.q('.rl-pill').textContent = slot + 1;
    if (recorder && recorder.slot === slot) { this.drawRecording(recorder); return; }
    if (!rec) return;
    this.root.classList.remove('recording');
    this.q('.rl-name').textContent = rec.name + (rec.source === 'archive' ? ' · tape' : '');
    const h = I.head(), len = rec.length;
    const chips = [];
    if (I.isPreview()) chips.push('<i class="c pv">◌ PREVIEW</i>');
    else if (pb?.active) chips.push(pb.playing ? (pb.rate < 0 ? '<i class="c rv">◀ REVERSE</i>' : '<i class="c">▶ PLAY</i>') : '<i class="c ice">❄ FROZEN</i>');
    else chips.push('<i class="c dim">■ READY</i>');
    if (pb && Math.abs(pb.rate) !== 1) chips.push(`<i class="c ${Math.abs(pb.rate) < 1 ? 'sl' : ''}">×${Math.abs(pb.rate)}</i>`);
    if (pb) chips.push(`<i class="c ${pb.mode === 'loop' ? 'lp' : 'dim'}">${pb.mode === 'loop' ? '↻ ' : ''}${pb.mode}</i>`);
    if (pb?.muted.size) chips.push(`<i class="c om">⊘ ${pb.muted.size} left out</i>`);
    const sig = chips.join('');
    if (sig !== this._sig) { this._sig = sig; this.q('.rl-chips').innerHTML = sig; }
    this.q('.rl-read').innerHTML = h === null ? `<b>—</b> / ${len - 1} · ${secs(len - 1)} s` : `t <b>${String(h).padStart(len > 999 ? 4 : 3, '0')}</b> / ${len - 1} · <b>${secs(h)}</b> s`;
    this.q('.rl-pill').style.background = hue;
    const tight = window.innerHeight < 520 || window.innerWidth < 560; // short or narrow: icons only, one row
    this.root.classList.toggle('tight', tight);
    const pl = I.isPreview() ? 'PLAY HERE' : pb?.active && pb.playing ? 'PAUSE' : 'PLAY', gl = pb?.active && pb.playing && !I.isPreview() ? '❚❚' : '▶';
    const fr = pb?.active && !pb.playing ? 'RELEASE' : I.isPreview() ? 'FREEZE HERE' : 'FREEZE';
    this.bPlay.firstElementChild.textContent = tight ? gl : `${gl} ${pl}`; this.bFreeze.firstElementChild.textContent = tight ? '❄' : `❄ ${fr}`;
    this.bPlay.title = pl; this.bFreeze.title = fr;
    this.layout(rec, pb);
    this.draw(rec, pb, h);
    this.describe(rec, pb, h);
  }

  describe(rec, pb, h) {
    const I = this.I; let t = '';
    if (h === null) t = `Drag the timeline, or press <kbd>,</kbd> <kbd>.</kbd> to step one tick at a time. <kbd>;</kbd> <kbd>'</kbd> jump between events.`;
    else {
      const hereAll = I.around(h, 3), more = hereAll.length > 3 ? ` <i style="color:var(--dim)">+${hereAll.length - 3} more</i>` : '';
      const here = hereAll.slice(0, 3).map((m) => `<span style="color:${(KIND[m.kind] ?? KIND.state)[0]}">${(KIND[m.kind] ?? KIND.state)[1]} ${m.label}</span>`);
      const nx = I.next(h);
      t = (here.length ? `<b>Now:</b> ${here.join(' · ')}${more}` : '<b>Now:</b> nothing changes here')
        + (nx ? ` &nbsp;·&nbsp; <b>next:</b> ${nx.label} in ${((nx.t - h) / 60).toFixed(2)} s` : ' &nbsp;·&nbsp; <b>no further events</b>');
      if (I.isPreview()) t += ' &nbsp;·&nbsp; <kbd>T</kbd> play from here · <kbd>F</kbd> freeze here — the ghost shows where everything will be';
    }
    if (t !== this._say) { this._say = t; this.say.innerHTML = t; }
  }

  layout(rec, pb) {
    // choose the lanes: the objects with the most going on
    if (this._laneRec !== rec) {
      this._laneRec = rec; this.cache = null;
      const ms = rec.markers, count = (id) => ms.reduce((n, m) => n + (m.id === id ? 1 : 0), 0);
      this.allLanes = [...rec.tracks.values()].map((tr) => ({ id: tr.id, tr, n: count(tr.id), k: tr.keyframes })).sort((a, b) => b.n - a.n || b.k - a.k);
    }
    this.lanes = this.allLanes.slice(0, window.innerHeight < 620 ? 3 : window.innerHeight < 800 ? 4 : 6); // fewer lanes on short screens: the view matters more than the table
    const W = Math.min(760, Math.max(280, window.innerWidth - 24)), H = RULER_H + EVT_H + Math.max(1, this.lanes.length) * LANE_H + 4;
    if (W !== this.W || H !== this.H || !this.sized) {
      this.W = W; this.H = H; this.sized = true; this.cache = null;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = W * dpr; this.cv.height = H * dpr; this.cv.style.height = `${H}px`; this.cv.style.maxWidth = `${W}px`; this.dpr = dpr;
    }
  }

  /** The static layers (lanes, presence, keyframes, markers) are drawn once per recording/mute-state/size and blitted. */
  layer(rec, pb) {
    const mutedSig = pb ? [...pb.muted].sort().join(',') : '';
    const key = `${rec.uid ?? 0}|${rec.name}|${this.W}|${this.H}|${mutedSig}`;
    if (this.cache?.key === key) return this.cache.cv;
    const dpr = this.dpr, c = document.createElement('canvas'); c.width = this.W * dpr; c.height = this.H * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const W = this.W, x = (t) => PAD_L + (t / Math.max(1, rec.length - 1)) * (W - PAD_L - PAD_R);
    g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle';
    // ruler: seconds
    g.fillStyle = 'rgba(255,255,255,.5)'; g.strokeStyle = 'rgba(255,255,255,.18)';
    for (let t = 0; t < rec.length; t += 60) { const X = x(t); g.beginPath(); g.moveTo(X, RULER_H - 4); g.lineTo(X, RULER_H); g.stroke(); if ((t / 60) % 2 === 0) g.fillText(`${t / 60}s`, X + 2, 6); }
    // lanes
    this.lanes.forEach((ln, i) => {
      const y0 = RULER_H + EVT_H + i * LANE_H, muted = pb?.muted.has(ln.id), tr = ln.tr, s = tr.stride;
      g.globalAlpha = muted ? 0.28 : 1;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)'; g.fillRect(PAD_L, y0, W - PAD_L - PAD_R, LANE_H - 1);
      // presence: when this object was inside the recorded volume
      let start = null;
      for (let k = 0; k <= tr.ticks.length; k++) {
        const inside = k < tr.ticks.length && tr.vals[k * s] === 1;
        if (inside && start === null) start = tr.ticks[k];
        if (!inside && start !== null) { const end = k < tr.ticks.length ? tr.ticks[k] : rec.length; g.fillStyle = 'rgba(232,200,138,.20)'; g.fillRect(x(start), y0 + 3, Math.max(1, x(end) - x(start)), LANE_H - 7); start = null; }
      }
      // keyframes: every moment this object's state changed
      g.fillStyle = 'rgba(255,255,255,.35)';
      const step = Math.max(1, Math.floor(tr.ticks.length / 500));
      for (let k = 0; k < tr.ticks.length; k += step) g.fillRect(Math.round(x(tr.ticks[k])), y0 + 5, 1, LANE_H - 11);
      g.globalAlpha = 1;
      g.fillStyle = muted ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.78)';
      const label = ln.id.replace(/^[a-z]+_/, '');
      g.fillText((muted ? '⊘ ' : '') + (label.length > 9 ? label.slice(0, 8) + '…' : label), 4, y0 + LANE_H / 2);
    });
    // event row + per-lane markers. Importance is visible (size and brightness follow the marker's weight), and events closer
    // than a few pixels are merged into one glyph with a count, so a busy recording never turns the row into noise.
    const evY = RULER_H + EVT_H / 2, groups = [];
    for (const m of rec.markers) {
      const X = x(m.t), last = groups[groups.length - 1];
      if (last && X - last.x < 6) { last.items.push(m); if (m.w > last.top.w) last.top = m; } else groups.push({ x: X, items: [m], top: m });
    }
    for (const gp of groups) {
      const m = gp.top, [col, glyph] = KIND[m.kind] ?? KIND.state, muted = gp.items.every((k) => pb?.muted.has(k.id));
      const primary = m.w >= 0.8;
      g.globalAlpha = muted ? 0.22 : primary ? 1 : m.w >= 0.5 ? 0.8 : 0.5;
      g.fillStyle = col; g.font = `${primary ? 13 : m.w >= 0.5 ? 11 : 9}px ui-monospace, Menlo, Consolas, monospace`; g.textAlign = 'center';
      g.fillText(glyph, gp.x, evY);
      if (gp.items.length > 1) { g.font = '8px ui-monospace, Menlo, Consolas, monospace'; g.fillStyle = '#fff'; g.globalAlpha = muted ? 0.22 : 0.9; g.fillText(String(gp.items.length), gp.x + 6, evY - 4); }
      for (const k of gp.items) { const li = this.lanes.findIndex((l) => l.id === k.id); if (li >= 0) { g.globalAlpha = (pb?.muted.has(k.id) ? 0.2 : k.w >= 0.5 ? 0.95 : 0.45); g.fillStyle = (KIND[k.kind] ?? KIND.state)[0]; g.fillRect(x(k.t) - 0.5, RULER_H + EVT_H + li * LANE_H + 2, k.w >= 0.8 ? 2 : 1, LANE_H - 4); } }
      g.globalAlpha = 1; g.textAlign = 'left';
    }
    g.font = '10px ui-monospace, Menlo, Consolas, monospace';
    if (this.allLanes.length > this.lanes.length) { g.fillStyle = 'rgba(255,255,255,.4)'; g.fillText(`+${this.allLanes.length - this.lanes.length} more`, 4, 6); }
    this.cache = { key, cv: c };
    return c;
  }

  draw(rec, pb, h) {
    const g = this.cv.getContext('2d'), dpr = this.dpr, W = this.W, H = this.H;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.drawImage(this.layer(rec, pb), 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x = (t) => PAD_L + (t / Math.max(1, rec.length - 1)) * (W - PAD_L - PAD_R), hue = this.root.style.getPropertyValue('--hue') || '#ffa94d';
    if (h !== null) {
      const X = x(h), prev = this.I.isPreview();
      if (pb?.active) { g.fillStyle = hue; g.globalAlpha = 0.12; g.fillRect(PAD_L, RULER_H, X - PAD_L, H - RULER_H); g.globalAlpha = 1; }
      const col = prev ? '#f2d58a' : (pb && !pb.playing ? '#d8eeff' : '#ffffff');
      g.strokeStyle = col; g.lineWidth = prev ? 1.5 : 2; if (prev) g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(X, RULER_H - 3); g.lineTo(X, H - 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = col; g.beginPath(); g.moveTo(X - 5, RULER_H - 4); g.lineTo(X + 5, RULER_H - 4); g.lineTo(X, RULER_H + 3); g.closePath(); g.fill();
    }
    // hover: the exact tick under the pointer, and the event under it
    if (this.hover && this.hover.x >= PAD_L) {
      const t = this.tickAt(this.hover.x), X = x(t);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X, RULER_H); g.lineTo(X, H); g.stroke();
      const nearAll = rec.markers.filter((m) => Math.abs(x(m.t) - X) < 7), near = nearAll.sort((a, b) => b.w - a.w)[0];
      const txt = near ? `${near.label} · t ${near.t}${nearAll.length > 1 ? ` (+${nearAll.length - 1} more)` : ''}` : `t ${t} · ${secs(t)} s`;
      g.font = '10px ui-monospace, Menlo, Consolas, monospace'; const tw = g.measureText(txt).width + 10, tx = Math.min(W - tw - 2, Math.max(2, X - tw / 2));
      g.fillStyle = 'rgba(0,0,0,.82)'; g.fillRect(tx, H - 15, tw, 13); g.fillStyle = near ? (KIND[near.kind] ?? KIND.state)[0] : '#ddd'; g.textBaseline = 'middle'; g.fillText(txt, tx + 5, H - 8.5);
    }
  }

  drawRecording(recorder) {
    this.root.classList.add('recording');
    const w = this.g.world, rec = recorder.rec, tau = recorder.tau, max = recorder.maxTicks;
    this.q('.rl-name').textContent = `RECORDING — ${rec.tracks.size} object${rec.tracks.size === 1 ? '' : 's'} in the volume`;
    this.q('.rl-chips').innerHTML = '<i class="c rec">● REC</i>';
    this.q('.rl-read').innerHTML = `<b>${secs(tau)}</b> / ${secs(max)} s · ${rec.keyframes} keyframes`;
    this.layoutRec();
    const g = this.cv.getContext('2d'), dpr = this.dpr, W = this.W, H = this.H;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const x = (t) => PAD_L + (t / max) * (W - PAD_L - PAD_R);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(PAD_L, RULER_H, W - PAD_L - PAD_R, H - RULER_H - 3);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '10px ui-monospace, Menlo, Consolas, monospace'; g.textBaseline = 'middle';
    for (let t = 0; t < max; t += 60) { g.fillRect(x(t), RULER_H - 4, 1, 4); if ((t / 60) % 2 === 0) g.fillText(`${t / 60}s`, x(t) + 2, 6); }
    // live activity: state changes per tick, as they are captured
    const e = recorder.energy; g.fillStyle = 'rgba(255,106,74,.85)';
    for (let k = 0; k < e.length; k++) { const hh = Math.min(1, e[k] / 6) * (H - RULER_H - 8); g.fillRect(x(k), H - 4 - hh, 1.5, hh); }
    g.fillStyle = '#ff6a4a'; g.fillRect(x(tau), RULER_H - 3, 2, H - RULER_H);
    // the cap: the recording ends where the bar ends
    g.fillStyle = 'rgba(255,106,74,.18)'; g.fillRect(x(tau), RULER_H, W - PAD_R - x(tau), H - RULER_H - 3);
    this.say.innerHTML = `Everything inside the frame is being remembered. <kbd>R</kbd> stops · <b>${secs(max - tau)} s</b> left`;
    this._say = null;
  }
  layoutRec() { const H = RULER_H + EVT_H + 2 * LANE_H + 4; if (H !== this.H || !this.sized) { this.H = H; this.sized = true; this.cache = null; const dpr = Math.min(2, window.devicePixelRatio || 1); this.W = Math.min(760, Math.max(280, window.innerWidth - 24)); this.cv.width = this.W * dpr; this.cv.height = H * dpr; this.cv.style.height = `${H}px`; this.cv.style.maxWidth = `${this.W}px`; this.dpr = dpr; } }
}
