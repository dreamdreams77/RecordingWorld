import { wall, floor, door, resonator, emitter, room, gate, button } from './builder.js';

// IV. THE ACOUSTIC WORLD — recorded sound has range, occlusion and meaning to the machinery that hears it.
const E = [];
const swapWall = (id, parts) => { const i = E.findIndex((e) => e.id === id); E.splice(i, 1, ...parts); };

// ---- A: a resonator behind glass. Sound survives glass at reduced strength; walls nearly stop it.
E.push(...room('a', { zS: 8, zN: -36, doorId: 'doorA', doorIn: ['resA'] }));
E.push(resonator('resA', [-8.6, 1.4, -10], { want: [3], charge: 30, hold: 90, decay: 60 }));
E.push(wall('glassA', [-7.7, 0, -12.5], [-7.5, 3, -7.5], { glass: true }));

// ---- B: a chord. Two notes at once; you only have one voice.
E.push(...room('b', { zS: -36, zN: -72, doorId: 'doorB', doorIn: ['resB'] }));
E.push(resonator('resB', [0, 1.4, -54], { want: [2, 5], charge: 30, hold: 400, decay: 60 }));
E.push(wall('plinthB', [-1, 0, -55], [1, 0.8, -53]));
// optional melody vault (east)
swapWall('b_wallE', [wall('b_wallE1', [9, 0, -72], [10, 9, -50]), wall('b_wallE2', [9, 0, -44], [10, 9, -36]), wall('b_wallE3', [9, 4, -50], [10, 9, -44])]);
E.push(floor('vault_floor', [10, -3, -51], [22, 0, -43]), wall('vault_N', [10, 0, -51], [23, 9, -50]), wall('vault_S', [10, 0, -44], [23, 9, -43]), wall('vault_E', [22, 0, -51], [23, 9, -43]));
E.push(door('vaultDoor', [10.2, 0, -50], [10.8, 3.4, -44], [0, 3.5, 0], { in: ['melody'], skin: 'door' }));
E.push(resonator('melody', [8.4, 1.4, -47], { seq: [3, 5, 3, 6, 1], window: 200, hold: 900 }));
E.push(wall('plinthM', [8, 0, -48], [9, 0.8, -46]));

// ---- C: three alcoves behind windows; three notes must sound at the same time.
E.push(...room('c', { zS: -72, zN: -112, doorId: 'doorC', doorIn: ['res1', 'res2', 'res3'] }));
const wins = [-80, -90, -100];
swapWall('c_wallW', [
  wall('cw0', [-10, 0, -112], [-9, 9, -102]), wall('cw1', [-10, 0, -98], [-9, 9, -92]), wall('cw2', [-10, 0, -88], [-9, 9, -82]), wall('cw3', [-10, 0, -78], [-9, 9, -72]),
  ...wins.flatMap((z, i) => [wall(`cg${i}`, [-10, 0, z - 2], [-9, 5, z + 2], { glass: true }), wall(`cl${i}`, [-10, 5, z - 2], [-9, 9, z + 2])]),
]);
E.push(floor('alc_floor', [-17, -3, -112], [-10, 0, -72]), wall('alc_back', [-17, 0, -112], [-16, 9, -72]));
for (const z of [-105, -95, -85, -76]) E.push(wall(`alc_div${z}`, [-16, 0, z - 0.15], [-10, 9, z + 0.15]));
const notes = [1, 4, 6];
wins.forEach((z, i) => E.push(resonator(`res${i + 1}`, [-13, 1.4, z], { want: [notes[i]], charge: 25, hold: 500, decay: 60 })));

// ---- D: the carillon. A music mechanism, two locks that care about ORDER and TEMPO.
E.push(...room('d1', { zS: -112, zN: -130, doorId: 'doorD1', doorIn: ['lock1'] }));
E.push({ id: 'car1', type: 'carillon', pos: [-6, 1.4, -118], melody: [[1, 60], [3, 60], [5, 60], [6, 60], [4, 60]], once: true, in: ['go1'], range: 24 });
E.push(button('go1', [-3.5, 0, -116], 400), wall('car1_base', [-6.5, 0, -118.5], [-5.5, 0.7, -117.5]));
E.push(resonator('lock1', [6, 1.4, -124], { seq: [4, 6, 5, 3, 1], tempo: [20, 36], window: 80, hold: 900, charge: 20 }), wall('lock1_base', [5.5, 0, -124.5], [6.5, 0.7, -123.5]));
E.push(...room('d2', { zS: -130, zN: -148, doorId: 'doorD2', doorIn: ['lock2'] }));
E.push({ id: 'car2', type: 'carillon', pos: [-6, 1.4, -136], melody: [[2, 12], [5, 12], [3, 12], [1, 12], [6, 12]], once: true, in: ['go2'], range: 24 });
E.push(button('go2', [-3.5, 0, -134], 80), wall('car2_base', [-6.5, 0, -136.5], [-5.5, 0.7, -135.5]));
E.push(resonator('lock2', [6, 1.4, -142], { seq: [2, 5, 3, 1, 6], tempo: [30, 60], window: 100, hold: 900, charge: 20 }), wall('lock2_base', [5.5, 0, -142.5], [6.5, 0.7, -141.5]));
E.push(...room('x', { zS: -148, zN: -162 }));
E.push(wall('x_cap', [-9, 0, -163], [9, 9, -162]));
E.push(emitter('hum', [0, 3, -156], 2, { range: 12 }));

