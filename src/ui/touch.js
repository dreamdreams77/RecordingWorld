// On-screen controls for touch devices (no keyboard, no pointer lock). A thin layer that feeds the same Input
// object the keyboard does, so every action works identically: left thumb = move stick, right thumb = look
// (a quick tap there is a left click, i.e. pin / place), buttons carry the key actions.

const NOTES = [['KeyZ', 'C'], ['KeyX', 'D'], ['KeyC', 'E'], ['KeyV', 'F'], ['KeyB', 'G'], ['KeyN', 'A'], ['KeyM', 'B']];

export class TouchControls {
  constructor(game) {
    this.g = game; this.I = game.input; this.shown = false;
    const root = this.root = document.createElement('div');
    root.id = 'touch'; root.style.display = 'none';
    root.innerHTML = `
      <div class="tz tz-move"></div><div class="tz tz-look"></div>
      <div class="stick" hidden><i></i></div>
      <div class="tbar tl"></div><div class="tcluster"></div><div class="tdrawer" hidden></div><div class="tnotes" hidden></div>`;
    document.body.appendChild(root);
    this.q = (s) => root.querySelector(s);
    this.stick = this.q('.stick'); this.knob = this.stick.firstElementChild;
    this.zones();
    const key = (label, code, cls = '', hold = false) => this.button(label, () => ({ code, hold }), cls);
    // top-left: system
    const tl = this.q('.tl');
    tl.append(
      this.button('☰', () => ({ code: 'Escape' }), 'sm'),
      this.button('⟲', () => ({ code: 'F6' }), 'sm', 'rewind'),
      this.button('①', () => this.cycleSlot(), 'sm slotsel', 'slot'),
    );
    this.slotBtn = tl.querySelector('.slotsel');
    // right cluster: the actions you use every few seconds
    const cl = this.q('.tcluster');
    cl.append(
      this.button('USE', () => ({ code: 'KeyE' }), 'a', 'E'),
      this.button('REC', () => ({ code: 'KeyR' }), 'a rec', 'R'),
      this.button('FRAME', () => ({ code: 'KeyQ' }), 'a', 'Q'),
      this.button('PLAY', () => ({ code: 'KeyT' }), 'a', 'T'),
      this.button('JUMP', () => ({ code: 'Space' }), 'a big', ''),
    );
    tl.append(this.button('⋯', () => this.toggle('.tdrawer'), 'sm', 'more'), this.button('♪', () => this.toggle('.tnotes'), 'sm', 'notes'));
    // drawer: the less frequent ones
    const dr = this.q('.tdrawer');
    dr.append(
      this.button('STOP', () => ({ code: 'KeyY' }), 'a', 'Y'), this.button('MODE', () => ({ code: 'KeyL' }), 'a', 'L'),
      this.button('REV', () => ({ code: 'KeyG' }), 'a', 'G'), this.button('◂', () => ({ code: 'Comma' }), 'a sm', ','),
      this.button('▸', () => ({ code: 'Period' }), 'a sm', '.'),
      this.button('−', () => { this.I.wheel += 1; }, 'a sm', 'size'), this.button('+', () => { this.I.wheel -= 1; }, 'a sm', 'size'),
      this.button('✕', () => { this.I.clicks.push(2); }, 'a sm', 'unpin'),
      this.button('TAB', () => ({ code: 'Tab' }), 'a sm', 'lens'),
      this.button('OMIT', () => ({ code: 'KeyO' }), 'a', 'O'), this.button('SOLO', () => ({ code: 'KeyO', shift: true }), 'a', ''),
      this.button('ALL', () => ({ code: 'KeyU' }), 'a', 'U'), this.button('HINT', () => ({ code: 'KeyH' }), 'a', 'H'),
      this.button('×½', () => ({ code: 'BracketLeft' }), 'a sm', '['), this.button('×2', () => ({ code: 'BracketRight' }), 'a sm', ']'),
      this.button('ERASE', () => ({ code: 'Backspace' }), 'a', ''), this.button('UNDO', () => ({ code: 'Backspace', shift: true }), 'a', ''),
      this.button('RESET', () => ({ code: 'KeyK', shift: true }), 'a', ''),
    );
    const nt = this.q('.tnotes');
    for (const [code, name] of NOTES) nt.append(this.button(name, () => ({ code, hold: true }), 'a note', ''));
    this.fullscreenTried = false;
  }

