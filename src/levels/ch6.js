import { wall, floor, door, bridge, plate, button, gate, flywheel, resonator, lamp, emitter, room } from './builder.js';

// VI. THE WORLD IS A RECORDING — a reprise of every system, then the Master Record.
const E = [];

// ---- A: plate (echo)
E.push(...room('a', { zS: 8, zN: -28, doorId: 'door1', doorIn: ['p61'] }));
E.push(plate('p61', [-5, 0, -12]));
// ---- B: overspeed
E.push(...room('b', { zS: -28, zN: -58, doorId: 'door2', doorIn: ['gov6'] }));
E.push(flywheel('fw6', [-7, 0, -33], ['btn6'], { accel: 0.5, drag: 0.12 }), button('btn6', [-4, 0, -33], 120), gate('gov6', 'gt', ['fw6'], { level: 1.5 }));
// ---- C: chord
E.push(...room('c', { zS: -58, zN: -90, doorId: 'door3', doorIn: ['res6'] }));
E.push(resonator('res6', [0, 1.4, -72], { want: [2, 5], charge: 30, hold: 400, decay: 60 }), wall('plinth6', [-1, 0, -73], [1, 0.8, -71]));

// ---- D: the Master Record. A void, three spans on a ten-second cycle, and a cradle that needs two bodies.
E.push(...room('d', { zS: -90, zN: -142, x0: -13, x1: 13, floorTo: false, endWall: false, h: 14 }));
E.push(floor('d_near', [-14, -3, -100], [14, 0, -90]), floor('d_far', [-14, -3, -142], [14, 0, -118]));
[[-103, 0], [-109, 300], [-115, 0]].forEach(([zc, ph], i) => {
  E.push(gate(`oscd${i + 1}`, 'osc', [], { period: 600, duty: 0.4, phase: ph }));
  E.push(bridge(`spand${i + 1}`, [-2.5, -6.25, zc - 3], [2.5, -5.75, zc + 3], [0, 6, 0], { in: [`oscd${i + 1}`], speed: 1.5, skin: 'bridge' }));
});
E.push(gate('metro6', 'osc', [], { period: 200, duty: 0.1, phase: 0 }));
E.push(lamp('metroLamp6', [-7, 3.2, -95], ['metro6'], { power: 8, range: 12 }), emitter('metroSnd6', [7, 3.2, -95], 7, { in: ['metro6'], range: 14 }));
E.push(plate('cradle', [0, 0, -128], [3.4, 0.12, 3.4], { need: 2 }));
E.push(wall('d_cap', [-13, 0, -143], [13, 14, -142]));

export default {
  id: 'ch6', index: 6, title: 'The World Is a Recording', subtitle: 'The Master Record', theme: 'record',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 4, maxTicks: 600, maxVolume: [18, 12, 26], modes: ['once', 'loop', 'pingpong', 'hold'], sound: true },
  par: { recordings: 7 },
  killY: -16, sound: true,
  entities: E,
  sections: [
    { id: 'a', name: 'Plate', trigger: [-9, -1, -28, 9, 6, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'The way back to the beginning is the same four lessons. Everything you learned was practice for a single act.',
      objective: 'Open the first door.', hint: 'Record yourself on the plate and loop it.' },
    { id: 'b', name: 'Overspeed', trigger: [-9, -1, -58, 9, 6, -29], checkpoint: { pos: [0, 0, -30], yaw: 0 },
      intro: 'Machines remember. Histories add.', objective: 'Push the governor past 1.5 and reach the door.', hint: 'Hold-record the flywheel, then spin it yourself.' },
    { id: 'c', name: 'Chord', trigger: [-9, -1, -90, 9, 6, -59], checkpoint: { pos: [0, 0, -60], yaw: 0 },
      intro: 'Sound is physical. One voice is never enough.', objective: 'Make the resonator hear notes D and G together.', hint: 'Echo D (X) on one side, sing G (B) on the other.' },
    { id: 'd', name: 'The Master Record', trigger: [-14, -1, -142, 14, 12, -91], checkpoint: { pos: [0, 0, -92], yaw: 0 },
      intro: 'The Master Record. Three spans, ten seconds, one beat. At the far end is the place where the Recollector began.',
      objective: 'Cross the void, then stand where you stood — both of you.',
      hint: 'Record the spans on three beats (800 ticks apart), play all with U, cross. On the cradle: record yourself, step off, play it, step back on. The cradle wants two bodies.' },
  ],
  finale: { signal: 'cradle' },
  discoveries: [
    { id: 'ch6-d1', pos: [-8, 1, 6], title: 'Log 0051 — Recording Zero', text: 'The first recording was not of a room. It was of the last day, all of it, for everyone, in one take.' },
    { id: 'ch6-d2', pos: [8, 1, -88], title: 'Log 0052 — Playback', text: 'A recording that is never played is a stone. A recording that is played is a world. We needed someone to be the playhead.' },
    { id: 'ch6-d3', pos: [12, 1, -139], title: 'Log 0053 — The Cradle', text: 'The Recollector was never an instrument. It was a bookmark. Place it where you stopped, and the world resumes from there.' },
  ],
  experiments: [], tapes: [], archives: [],
  narrative: { intro: 'You have been here before. You have always been here before.' },
};
