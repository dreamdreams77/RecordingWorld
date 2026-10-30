import { wall, floor, plate, crate, lever, flywheel, beam, mirror, sensor, resonator, emitter, door, lamp } from './builder.js';

// POST-GAME SANDBOX — the same World, with every capability unlocked and a spawn/link toolkit.
const E = [];
E.push(floor('sb_floor', [-40, -4, -60], [40, 0, 30]));
for (const [id, a, b] of [['sb_wN', [-41, 0, -61], [41, 12, -60]], ['sb_wS', [-41, 0, 30], [41, 12, 31]], ['sb_wW', [-41, 0, -60], [-40, 12, 30]], ['sb_wE', [40, 0, -60], [41, 12, 30]]]) E.push(wall(id, a, b));
E.push(wall('sb_dais', [-4, 0, -34], [4, 1.5, -26]), wall('sb_pillarA', [-14, 0, -20], [-12, 6, -18]), wall('sb_pillarB', [12, 0, -20], [14, 6, -18]));
E.push(plate('sb_plate', [0, 1.5, -30], [2, 0.12, 2]), crate('sb_crate1', [-8, 0, -6]), crate('sb_crate2', [8, 0, -6]), lever('sb_lever', [-3, 0, -6]));
E.push(lamp('sb_lamp', [0, 3, -30], ['sb_plate'], { power: 18, range: 18 }));

export default {
  id: 'sandbox', index: 0, title: 'Sandbox', subtitle: 'The Open Recording', theme: 'observatory',
  spawn: { pos: [0, 0, 20], yaw: 0 },
  caps: { slots: 6, maxTicks: 3600, maxVolume: [40, 24, 40], modes: ['once', 'loop', 'pingpong', 'hold'], sound: true },
  killY: -30, sound: true, sandbox: true,
  entities: E,
  sections: [{ id: 'sb', name: 'Open Recording', trigger: [-40, -1, -60, 40, 20, 30], checkpoint: { pos: [0, 0, 20], yaw: 0 }, intro: 'Everything is unlocked. Build with B and Enter; link with F; record anything.', objective: 'Experiment.', hint: 'B cycles what you can place. Enter places it. F links a source to a sink. Delete removes a placed object.' }],
  discoveries: [], experiments: [], tapes: [], archives: [],
};
export const SPAWNABLE = [
  { id: 'crate', label: 'Crate', make: (p) => ({ type: 'crate', pos: [p[0], p[1] + 0.5, p[2]], size: [1, 1, 1] }) },
  { id: 'plate', label: 'Pressure plate', make: (p) => ({ type: 'plate', pos: [p[0], p[1] - 0.06, p[2]], size: [2, 0.12, 2] }) },
  { id: 'lever', label: 'Lever', make: (p) => ({ type: 'lever', pos: [p[0], p[1] + 0.9, p[2]] }) },
  { id: 'button', label: 'Button (3 s)', make: (p) => ({ type: 'lever', button: true, hold: 180, pos: [p[0], p[1] + 0.9, p[2]] }) },
  { id: 'door', label: 'Door (aperture)', make: (p) => ({ type: 'slider', mode: 'door', pos: [p[0], p[1] + 1.8, p[2]], to: [p[0], p[1] + 5.4, p[2]], size: [4, 3.6, 0.5], in: [] }) },
  { id: 'bridge', label: 'Platform (matter)', make: (p) => ({ type: 'slider', mode: 'matter', pos: [p[0], p[1] - 3.25, p[2]], to: [p[0], p[1] - 0.25, p[2]], size: [4, 0.5, 6], in: [], speed: 1.2 }) },
  { id: 'lamp', label: 'Lamp', make: (p) => ({ type: 'lamp', pos: [p[0], p[1] + 2.5, p[2]], in: [], on: false }) },
  { id: 'emitter', label: 'Tone emitter', make: (p, n = 1) => ({ type: 'emitter', pos: [p[0], p[1] + 1.4, p[2]], note: n, in: [] }) },
  { id: 'resonator', label: 'Resonator', make: (p, n = 1) => ({ type: 'resonator', pos: [p[0], p[1] + 1.4, p[2]], want: [n], charge: 30, hold: 120, decay: 60 }) },
  { id: 'beam', label: 'Beam projector', make: (p) => ({ type: 'beam', pos: [p[0], p[1] + 1.2, p[2]], dir: 0, in: [] }) },
  { id: 'mirror', label: 'Mirror', make: (p) => ({ type: 'mirror', pos: [p[0], p[1] + 1.2, p[2]], rot: 0 }) },
  { id: 'sensor', label: 'Photocell', make: (p) => ({ type: 'sensor', pos: [p[0], p[1] + 1.2, p[2]] }) },
  { id: 'flywheel', label: 'Flywheel', make: (p) => ({ type: 'flywheel', pos: [p[0], p[1] + 1, p[2]], in: [] }) },
  { id: 'conveyor', label: 'Conveyor', make: (p) => ({ type: 'conveyor', pos: [p[0], p[1] + 0.2, p[2]], size: [2, 0.4, 8], dir: [0, -1], in: [], speed: 1.4 }) },
  { id: 'osc', label: 'Oscillator (4 s)', make: (p) => ({ type: 'gate', op: 'osc', period: 240, duty: 0.5, in: [], pos: [p[0], p[1] + 0.5, p[2]] }) },
];
