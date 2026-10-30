import { wall, floor, door, plate, lever, room } from './builder.js';

// III. THE ARCHITECTURE OF ABSENCE — archive tapes: histories that have no present counterpart.
const E = [];
const swapWall = (id, parts) => { const i = E.findIndex((e) => e.id === id); E.splice(i, 1, ...parts); };
const pastSlider = (id, retracted, final, size, extra = {}) => ({ id, type: 'slider', mode: 'matter', era: 'past', pos: retracted, to: final, size, speed: 0.5, ...extra });

// ---- A: the missing stair. A doorway at +4.5 m; the stair that led to it exists only on tape.
E.push(...room('a', { zS: 8, zN: -34 }));
E.push(wall('a_sill', [-9, 0, -22], [9, 4.5, -21]), wall('a_postL', [-9, 4.5, -22], [-3, 9, -21]), wall('a_postR', [3, 4.5, -22], [9, 9, -21]), wall('a_lint', [-3, 8.4, -22], [3, 9, -21]));
E.push(wall('a_ledge', [-9, 0, -28], [-2, 4.5, -22]));           // the raised platform beyond the doorway
E.push(plate('plateE3', [-6, 4.5, -26]));
E.push(gateEntity('exp3', ['plateE3']), { id: 'exp3h', type: 'gate', op: 'hold', ticks: 900, in: ['exp3'], pos: [0, -50, 0] });
E.push(door('secretDoor', [-9, 4.5, -28.4], [-2, 8, -28], [0, 4, 0], { in: ['exp3h'], skin: 'door' }));
E.push(wall('secret_floor', [-9, 0, -33], [-2, 4.5, -28]));
// past-era stair: nine blocks that descend into place one after another
for (let i = 0; i < 9; i++) {
  const h = 0.5 * (i + 1), depth = i === 8 ? 1.8 : 0.9, zc = i === 8 ? -20.1 : -12 - 0.9 * i - depth / 2;
  E.push(pastSlider(`stair${i}`, [0, h / 2 + 14, zc], [0, h / 2, zc], [6, h, depth]));
}

// ---- B: the last operator. A plate on a three-metre dais that nobody can climb — except the past.
E.push(...room('b', { zS: -34, zN: -62, doorId: 'doorB', doorIn: ['plateB'] }));
E.push(wall('dais', [-3, 0, -50], [3, 3, -44]), plate('plateB', [0, 3, -47]));
E.push({ id: 'op', type: 'player', era: 'past', pos: [0, 3.9, -47], yaw: 0 });

// ---- C: two histories of a bridge, overlapping at the middle.
E.push(...room('c', { zS: -62, zN: -100, floorTo: false, endWall: false }));
E.push(floor('c_near', [-10, -3, -72], [10, 0, -62]), floor('c_far', [-10, -3, -100], [10, 0, -90]));
E.push(pastSlider('deckX', [0, 13.75, -77.25], [0, -0.25, -77.25], [4, 0.5, 10.5]), pastSlider('deckY', [0, 13.75, -84.75], [0, -0.25, -84.75], [4, 0.5, 10.5]));

// ---- D: the fork. Two incompatible histories of one chasm; a ledger decides which becomes true.
E.push(...room('d', { zS: -100, zN: -164, floorTo: false, endWall: false }));
E.push(floor('d_near', [-10, -3, -108], [10, 0, -100]), floor('d_far', [-10, -3, -164], [10, 0, -126]));
E.push(wall('fork_div', [-0.5, 0, -164], [0.5, 9, -126]));
E.push({ id: 'forkE', type: 'slider', mode: 'matter', pos: [4, -6.25, -117], to: [4, -0.25, -117], size: [4, 0.5, 18], speed: 0.5, skin: 'bridge' });
E.push({ id: 'forkW', type: 'slider', mode: 'matter', pos: [-4, -6.25, -117], to: [-4, -0.25, -117], size: [4, 0.5, 18], speed: 0.5, skin: 'bridge' });
E.push({ id: 'ledE', type: 'ledger', pos: [5, 0.6, -134], accepts: 'forkE' }, { id: 'ledW', type: 'ledger', pos: [-5, 0.6, -134], accepts: 'forkW' });
E.push(wall('fk_endA', [-10, 0, -150], [-7, 9, -149]), wall('fk_endB', [-2, 0, -150], [2, 9, -149]), wall('fk_endC', [7, 0, -150], [10, 9, -149]),
  wall('fk_lintW', [-7, 3.6, -150], [-2, 9, -149]), wall('fk_lintE', [2, 3.6, -150], [7, 9, -149]), wall('fk_cap', [-10, 0, -165], [10, 9, -164]));
