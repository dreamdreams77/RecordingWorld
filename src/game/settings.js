// User settings and graphics quality presets. Persisted in localStorage (every access is guarded).

export const QUALITY = {
  low:    { label: 'Low',    pixelRatio: 1,   texSize: 256,  shadows: false, shadowMap: 1024, ao: false, bloomScale: 0.4, reflections: false, reflScale: 0.3, anisotropy: 2,  msaa: 0, particles: 90,   scenery: 0.45, lights: 3, far: 400 },
  medium: { label: 'Medium', pixelRatio: 1,   texSize: 512,  shadows: true,  shadowMap: 2048, ao: false, bloomScale: 0.5, reflections: true,  reflScale: 0.4, anisotropy: 4,  msaa: 2, particles: 350,  scenery: 0.75, lights: 5, far: 700 },
  high:   { label: 'High',   pixelRatio: 1.5, texSize: 512,  shadows: true,  shadowMap: 2048, ao: true,  bloomScale: 0.6, reflections: true,  reflScale: 0.6, anisotropy: 8,  msaa: 4, particles: 800,  scenery: 1,    lights: 7, far: 1000 },
  ultra:  { label: 'Ultra',  pixelRatio: 2,   texSize: 1024, shadows: true,  shadowMap: 4096, ao: true,  bloomScale: 0.8, reflections: true,  reflScale: 0.9, anisotropy: 16, msaa: 4, particles: 1600, scenery: 1,    lights: 8, far: 1400 },
};

export const DEFAULT_SETTINGS = {
  quality: 'high', fov: 75, sensitivity: 1, invertY: false,
  master: 0.8, sfx: 1, ambience: 0.8, music: 0.7, voice: 1,
  reducedMotion: false, headBob: true, highContrast: false, colorblind: 0, flashReduction: false,
  uiScale: 1, hudMode: 'minimal', adaptiveRes: true, subtitles: true, hints: true, holdToTalk: true, devMode: false, autosave: true,
};

const KEY = 'twiar.settings.v1';
const memory = {};
export function loadSettings() {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; } catch { /* storage unavailable */ }
  return { ...DEFAULT_SETTINGS, ...memory };
}
/** Phones get the light preset until the player chooses otherwise. */
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
if (coarse) DEFAULT_SETTINGS.quality = 'low';
export function saveSettings(s) {
  Object.assign(memory, s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
