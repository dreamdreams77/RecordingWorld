// On touch devices there are no keys, so any instruction that names one is rewritten to name the matching
// on-screen button ("press T" → "tap PLAY"). Desktop text is returned untouched.

export const IS_TOUCH = () => typeof document !== 'undefined' && document.body.classList.contains('touch');

const BUTTON = {
  Q: 'FRAME', R: 'REC', E: 'USE', T: 'PLAY', L: 'MODE ⋯', G: 'REV ⋯', Y: 'STOP ⋯', U: 'ALL ⋯', H: 'HINT ⋯', F: 'LINK',
  F6: '⟲', Space: 'JUMP', Tab: 'TAB ⋯', Backspace: 'ERASE ⋯', 'Shift+Backspace': 'UNDO ⋯', 'Shift+K': 'RESET ⋯',
};
const NOTE = { Z: 'C', X: 'D', C: 'E', V: 'F', B: 'G', N: 'A', M: 'B' };

export function forTouch(text) {
  if (!IS_TOUCH() || !text) return text;
  return String(text)
    .replace(/\bHold Z X C V B N M to sing notes C to B\b/g, 'Hold the ♪ keys to sing notes C to B')
    .replace(/\bHold ([ZXCVBNM])\b/g, (_, k) => `Hold ♪ ${NOTE[k]}`)
    .replace(/\(([ZXCVBNM])\)/g, '')
    .replace(/\b([Pp])ress (Shift\+Backspace|Shift\+K|Backspace|Space|Tab|F6|[QRETLGYUHF])\b/g, (_, p, k) => `${p === 'P' ? 'Tap' : 'tap'} ${BUTTON[k]}`)
    .replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap')
    .replace(/ \( \] \)/g, ' (×2 ⋯)')
    .replace(/\bmouse and keyboard\b/g, 'touch, mouse or keyboard')
    .replace(/\s{2,}/g, ' ');
}