E.push(door('doorW', [-7, 0, -149.7], [-2, 3.6, -149.3], [0, 3.75, 0], { in: ['ledW'], skin: 'door' }), door('doorE', [2, 0, -149.7], [7, 3.6, -149.3], [0, 3.75, 0], { in: ['ledE'], skin: 'door' }));

E.push({ id: 'survE', type: 'actor', era: 'past', pos: [4, 0, -108], startOn: 'tape', path: [[0, 4, -108], [270, 4, -125]], tones: [[0, 60, 3], [70, 130, 5], [140, 200, 3], [210, 270, 6]] });
E.push({ id: 'survW', type: 'actor', era: 'past', pos: [-4, 0, -108], startOn: 'tape', path: [[0, -4, -108], [270, -4, -125]], tones: [[0, 60, 1], [70, 130, 6], [140, 200, 3], [210, 270, 5]] });

function gateEntity(id, ins) { return { id, type: 'gate', op: 'logic', in: ins, pos: [0, -50, 0] }; }

const stairScript = Array.from({ length: 9 }, (_, i) => ({ t: 10 + i * 14, id: `stair${i}`, set: { tgt: 1 } }));

export default {
  id: 'ch3', index: 3, title: 'The Architecture of Absence', subtitle: 'The Vestibule Quarter', theme: 'absence',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 4, maxTicks: 900, maxVolume: [14, 10, 16], modes: ['once', 'loop', 'pingpong', 'hold'] },
  par: { recordings: 0 },
  par: { recordings: 0 },
  killY: -14,
  entities: E,
  sections: [
    { id: 'a', name: 'The Missing Stair', trigger: [-9, -1, -34, 9, 7, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'The Quarter was demolished and recorded in the same afternoon. Archive tapes hold what stood here before. Load one with E at the pedestal.',
      objective: 'Reach the doorway above the wall.',
      hint: 'Load the tape at the pedestal into a slot and play it with HOLD. Reconstruction takes a few seconds; stand clear.' },
    { id: 'b', name: 'The Last Operator', trigger: [-9, -1, -62, 9, 7, -35], checkpoint: { pos: [0, 0, -36], yaw: 0 },
      intro: 'Someone stood on that plate once. The tape remembers them there.',
      objective: 'Open the door at the end of the hall.',
      hint: 'You cannot reach the plate. A tape can place a past body on it — and a past body presses plates.' },
    { id: 'c', name: 'Two Spans', trigger: [-9, -1, -100, 9, 7, -63], checkpoint: { pos: [0, 0, -64], yaw: 0 },
      intro: 'Two surveys of the same bridge. Neither is complete. Where they overlap, history disagrees about whose matter this is.',
      objective: 'Cross the gap before the overlapping spans tear themselves apart.',
      hint: 'Load both tapes (slots 1 and 2), press U to play all together, wait for both spans, then cross. Overlap costs coherence.' },
    { id: 'd', name: 'The Fork', trigger: [-10, -1, -164, 10, 7, -101], checkpoint: { pos: [0, 0, -102], yaw: 0 },
      intro: 'Two charters survive, and they cannot both be true: each raises a different bridge and condemns the other. You may play either, or both, and walk where they lead. A ledger on the far side will enter one of them into the record.',
      objective: 'Cross, and decide which history becomes real.',
      hint: 'Load a charter, play it (HOLD), cross, then stand at the ledger with that charter selected and press E. The other bridge will be gone for good — unless you rewind (F6).' },
  ],
  exits: [{ id: 'archive', box: [0.5, 0, -164, 9.5, 6, -156] }, { id: 'observatory', box: [-9.5, 0, -164, -0.5, 6, -156] }],
  canon: { ledE: { key: 'ch3', value: 'archive' }, ledW: { key: 'ch3', value: 'observatory' } },
  tapes: [
    { id: 't3a', name: 'The Vestibule Stair', archive: 'stair', pos: [5, 0, 0] },
    { id: 't3b', name: 'The Last Operator', archive: 'operator', pos: [5, 0, -37] },
    { id: 't3x', name: 'Survey East Span', archive: 'spanX', pos: [-6, 0, -65] },
    { id: 'tE', name: 'Charter of the Archive', archive: 'forkE', pos: [5, 0, -103] },
    { id: 'tW', name: 'Charter of the Observatory', archive: 'forkW', pos: [-5, 0, -103] },
    { id: 't3y', name: 'Survey West Span', archive: 'spanY', pos: [6, 0, -65] },
  ],
  archives: [
    { id: 'stair', name: 'The Vestibule Stair', keep: stairScript.map((s) => s.id), volume: { x0: -5, x1: 5, y0: -1, y1: 9, z0: -22, z1: -10 }, ticks: 330, script: stairScript },
    { id: 'operator', name: 'The Last Operator', keep: ['op'], volume: { x0: -5, x1: 5, y0: -1, y1: 7, z0: -52, z1: -42 }, ticks: 240 },
    { id: 'spanX', name: 'Survey East Span', keep: ['deckX'], volume: { x0: -4, x1: 4, y0: -3, y1: 9, z0: -84, z1: -70 }, ticks: 300, script: [{ t: 10, id: 'deckX', set: { tgt: 1 } }] },
    { id: 'forkE', name: 'Charter of the Archive', keep: ['survE'], volume: { x0: -7, x1: 7, y0: -8, y1: 3, z0: -127, z1: -107 }, ticks: 460, script: [{ t: 10, id: 'forkE', set: { tgt: 1 } }, { t: 150, id: 'survE', set: { active: 1 } }] },
    { id: 'forkW', name: 'Charter of the Observatory', keep: ['survW'], volume: { x0: -7, x1: 7, y0: -8, y1: 3, z0: -127, z1: -107 }, ticks: 460, script: [{ t: 10, id: 'forkW', set: { tgt: 1 } }, { t: 150, id: 'survW', set: { active: 1 } }] },
    { id: 'spanY', name: 'Survey West Span', keep: ['deckY'], volume: { x0: -4, x1: 4, y0: -3, y1: 9, z0: -92, z1: -78 }, ticks: 300, script: [{ t: 10, id: 'deckY', set: { tgt: 1 } }] },
  ],
  discoveries: [
    { id: 'ch3-d1', pos: [-8, 1, 6], title: 'Log 0021 — Demolition', text: 'They did not tear the Quarter down. They recorded it, and then forgot which one was the building.' },
    { id: 'ch3-d2', pos: [0, 5.6, -24], title: 'Log 0022 — The Doorway', text: 'A door that opens onto nothing is still a door. The tape says someone used it daily.' },
    { id: 'ch3-d3', pos: [-6, 5.6, -31], title: 'Log 0023 — The Operator', text: 'I was the last Recollector operator. I stood on the plate for eleven days so that you would not have to.' },
  ],
  experiments: [{ id: 'ch3-x1', title: 'The High Plate', desc: 'Climb the remembered stair to the raised platform and press its plate.', signal: 'exp3' }],
  narrative: { outro: 'The far ledge ends at a wall of stars. The Quarter is still there, if you hold the right tape.' },
};
