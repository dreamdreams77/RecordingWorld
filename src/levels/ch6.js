import { AFTERWORDS } from './story.js';
import { wall, floor, door, bridge, plate, button, gate, flywheel, resonator, lamp, emitter, room } from './builder.js';

// VI. THE WORLD IS A RECORDING — a reprise of every system, then the Master Record.
const E = [];

// ---- A: plate (echo)
// the person you chose to remember in Chapter III is waiting in the first hall
E.push({ id: 'witnessA', type: 'actor', ifCanon: { key: 'ch3', is: 'archive' }, pos: [6.5, 0, -2], yaw: Math.PI / 2, path: [[0, 6.5, -2], [99999, 6.5, -2]], tones: [[40, 100, 3], [110, 170, 5], [180, 240, 3], [250, 310, 6], [320, 380, 1]], loop: false });
E.push({ id: 'witnessO', type: 'actor', ifCanon: { key: 'ch3', is: 'observatory' }, pos: [6.5, 0, -2], yaw: Math.PI / 2, path: [[0, 6.5, -2], [99999, 6.5, -2]], tones: [[40, 100, 1], [110, 170, 6], [180, 240, 3], [250, 310, 5], [320, 380, 4]], loop: false });
E.push(...room('a', { zS: 8, zN: -28, doorId: 'door1', doorIn: ['p61'] }));
E.push(plate('p61', [-5, 0, -12]));
// ---- B: overspeed
E.push(...room('b', { zS: -28, zN: -58, doorId: 'door2', doorIn: ['gov6'] }));
E.push(flywheel('fw6', [-7, 0, -33], ['btn6'], { accel: 0.5, drag: 0.12 }), button('btn6', [-4, 0, -33], 120), gate('gov6', 'gt', ['fw6'], { level: 1.5 }));
// ---- C: chord
E.push(...room('c', { zS: -58, zN: -90, doorId: 'door3', doorIn: ['res6'] }));
E.push(resonator('res6', [0, 1.4, -72], { want: [2, 5], charge: 30, hold: 400, decay: 60 }), wall('plinth6', [-1, 0, -73], [1, 0.8, -71]));

// ---- W: the Well. A one-way descent, a floor that wears out, a lift that waits.
E.push(wall('wl_wW', [-10, -15, -128], [-9, 9, -90]), wall('wl_wE', [9, -15, -128], [10, 9, -90]));
E.push(floor('wl_entry', [-9, -3, -98], [9, 0, -90]), floor('wl_exit', [-9, -3, -128], [9, 0, -120]));
E.push({ id: 'P', type: 'descender', pos: [0, -0.25, -101], to: [0, -12.25, -101], size: [6, 0.5, 6], speed: 0.1 });
E.push({ id: 'tileT', type: 'crumble', pos: [0, -12.25, -109], size: [5, 0.5, 10], life: 60, regen: 0.004 });
E.push(floor('wl_padW', [-9, -15, -120], [-2.5, -12, -114]), floor('wl_padE', [2.5, -15, -120], [9, -12, -114]));
E.push({ id: 'L', type: 'descender', pos: [0, -0.25, -117], to: [0, -12.25, -117], size: [5, 0.5, 6], s0: 1, lift: 0.125, speed: 0.1, in: ['liftGo'] });
E.push(button('liftBtn', [4.5, -12, -117], 700), gate('liftGo', 'delay', ['liftBtn'], { ticks: 180 }));
E.push(gate('crOsc', 'osc', [], { period: 240, duty: 0.5 }));
E.push({ id: 'crush', type: 'slider', mode: 'matter', hazard: true, pos: [0, -7.4, -112], to: [0, -11.2, -112], size: [5, 1.6, 0.8], in: ['crOsc'], speed: 1.5 });
E.push(lamp('crLamp', [-4, -9, -112], ['crOsc'], { power: 6, range: 8 }));

