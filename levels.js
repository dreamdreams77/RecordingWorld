// src/levels.js
// Level definitions. Each level builds a fresh world with deterministic ids.
// A level's goal is evaluated against the live world every tick.

import {
  createWorld, addWall, addDoor, addPlate, addLamp, addSensor,
  addEmitter, addBelt, spawnBall, WORLD_W, WORLD_H, FLOOR_Y,
} from './sim.js';

function baseRoom(w) {
  addWall(w, -20, -20, WORLD_W + 40, 20);          // ceiling
  addWall(w, -20, 0, 20, WORLD_H);                 // left
  addWall(w, WORLD_W, 0, 20, WORLD_H);             // right
  addWall(w, 0, FLOOR_Y, WORLD_W, WORLD_H - FLOOR_Y); // floor
}

function plateEchoGoal(name) {
  return (w) => {
    const p = w.plates.find((q) => q.name === name);
    return !!p && p.echoHits > 0;
  };
}

// Both plates must be held by echoes at the same moment. No single recording can do this
// alone when each recording is confined to one half of the room.
function twinEchoGoal(a, b) {
  return (w) => {
    const pa = w.plates.find((q) => q.name === a);
    const pb = w.plates.find((q) => q.name === b);
    return !!pa && !!pb && pa.echoHits > 0 && pb.echoHits > 0;
  };
}

// A light and a weight must be real in the same instant. Each pulse is short, so the
// timing of each recording's drop decides whether they coincide.
function phaseGoal(sensorName, plateName) {
  return (w) => {
    const s = w.sensors.find((q) => q.name === sensorName);
    const p = w.plates.find((q) => q.name === plateName);
    return !!s && !!p && s.litByEcho && p.echoHits > 0;
  };
}

function sensorLitByEchoGoal(name) {
  return (w) => {
    const s = w.sensors.find((q) => q.name === name);
    return !!s && s.litByEcho;
  };
}

