import { wall, floor, door, crate, plate, lever, button, gate, flywheel, conveyor, room } from './builder.js';

// II. THE MACHINE THAT REMEMBERS — machinery keeps its state; history can power the present.
const E = [];
const swapWall = (id, parts) => { const i = E.findIndex((e) => e.id === id); E.splice(i, 1, ...parts); };

// ---- A: spin-up. The flywheel coasts for seconds; the door is thirty metres away.
E.push(...room('a', { zS: 8, zN: -44, doorId: 'doorA', doorIn: ['fw1'] }));
E.push(flywheel('fw1', [-6, 0, -8], ['btn1'], { accel: 0.5, drag: 0.12 }), button('btn1', [-3, 0, -8], 120));

// ---- B: the conveyor tunnel. The belt only runs while the machine "remembers" being powered.
E.push(...room('b', { zS: -44, zN: -80, doorId: 'doorB', doorIn: ['plateB'] }));
E.push(flywheel('fw2', [-7, 0, -49], ['btn2'], { accel: 0.5, drag: 0.12 }), button('btn2', [-4, 0, -49], 120));
E.push(conveyor('belt', [-1, 0, -68], [1, 0.4, -52], [0, -1], ['fw2'], { speed: 1.4 }));
E.push(wall('tunL', [-1.5, 0, -68], [-1.0, 1.8, -52]), wall('tunR', [1.0, 0, -68], [1.5, 1.8, -52]),
  wall('tunRoof', [-1.5, 1.45, -68], [1.5, 1.8, -52], { glass: true }), wall('tunBack', [-1.5, 0, -52.2], [1.5, 1.8, -52]));
E.push(crate('crateB', [0, 0.4, -53.2]));
E.push(plate('plateB', [0, 0, -69.6]));

// ---- C: overspeed. The governor opens only when histories SUM past 1.5.
E.push(...room('c', { zS: -80, zN: -110, doorId: 'doorC', doorIn: ['gov'] }));
swapWall('c_wallE', [wall('c_wallE1', [9, 0, -110], [10, 9, -96]), wall('c_wallE2', [9, 0, -90], [10, 9, -80]), wall('c_wallE3', [9, 4, -96], [10, 9, -90])]);
E.push(flywheel('fw3', [-7, 0, -85], ['btn3'], { accel: 0.5, drag: 0.12 }), button('btn3', [-4, 0, -85], 120));
E.push(gate('gov', 'gt', ['fw3'], { level: 1.5 }));
// optional vault: needs > 2.5 (two echoes + yourself)
E.push(gate('gov2', 'gt', ['fw3'], { level: 2.5 }), gate('gov2h', 'hold', ['gov2'], { ticks: 600 }));
E.push(floor('vault_floor', [10, -3, -97], [22, 0, -89]), wall('vault_N', [10, 0, -97], [23, 9, -96]), wall('vault_S', [10, 0, -90], [23, 9, -89]), wall('vault_E', [22, 0, -97], [23, 9, -89]));
E.push(door('vaultDoor', [10.2, 0, -96], [10.8, 3.4, -90], [0, 3.5, 0], { in: ['gov2h'], skin: 'door' }));
// exit hall beyond the governor door
E.push(...room('x', { zS: -110, zN: -124, endWall: true }));
E.push(wall('x_cap', [-9, 0, -124], [9, 9, -123]));

export default {
  id: 'ch2', index: 2, title: 'The Machine That Remembers', subtitle: 'Mnemonic Engine', theme: 'machine',
  spawn: { pos: [0, 0, 4], yaw: 0 },
  caps: { slots: 3, maxTicks: 720, maxVolume: [12, 8, 16], modes: ['once', 'loop', 'pingpong', 'hold'] },
  killY: -14,
  entities: E,
  sections: [
    { id: 'a', name: 'Spin-up', trigger: [-9, -1, -44, 9, 6, 8], checkpoint: { pos: [0, 0, 4], yaw: 0 },
      intro: 'The Mnemonic Engine. Machines do not forget at once: they coast. What a machine remembers, it still does.',
      objective: 'Open the far door before the flywheel runs down.',
      hint: 'Press the button, then record the flywheel at full speed and replay it with HOLD. The echo flywheel counts as running.' },
    { id: 'b', name: 'The Tunnel', trigger: [-9, -1, -80, 9, 6, -45], checkpoint: { pos: [0, 0, -46], yaw: 0 },
      intro: 'A crate rides a belt too slow for the machine that drives it. Give the machine a longer memory.',
      objective: 'Deliver the crate to the plate.',
      hint: 'The belt runs while the flywheel is above half speed. Keep it there with a recording.' },
    { id: 'c', name: 'Overspeed', trigger: [-9, -1, -110, 9, 6, -81], checkpoint: { pos: [0, 0, -82], yaw: 0 },
      intro: 'Some histories do not compete; they add. Two machines turning at once are faster than either.',
      objective: 'Drive the governor past 1.5 — the door is 25 m away.',
      hint: 'Record the flywheel spinning (HOLD), then spin it again yourself: echo + live = 2.0.' },
  ],
  exit: { box: [-9, 0, -124, 9, 6, -116] },
  discoveries: [
    { id: 'ch2-d1', pos: [8, 1, 6], title: 'Log 0011 — The Engine', text: 'The Engine was not built to compute. It was built to remember being on.' },
    { id: 'ch2-d2', pos: [7.5, 1, -78], title: 'Log 0012 — The Belt', text: 'A crate on a belt is a very slow clock. Every clock in the Registry was one of these.' },
    { id: 'ch2-d3', pos: [20, 1, -93], title: 'Log 0013 — Superposition', text: 'Two memories of the same motion are not a repetition. They are twice as much motion.' },
  ],
  experiments: [{ id: 'ch2-x1', title: 'Triple Superposition', desc: 'Drive the governor past 2.5 with two echoes and yourself.', signal: 'gov2' }],
  tapes: [], archives: [],
  narrative: { outro: 'Beyond the governor, the Engine opens its gallery. Every dial reads the same number: the tick.' },
};
