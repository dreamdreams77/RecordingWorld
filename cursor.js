// src/cursor.js
// Keyboard cursor movement, kept as pure arithmetic so the limits can be tested without a browser.

export const CURSOR_STEP = 8;

// Moves a cursor one step in the arrow key's direction, kept inside the room (w x h).
export function stepCursor(c, key, w, h, step = CURSOR_STEP) {
  const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
  return {
    x: Math.max(0, Math.min(w, c.x + dx * step)),
    y: Math.max(0, Math.min(h, c.y + dy * step)),
  };
}
