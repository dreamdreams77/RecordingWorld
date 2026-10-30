// Campaign progress and save games. Progress (what you have found and finished) is separate from the
// mid-level snapshot (an exact serialisation of the deterministic world). All storage is guarded.

const PROG = 'twiar.progress.v1', SNAP = 'twiar.snapshot.v1';
const mem = {};
function read(k) { try { const r = localStorage.getItem(k); if (r) return JSON.parse(r); } catch { /* ignore */ } return mem[k] ?? null; }
function write(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

export const EMPTY_PROGRESS = () => ({ v: 1, unlocked: 1, levels: {}, ending: null, sandbox: false, stats: { recordings: 0, ticks: 0, deaths: 0 }, seen: {} });

export function loadProgress() { const p = read(PROG); return p ? { ...EMPTY_PROGRESS(), ...p } : EMPTY_PROGRESS(); }
export function saveProgress(p) { return write(PROG, p); }
export function resetAll() { try { localStorage.removeItem(PROG); localStorage.removeItem(SNAP); } catch { /* ignore */ } delete mem[PROG]; delete mem[SNAP]; }

export function levelRecord(p, id) { return (p.levels[id] ??= { done: false, bestTicks: null, discoveries: [], experiments: [] }); }

export function saveSnapshot(levelId, world, director) {
  return write(SNAP, {
    v: 1, levelId, savedAt: Date.now(), tick: world.tick,
    world: world.snapshot(), section: director.sectionIndex,
    found: [...director.found], done: [...director.done],
    player: { pos: [...world.player.st.slice(0, 3)], yaw: world.player.st[6] },
  });
}
export function loadSnapshot() { return read(SNAP); }
export function hasSnapshot() { return !!read(SNAP); }
