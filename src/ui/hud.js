// The Recollector instrument: reticle with rangefinder, folio, recording banner, the cassette deck of
// oscilloscope timelines, the state-comparison inspector, feed/subtitles and the developer overlay.
// Everything displayed is read from the live simulation — nothing here is decorative data.

import { forTouch } from './keys.js';
import { PLAYBACK_MODES } from '../sim/recording.js';

const HUES = ['#ffa94d', '#62e0b4', '#ff6459', '#b7a0ff', '#d5f25c', '#ffc2d4'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const secs = (t) => (t / 60).toFixed(1).padStart(4, '0');
const f = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

export class HUD {
  constructor(root) {
    this.root = root;
    this.layer = el('div', 'layer hudlayer'); root.appendChild(this.layer);
    this.layer.innerHTML = `
      <div id="vignette"></div>
      <svg id="reticle" viewBox="-32 -32 64 64" fill="none" stroke="#e8c88a" stroke-width="1">
        <circle r="17" stroke-opacity=".55" stroke-dasharray="30 8 2 8 30 8 2 8" id="ret-ring"/><circle r="2" fill="#e8c88a" stroke="none"/>
        <path d="M0-30V-20M0 30V20M-30 0H-20M30 0H20" stroke-opacity=".9"/><path d="M-10-24h20M-10 24h20" stroke-opacity=".35"/>
        <path d="M-24-10v20M24-10v20" stroke-opacity=".35"/><path id="ret-arc" d="" stroke="#ffb04d" stroke-width="2.2"/>
      </svg>
      <div id="range" class="tiny"></div><div id="aimlabel" class="tiny"></div><div id="aimwhy" class="tiny"></div>
      <div id="folio" class="panel"><div class="num"></div><div class="tiny" id="f-kicker"></div><div class="ttl"></div><div class="obj"></div><div class="hint"></div></div>
      <div id="recbar" class="panel"><span class="dot"></span><span id="rec-t">REC</span><div class="tiny" id="rec-v"></div><div class="cap"><i></i></div></div>
      <div id="ticker" class="panel tiny"></div>
      <div id="inspect" class="panel"></div>
      <div id="subtitle" class="panel serif"></div>
      <div id="feed" class="layer" style="position:absolute;inset:auto auto 14px 18px"></div>
      <div id="legend" class="panel"></div>
      <div id="deck" class="panel"></div>
      <div id="dev" class="panel"></div>`;
    this.q = (s) => this.layer.querySelector(s);
    this.deck = this.q('#deck'); this.slots = [];
    this.feed = this.q('#feed'); this.subtitle = this.q('#subtitle'); this.subT = 0;
    this.flashEl = el('div'); this.flashEl.id = 'flash'; root.appendChild(this.flashEl);
    for (const c of ['top', 'bot']) root.appendChild(el('div', `cinebar ${c}`));
    this.liveEnergy = [];
  }

  buildDeck(n) {
    this.deck.innerHTML = ''; this.slots = [];
    for (let i = 0; i < n; i++) {
      const s = el('div', 'slot empty'); s.style.setProperty('--hue', HUES[i % 6]);
      s.innerHTML = `<div class="hd"><span class="n">${i + 1}</span><span class="nm">— empty —</span></div><canvas width="360" height="76"></canvas><div class="st"><span class="state">■ idle</span><span class="mode"></span><span class="time"></span></div><div class="coh"><i style="width:100%"></i></div>`;
      this.deck.appendChild(s);
      this.slots.push({ root: s, cv: s.querySelector('canvas'), nm: s.querySelector('.nm'), state: s.querySelector('.state'), mode: s.querySelector('.mode'), time: s.querySelector('.time'), coh: s.querySelector('.coh i') });
    }
    this.nSlots = n;
  }

  setFolio(level, section) {
    const f_ = this.q('#folio');
    f_.querySelector('.num').textContent = ROMAN[level.index] ?? '';
    this.q('#f-kicker').textContent = level.title;
    f_.querySelector('.ttl').textContent = section?.name ?? '';
    f_.querySelector('.obj').textContent = section?.objective ?? '';
    this.hint = section?.hint ?? '';
    f_.querySelector('.hint').textContent = '';
  }
  showHint(on) { this.q('#folio .hint').textContent = on ? forTouch(this.hint) : ''; }

  toast(text, kind = '', title = '', ms = 6000) {
    text = forTouch(text);
    const t = el('div', `toast ${kind}`, (title ? `<b>${title}</b>` : '') + text);
    this.feed.appendChild(t);
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
    setTimeout(() => t.remove(), ms);
  }
  say(text, who = 'THE ARCHIVIST', ms = 6500) {
    text = forTouch(text);
    this.subtitle.innerHTML = `<span class="who">${who}</span>${text}`;
    this.subtitle.style.opacity = 1;
    clearTimeout(this.subT);
    this.subT = setTimeout(() => { this.subtitle.style.opacity = 0; }, ms);
  }
  flash(a = 0.25) { this.flashEl.style.transition = 'none'; this.flashEl.style.opacity = a; requestAnimationFrame(() => { this.flashEl.style.transition = 'opacity .6s'; this.flashEl.style.opacity = 0; }); }
  cinema(on) { document.body.classList.toggle('cinema', on); }

  /** One call per rendered frame. `m` is the model assembled by the Game. */
  update(m) {
    const { world, ui } = m;
    // reticle + rangefinder
    this.q('#range').textContent = m.aimDist !== null ? `${m.aimDist.toFixed(2)} m` : '';
    this.q('#aimlabel').textContent = m.aimLabel ?? '';
    this.q('#aimwhy').textContent = m.aimWhy ?? '';
    this.q('#ret-ring').style.transform = `rotate(${(m.time * 20) % 360}deg)`;
    // ticker
    const rec = world.recorder;
    this.q('#ticker').innerHTML = `TICK <b>${String(world.tick).padStart(6, '0')}</b> · 60 Hz<br>${secs(world.tick)} s · ${world.stats.solids} solids · ${world.conflicts.length ? `<span style="color:var(--warn)">${world.conflicts.length} conflict${world.conflicts.length > 1 ? 's' : ''}</span>` : 'reconciled'}`;
    // recording banner
    const rb = this.q('#recbar');
    if (rec) {
      rb.style.display = 'block';
      this.q('#rec-t').textContent = ` REC ${ui.selected + 1} — ${secs(rec.tau)} / ${secs(rec.maxTicks)} s`;
      const v = rec.rec.volume;
      this.q('#rec-v').textContent = `VOLUME ${(v.x1 - v.x0).toFixed(1)} × ${(v.y1 - v.y0).toFixed(1)} × ${(v.z1 - v.z0).toFixed(1)} m · ${rec.rec.tracks.size} entities`;
      rb.querySelector('.cap i').style.width = `${(rec.tau / rec.maxTicks) * 100}%`;
    } else rb.style.display = 'none';
    // deck
    if (this.nSlots !== world.caps.slots) this.buildDeck(world.caps.slots);
    world.recordings.forEach((r, i) => this.updateSlot(i, r, world.playbacks[i], world, ui, m.time));
    // legend
    this.q('#legend').innerHTML = m.legend;
    // inspector
    this.updateInspector(m);
    if (m.dev) this.updateDev(m); else this.q('#dev').style.display = 'none';
  }

  updateSlot(i, rec, pb, world, ui, time) {
    const S = this.slots[i]; if (!S) return;
    const recording = world.recorder && world.recorder.slot === i;
    S.root.classList.toggle('sel', ui.selected === i);
    S.root.classList.toggle('empty', !rec && !recording);
    S.nm.textContent = recording ? 'recording…' : rec ? rec.name : '— empty —';
    const cv = S.cv, g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const hue = HUES[i % 6];
    // graticule
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += W / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    if (recording) {
      const e = world.recorder.energy, n = world.recorder.maxTicks;
      g.strokeStyle = '#ff6a4a'; g.lineWidth = 2; g.beginPath();
      for (let k = 0; k < e.length; k++) { const x = (k / n) * W, y = H / 2 - Math.min(1, e[k] / 6) * (H / 2 - 4) * (k % 2 ? 1 : -1); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.fillStyle = '#ff6a4a'; g.fillRect((e.length / n) * W, 0, 2, H);
      S.state.textContent = '● rec'; S.state.className = 'state on'; S.mode.textContent = ''; S.time.textContent = `${secs(world.recorder.tau)}s`;
      S.coh.style.width = '100%';
      return;
    }
    if (!rec || !pb) { S.state.textContent = '■ idle'; S.state.className = 'state'; S.mode.textContent = ''; S.time.textContent = ''; S.coh.style.width = '100%'; return; }
    // activity trace (real keyframe density), mirrored like an oscilloscope
    const a = rec.activity;
    g.strokeStyle = hue; g.globalAlpha = pb.active ? 1 : 0.55; g.lineWidth = 1.5; g.beginPath();
    for (let k = 0; k < a.length; k++) { const x = (k / (a.length - 1)) * W, y = H / 2 - a[k] * (H / 2 - 5) * (k % 2 ? 1 : -1); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.globalAlpha = 1;
    // playhead
    const px = (pb.head / Math.max(1, rec.length - 1)) * W;
    if (pb.active) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(px - 1, 0, 2, H); g.fillStyle = hue; g.globalAlpha = 0.14; g.fillRect(0, 0, px, H); g.globalAlpha = 1; }
    S.state.textContent = pb.active ? (pb.playing ? (pb.rate < 0 ? '◀ play' : '▶ play') : '❚❚ held') : (rec.source === 'archive' ? '▤ tape' : '■ ready');
    S.state.className = 'state' + (pb.active ? ' on' : '');
    S.mode.textContent = `${pb.mode}${Math.abs(pb.rate) !== 1 ? ` ×${Math.abs(pb.rate)}` : ''}`;
    S.time.textContent = `${secs(pb.head)}/${secs(rec.length)}`;
    S.coh.style.width = `${(pb.active ? pb.coherence : 1) * 100}%`;
    S.coh.style.background = pb.coherence < 0.4 ? '#ff4df0' : hue;
  }

  updateInspector(m) {
    const box = this.q('#inspect'), c = m.aimCompare;
    if (!c) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    const slots = new Set(); c.channels.forEach((ch) => ch.echoes.forEach((e) => slots.add(e.slot)));
    const cols = [...slots].sort();
    let html = `<div class="tiny">${m.lensFull ? 'STATE COMPARISON' : 'INSPECT'}</div><h4>${c.type} <span class="tiny">#${c.id}</span></h4>`;
    const rows = c.channels.filter((ch) => m.lensFull || ['s', 'on', 'pressed', 'omega', 'lit', 'charge', 'out', 'rot', 'x', 'y', 'z', 'rot'].includes(ch.name));
    html += `<table><tr><th></th><th>now</th>${cols.map((s) => `<th style="color:${HUES[s % 6]}">rec ${s + 1}</th>`).join('')}</tr>`;
    for (const ch of rows.slice(0, m.lensFull ? 12 : 4)) {
      const differs = ch.echoes.some((e) => ch.present !== null && Math.abs(e.value - ch.present) > 0.05);
      html += `<tr><td>${ch.name}</td><td>${f(ch.present)}</td>${cols.map((s) => { const e = ch.echoes.find((x) => x.slot === s); return `<td class="${differs && e ? 'diff' : ''}">${e ? f(e.value) : '·'}</td>`; }).join('')}</tr>`;
    }
    html += `</table>`;
    if (c.reconciled !== null) html += `<div class="tiny" style="margin-top:6px">reconciled signal <b style="color:var(--text)">${f(c.reconciled)}</b></div>`;
    if (cols.length || c.rule) html += `<div class="rule">${c.rule}</div>`;
    box.innerHTML = html;
  }

  updateDev(m) {
    const w = m.world, d = this.q('#dev'); d.style.display = 'block';
    const lines = [];
    lines.push(`DEVELOPER  ·  ${m.level.id}  ·  section ${m.sectionIndex}`);
    lines.push(`tick ${w.tick}  hash ${w.hash()}  step ${w.stats.stepMs.toFixed(2)} ms`);
    lines.push(`items ${w.items.length}  alive ${w.aliveList.length}  solids ${w.solids.length}  beams ${w.beams.length}  sounds ${w.sources.length}`);
    lines.push(`conflicts ${w.conflicts.length}: ${w.conflicts.slice(0, 4).map((c) => c.kind + ':' + c.id).join(' ')}`);
    lines.push(`aperture-open ${[...w.openIds].join(',') || '-'}  overruled ${[...w.overruled].join(',') || '-'}`);
    lines.push(`render ${m.perf.fps.toFixed(0)} fps  ${m.perf.frameMs.toFixed(1)} ms  calls ${m.perf.calls}  tris ${(m.perf.tris / 1000).toFixed(0)}k`);
    w.recordings.forEach((r, i) => {
      if (!r) return;
      const pb = w.playbacks[i];
      lines.push(`#${i + 1} ${r.name.slice(0, 18).padEnd(18)} len ${r.length}t trk ${r.tracks.size} kf ${r.keyframes} ${(r.bytes / 1024).toFixed(1)}K (raw ${(r.rawBytes / 1024).toFixed(0)}K, ×${(r.rawBytes / Math.max(1, r.bytes)).toFixed(0)})`);
      if (pb) lines.push(`    head ${pb.head.toFixed(1)} rate ${pb.rate} ${pb.mode} ${pb.active ? 'ACTIVE' : 'off'} coh ${pb.coherence.toFixed(2)} vol ${['x', 'y', 'z'].map((a) => (r.volume[a + '1'] - r.volume[a + '0']).toFixed(1)).join('×')}`);
    });
    if (m.aimCompare) lines.push(`aim ${m.aimCompare.id}: ${m.aimCompare.channels.map((c) => `${c.name}=${f(c.present)}`).join(' ')}`);
    lines.push(`P ${[...w.player.st].slice(0, 3).map((v) => v.toFixed(2)).join(', ')}  v ${[...w.player.st].slice(3, 6).map((v) => v.toFixed(1)).join(', ')}`);
    d.textContent = lines.join('\n');
  }
}
