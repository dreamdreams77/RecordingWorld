// Level-authoring helpers. Levels are plain data: arrays of entity definitions. These helpers only
// convert human-friendly min/max corners into the centre/size form the simulation uses.

const ctr = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const dim = (a, b) => [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])];

/** Solid architecture from min/max corners. `x` may carry {glass, skin, ...} render/sound options. */
export const wall = (id, a, b, x = {}) => ({ id, type: 'wall', pos: ctr(a, b), size: dim(a, b), ...x });
export const floor = (id, a, b, x = {}) => wall(id, a, b, { skin: 'floor', ...x });

/** Door (aperture) / bridge (matter) sliders: closed/retracted box a→b, travelling by `move` when s→1. */
export const door = (id, a, b, move, x = {}) => {
  const c = ctr(a, b);
  return { id, type: 'slider', mode: 'door', pos: c, size: dim(a, b), to: [c[0] + move[0], c[1] + move[1], c[2] + move[2]], ...x };
};
export const bridge = (id, a, b, move, x = {}) => ({ ...door(id, a, b, move, x), mode: 'matter' });

export const crate = (id, at, size = [1, 1, 1], x = {}) => ({ id, type: 'crate', pos: [at[0], at[1] + size[1] / 2, at[2]], size, ...x });
/** Pressure plate whose top face is flush with y (the floor height). */
export const plate = (id, at, size = [2, 0.12, 2], x = {}) => ({ id, type: 'plate', pos: [at[0], at[1] - 0.06, at[2]], size, ...x });
export const lever = (id, at, x = {}) => ({ id, type: 'lever', pos: [at[0], at[1] + 0.9, at[2]], ...x });
export const button = (id, at, hold = 180, x = {}) => lever(id, at, { hold, button: true, ...x });
export const gate = (id, op, ins, x = {}) => ({ id, type: 'gate', op, in: ins, pos: x.pos ?? [0, -50, 0], ...x });
export const flywheel = (id, at, ins, x = {}) => ({ id, type: 'flywheel', pos: [at[0], at[1] + 1, at[2]], in: ins, ...x });
export const conveyor = (id, a, b, dir, ins, x = {}) => ({ id, type: 'conveyor', pos: ctr(a, b), size: dim(a, b), dir, in: ins, ...x });
export const lamp = (id, at, ins, x = {}) => ({ id, type: 'lamp', pos: at, in: ins, ...x });
export const emitter = (id, at, note, x = {}) => ({ id, type: 'emitter', pos: at, note, ...x });
export const resonator = (id, at, x = {}) => ({ id, type: 'resonator', pos: at, ...x });
export const beam = (id, at, dir, x = {}) => ({ id, type: 'beam', pos: at, dir, ...x });
export const mirror = (id, at, rot = 0, x = {}) => ({ id, type: 'mirror', pos: at, rot, ...x });
export const sensor = (id, at, x = {}) => ({ id, type: 'sensor', pos: at, ...x });

/**
 * A rectangular hall: floor slab, side walls and (optionally) a north end wall with a doorway.
 * The doorway is filled by an aperture slider `doorId` powered by `doorIn`.
 */
export function room(p, { zS, zN, x0 = -9, x1 = 9, h = 9, gap = [-2.2, 2.2], gh = 3.6, doorId = null, doorIn = null, endWall = true, floorTo = true, skin = null, doorX = {} }) {
  const e = [];
  const sk = skin ? { skin } : {};
  if (floorTo) e.push(floor(`${p}_floor`, [x0 - 1, -3, zN], [x1 + 1, 0, zS], sk));
  e.push(wall(`${p}_wallW`, [x0 - 1, 0, zN], [x0, h, zS], sk));
  e.push(wall(`${p}_wallE`, [x1, 0, zN], [x1 + 1, h, zS], sk));
  if (endWall) {
    e.push(wall(`${p}_endL`, [x0, 0, zN], [gap[0], h, zN + 1], sk));
    e.push(wall(`${p}_endR`, [gap[1], 0, zN], [x1, h, zN + 1], sk));
    e.push(wall(`${p}_lintel`, [gap[0], gh, zN], [gap[1], h, zN + 1], sk));
    if (doorId) e.push(door(doorId, [gap[0], 0, zN + 0.3], [gap[1], gh, zN + 0.7], [0, gh + 0.15, 0], { in: doorIn ?? [], skin: 'door', ...doorX }));
  }
  return e;
}