// ---- X: the Unwitnessed Hall. Two Eyes that see every Recollector, present or remembered.
//   X1  a plate in a watched alcove; the door wants the plate pressed and nobody seen.
//       Insight: replay yourself on the plate, then leave yourself out of the memory (selective playback).
//   X2  an Eye over the whole hall; its shutter crosses the lens for a heartbeat twice a cycle.
//       Insight: record the shutter, scrub/slow it to the frame that covers the lens, and freeze it there.
E.push(...room('x', { zS: -128, zN: -168, doorId: 'xD', doorIn: ['!xEye2'] }));
E.push(wall('x_rW1', [2, 0, -143], [3, 5, -138.5]), wall('x_rW2', [2, 0, -135.5], [3, 5, -131]), wall('x_rS', [2, 0, -131], [9, 5, -130]), wall('x_rN', [2, 0, -144], [9, 5, -143]), wall('x_rTop', [2, 5, -144], [9, 5.6, -130]));
E.push(plate('xP', [6, 0, -137]));
E.push({ id: 'xEye1', type: 'watcher', pos: [8.6, 2.6, -137], facing: -Math.PI / 2, zone: [3, 0, -143, 9, 5, -131] });
E.push(wall('x_partW', [-9, 0, -146.5], [-1.5, 9, -145.5]), wall('x_partE', [1.5, 0, -146.5], [9, 9, -145.5]), wall('x_partL', [-1.5, 3.6, -146.5], [1.5, 9, -145.5]));
E.push(door('g1', [-1.5, 0, -146.2], [1.5, 3.6, -145.8], [0, 3.75, 0], { in: ['xP', '!xEye1'], skin: 'door' }));
E.push({ id: 'xEye2', type: 'watcher', pos: [0, 4.5, -146.55], facing: Math.PI, zone: [-9, 0, -168, 9, 6, -150] });
E.push(gate('xOsc', 'osc', [], { period: 360, duty: 0.5 }));
E.push({ id: 'xShut', type: 'slider', mode: 'matter', pos: [-3.2, 4.5, -146.8], to: [3.2, 4.5, -146.8], size: [2, 2, 0.2], speed: 1.5, in: ['xOsc'], skin: 'metal' });

// ---- D: the Master Record. A void, three spans on a ten-second cycle, and a cradle that needs two bodies.
const D = -78; // the Well added 38 m, the Unwitnessed Hall 40 m more
E.push(...room('d', { zS: -90 + D, zN: -142 + D, x0: -13, x1: 13, floorTo: false, endWall: false, h: 14 }));
E.push(floor('d_near', [-14, -3, -100 + D], [14, 0, -90 + D]), floor('d_far', [-14, -3, -142 + D], [14, 0, -118 + D]));
[[-103, 0], [-109, 300], [-115, 0]].forEach(([zc, ph], i) => {
  E.push(gate(`oscd${i + 1}`, 'osc', [], { period: 600, duty: 0.4, phase: ph }));
  E.push(bridge(`spand${i + 1}`, [-2.5, -6.25, zc + D - 3], [2.5, -5.75, zc + D + 3], [0, 6, 0], { in: [`oscd${i + 1}`], speed: 1.5, skin: 'bridge' }));
});
E.push(gate('metro6', 'osc', [], { period: 200, duty: 0.1, phase: 0 }));
E.push(lamp('metroLamp6', [-7, 3.2, -95 + D], ['metro6'], { power: 8, range: 12 }), emitter('metroSnd6', [7, 3.2, -95 + D], 7, { in: ['metro6'], range: 14 }));
E.push(plate('cradle', [0, 0, -128 + D], [3.4, 0.12, 3.4], { need: 2 }));
E.push({ id: 'archivist', type: 'actor', pos: [3.4, 0, -205], startOn: 'section:d', yaw: 0, path: [[0, 3.4, -205], [99999, 3.4, -205]], tones: [] });
E.push({ id: 'op6', type: 'actor', ifFlag: 'op3', pos: [-3.4, 0, -205], startOn: 'section:d', yaw: 0, path: [[0, -3.4, -205], [99999, -3.4, -205]], tones: [] });
E.push({ id: 'archivist2', type: 'actor', pos: [3.4, 0, -205], startOn: 'finale', hideAt: 330, path: [[0, 3.4, -205], [240, 0.9, -203.5], [330, 0.9, -203.5]], tones: [[100, 200, 3]] });
E.push(wall('d_cap', [-13, 0, -143 + D], [13, 14, -142 + D]));

