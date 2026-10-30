// src/save.js
// Save codes: saved progress as a short text string that can be copied between browsers.
// Pure functions with no DOM access, so they are tested in tests/save.test.js. A decoded code
// is checked for shape only; Game.importProgress checks the values themselves.

const VERSION = 1;

export function encodeSave(progress) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: VERSION, progress }));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Throws if the code is empty, is not base64, is not JSON, or is from another version.
export function decodeSave(code) {
  if (typeof code !== 'string' || code.trim() === '') throw new Error('empty save code');
  const bin = atob(code.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.v !== VERSION || !data.progress || typeof data.progress !== 'object') {
    throw new Error('not a save code');
  }
  return data.progress;
}
