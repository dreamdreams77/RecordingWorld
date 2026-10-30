// Archive tapes are not animations. Each tape is produced by simulating an ALTERNATE HISTORY of the
// level (entities may carry `era:'past'` or a `past:{...}` override) with the same World class and
// recording a volume of it. The result is an ordinary Recording, so tapes obey every reconciliation rule.

import { World, IDLE } from './world.js';

const cache = new Map();

/**
 * @param level  level definition
 * @param arch   { id, name, volume:{x0..z1}, ticks, set?:{id:{channel:value}}, script?:[{t,id,set:{channel:value}}] }
 */
export function generateArchive(level, arch) {
  const key = `${level.id}:${arch.id}`;
  if (cache.has(key)) return cache.get(key);
  const w = new World(level, { era: 'past', noPlayer: true, caps: { maxTicks: arch.ticks + 4, slots: 1 } });
  const setState = (id, ch, v) => {
    const L = w.byId.get(id);
    if (!L) throw new Error(`archive ${arch.id}: unknown entity ${id}`);
    const i = L.type.I[ch];
    if (i === undefined) throw new Error(`archive ${arch.id}: ${id} has no channel ${ch}`);
    L.st[i] = v;
  };
  for (const [id, chans] of Object.entries(arch.set ?? {})) for (const [ch, v] of Object.entries(chans)) setState(id, ch, v);
  w.refreshDerived();
  for (let i = 0; i < 3; i++) w.step(IDLE); // let the past settle before the tape starts rolling
  const script = [...(arch.script ?? [])];
  w.startRecording(0, arch.volume, arch.name);
  for (let t = 0; t < arch.ticks; t++) {
    for (const s of script) if (s.t === t) for (const [ch, v] of Object.entries(s.set)) setState(s.id, ch, v);
    w.step(IDLE);
  }
  const rec = w.stopRecording('archive');
  rec.source = 'archive';
  rec.name = arch.name;
  cache.set(key, rec);
  return rec;
}
export function clearArchiveCache() { cache.clear(); }