export default {
  id: 'ch6', index: 6, title: 'The World Is a Recording', subtitle: 'The Master Record', theme: 'record',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 4, maxTicks: 600, maxVolume: [18, 12, 26], modes: ['once', 'loop', 'pingpong', 'hold'], sound: true },
  par: { recordings: 10 },
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
    { id: 'w', name: 'The Well', trigger: [-10, -1, -128, 10, 12, -91], checkpoint: { pos: [0, 0, -92], yaw: 0 },
      intro: 'A platform that only goes down. A floor that remembers every footstep. Whatever is at the bottom must be reached once, and carefully.',
      objective: 'Descend, cross the wearing floor, and ride the lift out.',
      hint: 'The tile wears away in about a second; history does not wear. Record it intact (frame only its near end), hold it, and cross. Mind the crusher lamp. If you ruin the attempt, Shift+K resets the section and F6 rewinds time.' },
    { id: 'w2', name: 'The Bottom', trigger: [-10, -16, -106, 10, -9, -91], checkpoint: { pos: [0, -12, -101], yaw: 0 },
      intro: 'Down here the Registry kept its wear tables. They record how long a floor lasts when stood on, and nothing else.',
      objective: 'Cross to the lift. The lift waits three seconds after its button.', hint: 'Press the button first, then step onto the lift before it leaves.' },
    { id: 'x1', name: 'The Witness', trigger: [-9, -1, -146, 9, 8, -129], checkpoint: { pos: [0, 0, -130], yaw: 0 },
      intro: 'An Eye in the alcove sees every Recollector — the one standing here, and every one you have ever recorded. This door obeys only when the plate is pressed and nobody is seen.',
      objective: 'Open the door in the partition.',
      hint: 'The plate needs a body. The Eye forbids one. A recording holds both — your body and the plate’s own memory of being pressed — and, if it was in your frame, the Eye’s memory of seeing you. Aim at an echo and press O to leave it out of the replay; leave out what you do not want remembered.' },
    { id: 'x2', name: 'The Blind Eye', trigger: [-9, -1, -168, 9, 8, -147], checkpoint: { pos: [0, 0, -148], yaw: 0 },
      intro: 'The second Eye watches the whole hall from above the door you came through. Twice a cycle its shutter crosses the lens, and for a heartbeat the far door forgets to be afraid.',
      objective: 'Leave the hall.',
      hint: 'You cannot outrun a heartbeat. But a heartbeat can be recorded, slowed (×½ with [ ), scrubbed (, .) and held still (T). A memory in front of the lens is still in front of the lens.' },
    { id: 'd', name: 'The Master Record', trigger: [-14, -1, -220, 14, 12, -169], checkpoint: { pos: [0, 0, -170], yaw: 0 },
      intro: 'The Master Record. Three spans, ten seconds, one beat. At the far end is the place where the Recollector began.',
      objective: 'Cross the void, then stand where you stood — both of you.',
      hint: 'Record the spans on three beats (800 ticks apart), play all with U, cross. On the cradle: record yourself, step off, play it, step back on. The cradle wants two bodies.' },
  ],
  events: [{ on: 'section:d', actors: ['archivist', 'op6'] }, { on: 'finale', actors: ['archivist2'] },
    { on: 'section:w', ifFlag: 'canon:ch3:observatory', pin: { crush: 0 }, say: 'Someone has already lifted the crusher. The mounting is still warm.', who: 'THE ARCHIVIST' }],
  barks: [
    { id: 'ch6-b1', at: [3.4, 1, -203], r: 5, who: 'THE ARCHIVIST', text: 'I recorded the last day. I recorded it so well I forgot I was inside it.', truth: 'archivist' },
    { id: 'ch6-b2', at: [6.5, 1, -2], r: 3, who: 'THE SURVEYOR', text: 'You let my charter be true. Thank you. It was lonely being the one that almost was.', ifFlag: 'canon:ch3:archive' },
    { id: 'ch6-b4', at: [0, 1, -140], r: 3, who: 'THE OPERATOR', text: 'The first thing they teach an operator: you are not in your own recordings unless you want to be.', ifFlag: 'op2' },
    { id: 'ch6-b3', at: [6.5, 1, -2], r: 3, who: 'THE ASTRONOMER', text: 'You chose the sky. I kept the shutters for you.', ifFlag: 'canon:ch3:observatory' },
  ],
  finale: { signal: 'cradle' },
  discoveries: [
    { id: 'ch6-r1', pos: [8, 1, 3], title: 'Afterword', text: AFTERWORDS.ch6, ifFlag: 'ending' },
    { id: 'ch6-d1', pos: [-8, 1, 6], title: 'Log 0051 — Recording Zero', text: 'The first recording was not of a room. It was of the last day, all of it, for everyone, in one take.' },
    { id: 'ch6-d4', pos: [-8, 1, -158], title: 'Log 0054 — The Eyes', text: 'The Registry did not fear intruders. It feared witnesses — anyone who could later say what had really happened. So it built Eyes, and taught them to recognise us.' },
    { id: 'ch6-d2', pos: [8, 1, -125], title: 'Log 0052 — Playback', text: 'A recording that is never played is a stone. A recording that is played is a world. We needed someone to be the playhead.' },
    { id: 'ch6-d3', pos: [12, 1, -217], title: 'Log 0053 — The Cradle', text: 'The Recollector was never an instrument. It was a bookmark. Place it where you stopped, and the world resumes from there.' },
  ],
  experiments: [],
  tapes: [{ id: 'tWear', name: 'The Wear Table', archive: 'wear', pos: [6, 0, -93], ifFlag: 'canon:ch3:archive' }],
  archives: [{ id: 'wear', name: 'The Wear Table', keep: [], volume: { x0: -3, x1: 3, y0: -14, y1: -9, z0: -107.1, z1: -104.5 }, ticks: 30 }],
  narrative: { intro: 'You have been here before. You have always been here before.' },
};
