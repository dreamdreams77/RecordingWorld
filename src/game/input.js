// Keyboard / mouse input with pointer lock. Exposes held keys, per-frame edge presses and mouse deltas.

export class Input {
  constructor(canvas, onLockChange) {
    this.canvas = canvas;
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0; this.buttons = new Set(); this.clicks = [];
    this.locked = false; this.enabled = true;
    // phones and tablets: no pointer lock exists, so "locked" simply means "playing"; on-screen controls feed this object
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) { if (['Tab', 'F3', 'F4'].includes(e.code)) e.preventDefault(); return; }
      this.down.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab', 'F3', 'F4', 'F2', 'Backspace', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => this.down.clear());
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('mousedown', (e) => { if (this.locked) { this.buttons.add(e.button); this.clicks.push(e.button); } });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('wheel', (e) => { if (this.locked) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; onLockChange?.(this.locked); });
  }
  lock() { if (this.touch) { this.locked = true; return; } try { const r = this.canvas.requestPointerLock?.(); if (r?.catch) r.catch(() => {}); } catch { /* unsupported (headless) */ } }
  unlock() { if (this.touch) { this.locked = false; return; } try { document.exitPointerLock?.(); } catch { /* ignore */ } }
  held(...codes) { return codes.some((c) => this.down.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.released.clear(); this.dx = this.dy = 0; this.wheel = 0; this.clicks.length = 0; }
}
