import { wall, floor, door, bridge, crate, plate, lever, gate, flywheel, emitter, resonator, beam, mirror, sensor } from '../src/levels/builder.js';
export * from '../src/levels/builder.js';
export { Bot } from '../src/sim/bot.js';
export { World, IDLE } from '../src/sim/world.js';

/** A small test arena: floor from z=+6 to z=-30, x in [-12,12]. */
export function arena(entities = [], extra = {}) {
  return {
    id: 'test', title: 'Test', spawn: { pos: [0, 0, 0], yaw: 0 },
    caps: { slots: 3, maxTicks: 900, maxVolume: [12, 10, 12], modes: ['once', 'loop', 'pingpong', 'hold'] },
    killY: -20,
    entities: [floor('floor', [-12, -2, -30], [12, 0, 6]), ...entities],
    ...extra,
  };
}