export default {
  id: 'ch4', index: 4, title: 'The Acoustic World', subtitle: 'The Resonant Cathedral', theme: 'acoustic',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 4, maxTicks: 1200, maxVolume: [14, 10, 16], modes: ['once', 'loop', 'pingpong', 'hold'], sound: true },
  par: { recordings: 4 },
  killY: -14, sound: true,
  entities: E,
  sections: [
    { id: 'a', name: 'Resonant Door', trigger: [-9, -1, -36, 9, 6, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'Sound is physical here. Hold Z X C V B N M to sing notes C to B. Machines tuned to a note will hear you — and they will hear the past too.',
      objective: 'Sing the door open. The resonator behind the glass wants note E (C key).',
      hint: 'Hold C near the glass for a second. The afterglow is shorter than the walk to the door — record yourself singing and loop it.' },
    { id: 'b', name: 'Chord', trigger: [-9, -1, -72, 9, 6, -37], checkpoint: { pos: [0, 0, -38], yaw: 0 },
      intro: 'A chord is two voices at once. You have one throat and a history.',
      objective: 'Make the resonator hear notes D (X) and G (B) together.',
      hint: 'Record yourself singing D (X) on one side, loop it, then sing G (B) on the other. Range matters: stand within a few metres.' },
    { id: 'c', name: 'Three Windows', trigger: [-17, -1, -112, 9, 6, -73], checkpoint: { pos: [0, 0, -74], yaw: 0 },
      intro: 'Three alcoves, three tuned resonators. Walls swallow sound; glass only dims it.',
      objective: 'Sound C (Z), F (V) and A (N) — one at each window — all at once.',
      hint: 'Two recordings and your own voice. Sing near the window you want to wake, not the ones beside it.' },
    { id: 'd1', name: 'The Carillon', trigger: [-9, -1, -130, 9, 6, -113], checkpoint: { pos: [0, 0, -114], yaw: 0 },
      intro: 'A carillon plays its melody once and falls silent. The lock beside it wants the same notes in the opposite order, quickly.',
      objective: 'Make the resonator hear the melody backwards, in a hurry.',
      hint: 'Press the button, record the carillon, then play the recording in REVERSE (G) at ×2 ( ] ). Frame only the carillon: a recorded button would power the present carillon too. Or sing the notes yourself: F, A, G, E, C — about half a second apart.' },
    { id: 'd2', name: 'Escapement', trigger: [-9, -1, -148, 9, 6, -131], checkpoint: { pos: [0, 0, -132], yaw: 0 },
      intro: 'A second carillon, impatient: its notes come faster than any lock can bear. A recording can be slowed.',
      objective: 'Make the resonator hear this melody at a dignified pace.',
      hint: 'Record the carillon and play it at ×0.25 ( [ ). Time is a dial.' },
  ],
  exit: { box: [-9, 0, -162, 9, 6, -154] },
  discoveries: [
    { id: 'ch4-d1', pos: [-8, 1, 6], title: 'Log 0031 — Listening', text: 'The first thing the Recollector ever recorded was a room full of people not speaking.' },
    { id: 'ch4-d2', pos: [-14.5, 1, -90], title: 'Log 0032 — The Alcoves', text: 'The cathedral has no choir. The choir is whoever last sang here, and for how long.' },
    { id: 'ch4-d3', pos: [20, 1, -47], title: 'Log 0033 — Melody', text: 'Five notes, in order, with room to breathe. It is the only lock in the Registry that anyone ever enjoyed opening.' },
  ],
  experiments: [{ id: 'ch4-x1', title: 'The Registry Melody', desc: 'Play the five-note melody (E G E B C) to the vault resonator.', signal: 'melody' }],
  tapes: [], archives: [],
  narrative: { outro: 'The cathedral falls silent. One tone remains in the exit hall. It is the same tone it was an hour ago.' },
};
