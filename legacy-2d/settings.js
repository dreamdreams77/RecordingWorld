// src/settings.js
// The settings the game starts with: the player's saved choices, with defaults for anything not
// saved. Kept free of browser code so the rules can be tested.

export const DEFAULT_SETTINGS = {
  reducedMotion: false, colourBlind: false, largeText: false, hintsOn: false, muted: false, trails: true,
  reduceFlashing: false,
};

// Screens narrower than this are phones held upright, where the HUD text is hard to read at its
// normal size.
export const NARROW_SCREEN = 600;

export function startingSettings(saved, width) {
  const s = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (saved && typeof saved[key] === 'boolean') s[key] = saved[key];
  }
  // Large text starts on for a narrow screen, unless the player has already chosen either way.
  const chosen = !!saved && typeof saved.largeText === 'boolean';
  if (!chosen && width < NARROW_SCREEN) s.largeText = true;
  return s;
}
