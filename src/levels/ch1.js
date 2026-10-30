import { wall, floor, door, bridge, crate, plate, lever, button, gate, room } from './builder.js';

// I. THE OBSERVATION CHAMBER — record, replay, hold. The Recollector wakes in a calibration hall.
const E = [];
// ---- A: the calibration hall. One plate, one door, one idea: the past can stand where you stood.
E.push(...room('a', { zS: 8, zN: -24, doorId: 'doorA', doorIn: ['plateA'] }));
E.push(plate('plateA', [-5, 0, -12]));
// ---- B: two weights. A crate for one plate, an echo for the other (or two echoes).
E.push(...room('b', { zS: -24, zN: -49, doorId: 'doorB', doorIn: ['plateB1', 'plateB2'] }));
E.push(plate('plateB1', [-5, 0, -35]), plate('plateB2', [5, 0, -35]), crate('crateB', [0, 0, -31]));
// the Annex: an optional experiment room through a permanent opening in the east wall
E.splice(E.findIndex((e) => e.id === 'b_wallE'), 1,
  wall('b_wallE1', [9, 0, -49], [10, 9, -41]), wall('b_wallE2', [9, 0, -37], [10, 9, -24]), wall('b_wallE3', [9, 4, -41], [10, 9, -37]));
E.push(floor('annex_floor', [9, -3, -45], [22, 0, -33]));
E.push(wall('annex_N', [9, 0, -46], [23, 9, -45]), wall('annex_S', [9, 0, -33], [23, 9, -32]),
  wall('annex_E', [22, 0, -45], [23, 9, -32], { skin: 'wall' }));
E.push(plate('annexP1', [12, 0, -39]), plate('annexP2', [15.5, 0, -39]), plate('annexP3', [19, 0, -39]));
E.push(gate('exp1', 'logic', ['annexP1', 'annexP2', 'annexP3']));
// the fragment sits behind a niche door in the east wall
E.splice(E.findIndex((e) => e.id === 'annex_E'), 1,
  wall('annex_E1', [22, 0, -45], [23, 9, -42]), wall('annex_E2', [22, 0, -36], [23, 9, -32]), wall('annex_E3', [22, 3.2, -42], [23, 9, -36]));
E.push(door('annexDoor', [22.2, 0, -42], [22.8, 3.2, -36], [0, 3.3, 0], { in: ['annexHold'], skin: 'door' }));
E.push(gate('annexHold', 'hold', ['exp1'], { ticks: 600 }));
E.push(floor('niche_floor', [22, -3, -43], [27, 0, -35]), wall('niche_N', [22, 0, -43], [27, 5, -42]),
  wall('niche_S', [22, 0, -36], [27, 5, -35]), wall('niche_E', [26, 0, -43], [27, 5, -35]));
// ---- C: the chasm. A momentary button raises the bridge for less time than it takes to cross.
E.push(...room('c', { zS: -49, zN: -88, floorTo: false, endWall: false }));
E.push(floor('c_near', [-10, -3, -57], [10, 0, -49]), floor('c_far', [-10, -3, -88], [10, 0, -66]));
E.push(bridge('bridgeC', [-2, -3.6, -66], [2, -3, -57], [0, 3, 0], { in: ['btnC'], speed: 0.6, skin: 'bridge' }));
E.push(button('btnC', [-3.5, 0, -53.5], 150));
E.push(wall('c_rail', [-10, 0, -88], [10, 9, -87]));

export default {
  id: 'ch1', index: 1, title: 'The Observation Chamber', subtitle: 'Calibration Run 0', theme: 'chamber',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 2, maxTicks: 480, maxVolume: [10, 8, 16], modes: ['once', 'loop'] },
  par: { recordings: 3 },
  killY: -14,
  entities: E,
  sections: [
    { id: 'a', name: 'Calibration', trigger: [-9, -1, -24, 9, 6, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'CALIBRATION RUN 0. The Recollector is online. Frame a volume, record what happens inside it, and replay it.',
      objective: 'Open the door at the end of the hall.',
      hint: 'A recording of you standing on the plate will keep standing there.' },
    { id: 'b', name: 'Two Weights', trigger: [-9, -1, -49, 9, 6, -25], checkpoint: { pos: [0, 0, -27], yaw: 0 },
      intro: 'Two plates. One door. A recording does not get tired, and it does not need to be you.',
      objective: 'Hold both plates down at once.',
      hint: 'Crates are matter too. A crate on one plate, an echo on the other — or two echoes.' },
    { id: 'c', name: 'The Chasm', trigger: [-10, -1, -88, 10, 6, -50], checkpoint: { pos: [0, 0, -52], yaw: 0 },
      caps: { modes: ['once', 'loop', 'pingpong', 'hold'] },
      intro: 'HOLD unlocked. A held recording keeps its final moment. What the past was, the present may stand on.',
      objective: 'Cross the chasm.',
      hint: 'Press the button, wait for the bridge to rise fully, stop recording, then play with HOLD (L cycles modes).' },
  ],
  exit: { box: [-10, 0, -88, 10, 6, -82] },
  discoveries: [
    { id: 'ch1-d1', pos: [-8, 1, 6], title: 'Log 0001 — The First Boot', text: 'Nothing was ever rewound. We only learned to listen to what the world still remembers.' },
    { id: 'ch1-d2', pos: [8, 1, -86], title: 'Log 0002 — Observation Window', text: 'The window looks out at stars. Stars do not blink. I checked for 4,000 hours.' },
    { id: 'ch1-d3', pos: [25, 1, -39], title: 'Log 0003 — Three Witnesses', text: 'A place can be occupied by the past, by the present, and by what someone wants it to have been.' },
  ],
  experiments: [{ id: 'ch1-x1', title: 'Three Witnesses', desc: 'Hold all three Annex plates at once.', signal: 'exp1' }],
  tapes: [], archives: [],
  narrative: {
    outro: 'The window opens onto stars. Something about them is wrong, but you cannot yet say what.',
  },
};
