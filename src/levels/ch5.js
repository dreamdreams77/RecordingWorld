import { wall, floor, door, bridge, button, plate, gate, flywheel, resonator, beam, mirror, sensor, lamp, emitter, room } from './builder.js';

// V. THE INFINITE OBSERVATORY — every system at once, and recordings used as instruments of timing.
const E = [];
const swapWall = (id, parts) => { const i = E.findIndex((e) => e.id === id); E.splice(i, 1, ...parts); };

// ---- A: light. One beam, one mirror, two sensors: you can only point it one way at a time.
E.push(...room('a', { zS: 8, zN: -30, doorId: 'doorA', doorIn: ['Ss', 'Sn'] }));
E.push(beam('B5', [-7, 1.2, -14], 0), mirror('M5', [0, 1.2, -14], 0), sensor('Ss', [0, 1.2, -6], { facing: Math.PI }), sensor('Sn', [0, 1.2, -22], { facing: 0 }));
// optional: a second beam/mirror pair feeding a third sensor
E.push(beam('B2', [8, 1.2, -26], 2), mirror('M2', [3, 1.2, -26], 0), sensor('Sx', [3, 1.2, -19], { facing: Math.PI }));
E.push(gate('exp5', 'logic', ['Ss', 'Sn', 'Sx']), gate('exp5h', 'hold', ['exp5'], { ticks: 900 }));
swapWall('a_wallW', [wall('a_wallW1', [-10, 0, -30], [-9, 9, -26]), wall('a_wallW2', [-10, 0, -20], [-9, 9, 8]), wall('a_wallW3', [-10, 4, -26], [-9, 9, -20])]);
E.push(floor('vault_floor', [-23, -3, -27], [-10, 0, -19]), wall('vault_N', [-23, 0, -27], [-10, 9, -26]), wall('vault_S', [-23, 0, -20], [-10, 9, -19]), wall('vault_W', [-23, 0, -27], [-22, 9, -19]));
E.push(door('vaultDoor', [-10.8, 0, -26], [-10.2, 3.4, -20], [0, 3.5, 0], { in: ['exp5h'], skin: 'door' }));

// ---- B: the orrery bridge. Three spans, never all raised together; a metronome marks the beat.
E.push(...room('b', { zS: -30, zN: -70, floorTo: false }));
E.push(floor('b_near', [-10, -3, -40], [10, 0, -30]), floor('b_far', [-10, -3, -70], [10, 0, -58]));
const spans = [[-43, 0], [-49, 300], [-55, 0]];
spans.forEach(([zc, ph], i) => {
  E.push(gate(`osc${i + 1}`, 'osc', [], { period: 600, duty: 0.4, phase: ph }));
  E.push(bridge(`span${i + 1}`, [-2, -6.25, zc - 3], [2, -5.75, zc + 3], [0, 6, 0], { in: [`osc${i + 1}`], speed: 1.5, skin: 'bridge' }));
});
E.push(gate('metro', 'osc', [], { period: 200, duty: 0.1, phase: 0 }));
E.push(lamp('metroLamp', [-6, 3.2, -34], ['metro'], { power: 8, range: 12 }), emitter('metroSnd', [6, 3.2, -34], 7, { in: ['metro'], range: 14 }));