export const LEVELS = [
  {
    id: 'l1-latch',
    title: '01  LATCH',
    brief: [
      'A pressure plate latches a door open the first time it is pressed.',
      'Record a drop. Shut the door. Replay the recording: the door remembers being open.',
    ],
    goalText: 'Bring an ECHO onto the GOAL plate.',
    dropZones: [{ x: 30, y: 150, w: 170, h: 90 }],
    build(w) {
      baseRoom(w);
      addWall(w, 400, 0, 12, 300);                     // divider
      addDoor(w, 'gate', 400, 300, 12, FLOOR_Y - 300); // closed gate
      addBelt(w, 0, 392, 150);                         // belt carries bodies right
      addPlate(w, 'A', 330, FLOOR_Y - 12, 44, 12, [{ type: 'door', name: 'gate' }]);
      addPlate(w, 'goal', 800, FLOOR_Y - 12, 60, 12, []);
    },
    goal: plateEchoGoal('goal'),
    hint: 'Record until the ball has rolled through the gate and onto GOAL. Stop, reset, then replay.',
  },
  {
    id: 'l2-shadow',
    title: '02  SHADOW',
    brief: [
      'Lamps are lit only while their plate is pressed.',
      'A lamp that was lit in a recording still lights the room in the replay, even when the lamp itself is dark.',
    ],
    goalText: 'Light the SENSOR with an ECHO light, not a live one.',
    dropZones: [{ x: 60, y: 170, w: 150, h: 120 }],
    build(w) {
      baseRoom(w);
      addPlate(w, 'B', 100, FLOOR_Y - 12, 60, 12, []);
      addLamp(w, 'L2', 640, 380, 'B');
      addSensor(w, 'S', 700, FLOOR_Y - 10, 40, 10);
    },
    goal: sensorLitByEchoGoal('S'),
    hint: 'Record a drop onto plate B. Reset. Replay. The lamp is dark, but its recorded light remains.',
  },
  {
    id: 'l3-machine',
    title: '03  MACHINE',
    brief: [
      'An emitter spawns a ball every few moments while it is running.',
      'Echoes keep the timing and path they were recorded with, but start from where the emitter is now.',
    ],
    goalText: 'Get an ECHO-emitted ball onto the far GOAL plate.',
    dropZones: [{ x: 40, y: 215, w: 740, h: 50 }],
    build(w) {
      baseRoom(w);
      addEmitter(w, 'E', 200, 160, 40, 780);
      addPlate(w, 'C', 60, FLOOR_Y - 12, 50, 12, [{ type: 'emitter', name: 'E' }]);
      addPlate(w, 'G3', 700, FLOOR_Y - 12, 60, 12, []);
    },
    goal: plateEchoGoal('G3'),
    hint: 'Start the emitter by pressing C, record a few emissions, then slide the emitter along its rail.',
  },
  {
    id: 'l4-chorus',
    title: '04  CHORUS',
    brief: [
      'Each recording remembers only the half of the room it was made in.',
      'A replay is a voice. Two voices, sounding together, are a chord.',
    ],
    goalText: 'Hold ECHOES on both the LEFT and RIGHT plates at the same moment.',
    dropZones: [{ x: 40, y: 200, w: 880, h: 120 }],
    build(w) {
      baseRoom(w);
      addWall(w, 470, 330, 20, FLOOR_Y - 330);       // central pillar: keeps the halves apart
      addPlate(w, 'left', 80, FLOOR_Y - 12, 60, 12, []);
      addPlate(w, 'right', 780, FLOOR_Y - 12, 60, 12, []);
    },
    goal: twinEchoGoal('left', 'right'),
    hint: 'Record the left half with a ball on LEFT. Record the right half with a ball on RIGHT. Replay both.',
  },
  {
    id: 'l5-presence',
    title: '05  PRESENCE',
    brief: [
      'This gate has no plate. It opens only when you open it, and only memory can open it later.',
      'Memory waits while anything stands in the doorway. It is patient, not absent.',
    ],
    goalText: 'Bring an ECHO onto the far GOAL plate.',
    dropZones: [{ x: 40, y: 200, w: 300, h: 120 }],
    build(w) {
      baseRoom(w);
      addBelt(w, 0, 460, 150);
      addWall(w, 480, 0, 12, 300);
      addDoor(w, 'gate', 480, 300, 12, FLOOR_Y - 300);
      addPlate(w, 'goal', 840, FLOOR_Y - 12, 60, 12, []);
      spawnBall(w, 468, FLOOR_Y - 12);       // a ball left in the doorway
    },
    goal: plateEchoGoal('goal'),
    hint: 'Clear the doorway before you record, open the gate while recording, then clear the doorway again after each reset.',
  },
  {
    id: 'l6-phase',
    title: '06  PHASE',
    brief: [
      'The sensor needs light. The far plate needs weight. Both pulses are short.',
      'Each recording starts its own clock. Wait before you drop to shift a pulse in time.',
    ],
    goalText: 'Have an ECHO light the SENSOR while an ECHO holds the far plate.',
    dropZones: [
      { x: 40, y: 320, w: 360, h: 80 },
      { x: 600, y: 320, w: 320, h: 80 },
    ],
    build(w) {
      baseRoom(w);
      addBelt(w, 0, 300, -150);
      addPlate(w, 'B', 200, FLOOR_Y - 12, 60, 12, []);
      addLamp(w, 'L', 230, 380, 'B');
      addSensor(w, 'S', 330, FLOOR_Y - 10, 40, 10);
      addBelt(w, 620, 340, 150);
      addPlate(w, 'P', 700, FLOOR_Y - 12, 60, 12, []);
    },
    goal: phaseGoal('S', 'P'),
    hint: 'Record the lamp side and the plate side separately. Replays start together, so match the timing.',
  },
  {
    id: 'sandbox',
    title: 'OPEN LAB',
    brief: [
      'Post-game. No goal. Everything in the lab is yours to combine.',
      'Press R to start a region, Space to record, 1-9 to choose recordings, P to replay them.',
    ],
    goalText: null,
    dropZones: [{ x: 20, y: 200, w: 920, h: 200 }],
    build(w) {
      baseRoom(w);
      addWall(w, 360, 0, 12, 320);
      addDoor(w, 'lab-door', 360, 320, 12, FLOOR_Y - 320);
      addPlate(w, 'lab-plate', 150, FLOOR_Y - 12, 60, 12, [{ type: 'door', name: 'lab-door' }]);
      addBelt(w, 420, 180, -110);
      addEmitter(w, 'lab-emitter', 700, 60, 420, 880);
      addPlate(w, 'lab-start', 760, FLOOR_Y - 12, 50, 12, [{ type: 'emitter', name: 'lab-emitter' }]);
      addLamp(w, 'lab-lamp', 520, 380, 'lab-plate');
      addSensor(w, 'lab-sensor', 880, FLOOR_Y - 10, 40, 10);
    },
    goal: null,
    hint: 'Nothing to win.',
  },
];

// Builds a fresh world for a level. Ids are stable for the same level,
// which is what allows recordings to refer to the same entities after a reset.
export function buildLevel(level) {
  const w = createWorld();
  level.build(w);
  return w;
}