  toggle(sel) { const el = this.q(sel); el.hidden = !el.hidden; }
  cycleSlot() {
    const g = this.g, n = g.world?.caps.slots ?? 2, next = ((g.selected + 1) % n) + 1;
    return { code: `Digit${next}` };
  }

  /** A button whose handler returns {code, hold} (a key to press) or nothing (it acted directly). */
  button(label, fn, cls = '', sub = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `tb ${cls}`; b.innerHTML = `<span>${label}</span>${sub && sub.length <= 2 ? `<small>${sub}</small>` : ''}`;
    let code = null, shift = false;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); b.classList.add('on');
      this.enterFullscreen();
      const r = fn();
      if (r?.code) { code = r.code; shift = !!r.shift; if (shift) this.I.down.add('ShiftLeft'); this.I.pressed.add(code); this.I.down.add(code); }
    });
    const up = () => { b.classList.remove('on'); if (code) { this.I.down.delete(code); if (shift) this.I.down.delete('ShiftLeft'); this.I.released.add(code); code = null; } };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  zones() {
    const I = this.I, R = 58; // stick radius, px
    const move = this.q('.tz-move'), look = this.q('.tz-look');
    let m = null, l = null;
    const setKeys = (dx, dy) => {
      const on = (code, v) => (v ? I.down.add(code) : I.down.delete(code));
      on('KeyW', dy < -R * 0.28); on('KeyS', dy > R * 0.28); on('KeyA', dx < -R * 0.28); on('KeyD', dx > R * 0.28);
    };
    move.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.enterFullscreen(); move.setPointerCapture(e.pointerId);
      m = { id: e.pointerId, x: e.clientX, y: e.clientY };
      Object.assign(this.stick.style, { left: `${e.clientX - R}px`, top: `${e.clientY - R}px` }); this.stick.hidden = false; this.knob.style.transform = '';
    });
    move.addEventListener('pointermove', (e) => {
      if (!m || e.pointerId !== m.id) return;
      let dx = e.clientX - m.x, dy = e.clientY - m.y; const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(${dx}px,${dy}px)`; setKeys(dx, dy);
    });
    const endMove = (e) => { if (m && e.pointerId === m.id) { m = null; this.stick.hidden = true; setKeys(0, 0); } };
    move.addEventListener('pointerup', endMove); move.addEventListener('pointercancel', endMove);
    look.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.enterFullscreen(); look.setPointerCapture(e.pointerId);
      l = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 };
    });
    look.addEventListener('pointermove', (e) => {
      if (!l || e.pointerId !== l.id) return;
      const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
      I.dx += dx * 1.5; I.dy += dy * 1.5;
    });
    const endLook = (e) => {
      if (!l || e.pointerId !== l.id) return;
      if (l.moved < 12 && e.timeStamp - l.t < 350) I.clicks.push(0); // a tap is a click: pin the frame / place
      l = null;
    };
    look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', () => { l = null; });
  }

  /** Immersive landscape play where the browser allows it (needs a user gesture; failure is harmless). */
  enterFullscreen() {
    if (this.fullscreenTried) return; this.fullscreenTried = true;
    try {
      const el = document.documentElement;
      Promise.resolve(el.requestFullscreen?.()).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    } catch { /* unsupported */ }
  }

  /** Called every frame by the Game. */
  update() {
    const on = this.g.state === 'play' || this.g.state === 'cinematic';
    if (on !== this.shown) { this.shown = on; this.root.style.display = on ? '' : 'none'; if (!on) { for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) this.I.down.delete(k); } }
    if (on && this.g.world) this.slotBtn.firstElementChild.textContent = ['①', '②', '③', '④', '⑤', '⑥'][this.g.selected] ?? this.g.selected + 1;
  }
}
