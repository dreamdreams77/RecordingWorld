// src/scrub.js
// Position of the debug timeline cursor, in frames. Kept pure so the clamping can be tested.

export const SCRUB_SMALL = 10;
export const SCRUB_LARGE = 60;

// Moves the position by delta frames, kept between 0 and the longest recording.
export function scrubTo(current, delta, longest) {
  return Math.max(0, Math.min(Math.max(0, longest), current + delta));
}