// ---- C: the great counterweight. Light, machine and voice must all be held on while a lift climbs 18 m.
E.push(...room('c', { zS: -70, zN: -112, floorTo: false, endWall: false }));
E.push(floor('c_f1', [-10, -3, -97], [10, 0, -70]), floor('c_f2', [-10, -3, -103], [-3, 0, -97]), floor('c_f3', [3, -3, -103], [10, 0, -97]), floor('c_f4', [-10, -3, -112], [10, 0, -103]));
E.push(wall('c_pitW', [-3, -3, -103], [-2.9, 0, -97]), wall('c_pitE', [2.9, -3, -103], [3, 0, -97]));
E.push(wall('deck', [-10, 14.5, -112], [10, 18, -103]), wall('c_cap', [-10, 0, -113], [10, 30, -112]));
E.push(beam('B5c', [-8, 1.2, -80], 0), wall('c_div1a', [-1.5, 0, -86], [-0.5, 5, -81.5]), wall('c_div1b', [-1.5, 0, -78.5], [-0.5, 5, -74]), sensor('S5c', [8, 1.2, -80], { facing: Math.PI / 2 }));
E.push(door('shutter', [-0.5, 0, -81.5], [0.5, 3, -78.5], [0, 3.2, 0], { in: ['btn5s'], skin: 'door' }));
E.push(button('btn5s', [-4, 0, -76], 150));
E.push(flywheel('fw5', [-7, 0, -91], ['btn5f'], { accel: 0.5, drag: 0.12 }), button('btn5f', [-4, 0, -91], 120));
E.push(resonator('res5', [6, 1.4, -100], { want: [4], charge: 25, hold: 120, decay: 60 }));
E.push(bridge('lift', [-3, -0.5, -103], [3, 0, -97], [0, 18, 0], { in: ['S5c', 'fw5', 'res5'], speed: 0.075, skin: 'bridge' }));

export default {
  id: 'ch5', index: 5, title: 'The Infinite Observatory', subtitle: 'The Great Shaft', theme: 'observatory',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 4, maxTicks: 600, maxVolume: [18, 12, 26], modes: ['once', 'loop', 'pingpong', 'hold'], sound: true },
  killY: -16, sound: true,
  entities: E,
  sections: [
    { id: 'a', name: 'Two Sensors', trigger: [-10, -1, -30, 9, 6, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'The Observatory measures light that left a long time ago. Light is history that has not yet arrived.',
      objective: 'Light both sensors at once.',
      hint: 'Turn the mirror with E. Record the lit sensor (HOLD), then turn the mirror the other way. Echo sensors count as lit.' },
    { id: 'b', name: 'The Orrery Bridge', trigger: [-10, -1, -70, 10, 6, -31], checkpoint: { pos: [0, 0, -32], yaw: 0 },
      intro: 'Three spans, each raised for four seconds out of ten. They are never up together. The lamp marks every third of the cycle.',
      objective: 'Raise all three spans together and cross.',
      hint: 'Recording is capped at exactly one cycle (10 s). Start recording on a pulse; record again 4 pulses later, and again 4 after that. Then press U to play all.' },
    { id: 'c', name: 'The Counterweight', trigger: [-10, -1, -112, 10, 22, -71], checkpoint: { pos: [0, 0, -72], yaw: 0 },
      intro: 'Light through the shutter, a flywheel at speed, a voice at the resonator. The lift wants all three, for as long as it takes to climb.',
      objective: 'Ride the lift to the deck.',
      hint: 'Three short recordings: shutter open, flywheel spinning, and note F (V) sung while standing on the lift. Start the last replay from the far side of the lift — it only climbs once all three hold.' },
  ],
  exit: { box: [-10, 17, -112, 10, 26, -105] },
  discoveries: [
    { id: 'ch5-d1', pos: [-8, 1, 6], title: 'Log 0041 — Starlight', text: 'I measured the sky for four thousand hours. It never moved. I decided the instrument was broken.' },
    { id: 'ch5-d2', pos: [8, 1, -69], title: 'Log 0042 — The Beat', text: 'The metronome is not for you. It is for whoever is playing you back, so they stay in time.' },
    { id: 'ch5-d3', pos: [-21, 1, -23], title: 'Log 0043 — The Vault of Light', text: 'Three beams, three sensors, one hand. The trick was always to let someone else hold the other two.' },
  ],
  experiments: [{ id: 'ch5-x1', title: 'Triple Light', desc: 'Light all three sensors at once.', signal: 'exp5' }],
  tapes: [], archives: [],
  narrative: { outro: 'At the top of the shaft the sky is a photograph. Each star is a pixel that has not changed in all the hours you have been here.' },
};
