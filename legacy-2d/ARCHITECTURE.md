# Architecture

This document describes how *The World Is a Recording* is built, and the rules that
govern recording and playback. It is written for a developer who has never seen the
project before.

## Layers

```
index.html
  └── src/main.js        input, frame loop, wiring          (DOM / browser only)
        ├── src/game.js       headless controller: verbs, progression, goal checks
        │     ├── src/levels.js     level definitions, goal predicates
        │     ├── src/recording.js  Recorder, Playback, Playbacks, reconciliation (R1–R6)
        │     └── src/sim.js        deterministic world and physics
        ├── src/render.js     Canvas 2D presentation, HUD, debug overlay
        └── src/audio.js      procedural Web Audio
```

The rule that keeps this manageable: **only `sim.js`, `recording.js`, `levels.js`, and
`game.js` decide what happens.** `main.js`, `render.js`, and `audio.js` only read state and
turn events into pixels and sound. `game.js` has no DOM references, so the test suite plays
the same game the player plays.

## The simulation (`src/sim.js`)

- **Fixed timestep.** `DT = 1/60`. `step(world)` advances exactly one tick. The browser
  accumulates real time and calls `game.tick()` the right number of times per frame, capped at
  8 steps per frame so a stall cannot cause a spiral.
- **Determinism.** No `Math.random`, no wall-clock time, array iteration in insertion order.
  Identical initial state and identical sequence of calls produce identical state. The
  test suite checks this directly.
- **Bodies** are circles with position, velocity, and an `echo` flag. Echo bodies
  are created by playback; they use the same physics as live bodies.
- **Static geometry** is axis-aligned rectangles: walls, and doors while closed.
- **Fixtures**:
  - *Plate*: `pressed` is derived from overlap with bodies. On the rising edge only, it latches
    its links (open a door, start an emitter). Holding a plate does not re-latch.
  - *Lamp*: `on` is derived from its plate.
  - *Sensor*: pressed when any light source covers it. Live lamps and echo lights both count, and each
    is recorded separately (`litByLive`, `litByEcho`).
  - *Emitter*: while `running`, spawns a ball every `EMITTER_PERIOD` ticks. Each spawned body
    records its `source` emitter id.
  - *Belt*: a floor segment that drives bodies resting on it toward its speed.
  - *Door*: solid while closed.

## Recording (`src/recording.js`)

A `Recorder` is created with a rectangular region. It samples once per tick, after `step`:

- **Body tracks** start when a body first appears inside the region and end when it leaves
  it or dies. Each frame stores `[x, y, vx, vy]`. Echo bodies are never recorded, so replays do
  not record themselves.
- **Fixture tracks** are created for fixtures whose centre is inside the region at the moment
  recording starts. Each frame stores state:
  - door: `[open]`
  - plate: `[pressed]`
  - lamp: `[on]`
  - sensor: `[pressed]`
  - emitter: `[running, x, y]`

Samples go into `Float32Array` buffers that double on growth, so recording allocates little
after the first few seconds.

A finished recording is a plain object: `{ name, region, length, tracks, byKey }`.

## Playback and reconciliation (`src/recording.js`)

`Playbacks` holds any number of concurrently running `Playback`s. Each tick:

Fixtures are bound by id. A `Playback` binds each fixture track to the object with the same
id in its own world, never to the object from the recording-time world. Ids are stable across
a level rebuild, so this is what keeps memory writes landing after a reset.

1. `beginTick` runs for every playback, before `step`. It spawns echoes, sets their springs,
   applies memory writes, and rebuilds `echoLights`.
2. `step` runs the ordinary physics. Echoes are ordinary bodies.
3. `endTick` advances each playback's clock and removes those that have finished.

The rules are labelled in the source (R1–R7):

| Rule | Name | What it means |
|---|---|---|
| **R1** | Echo | Recorded bodies become echo bodies. A spring with stiffness 600 and damping 30 pulls each echo toward `recorded position + placement offset`. Because the echo is physical, it collides with live bodies, presses plates, and deflects when the live world blocks its path. When the echo drifts more than 40 px from its memory, a *contradiction* is logged, at most once per 30 ticks. |
| **R2** | Memory | A recorded fixture *transition* (door opened, door closed, emitter started) is written into the live world on the recorded frame. Transitions are written, not levels, so a live player action can still override a memory that has already been applied. |
| **R3** | Presence | A memory write to a door is deferred while any body overlaps the door. The write stays *pending* and is applied as soon as the door is clear. Each block is logged as a *presence* conflict. |
| **R4** | Place | An emitter's echoes keep their recorded timing and path but are shifted by how far the live emitter has moved from where it was recorded, measured at spawn time. The location comes from the present and the path from memory. |
| **R5** | Light | A recorded lamp that was lit produces an echo light at its recorded location, whether or not the live lamp exists. Sensors respond to live and echo light alike. |
| **R6** | Present | Live fixtures are never overwritten except through R2 transitions. Plates and lamps are derived from presence and are never written by memory. |
| **R7** | Discord | An echo accumulates *discord* while it is more than 40 px from its memory, at one unit per 60 ticks. It loses discord at one unit per 120 ticks while on its path. At full discord it becomes a *ghost*. A ghost is drawn faint and cannot press plates. It regains coherence only when discord returns to zero, so a ghost that is nudged back onto its path does not snap back immediately. |

R7 is what makes deviation consequential. Without it, an echo blocked by a live obstacle would
still press plates from wherever it had ended up, and the player's obstacle would be a free
way to re-route memory. With it, a blocked echo has to be *re-earned*.

### The spring cap

The echo spring has stiffness 600. Near its target it is very stiff, and at a deviation of
200 px it demands 120,000 px/s². Explicit integration cannot follow that: a single tick can carry
an echo through a 20 px wall. The spring's acceleration is therefore capped at 2400 px/s²
(`ECHO_MAX_ACCEL`). This is a deliberate fidelity trade: under normal tracking the cap is never
reached, and under obstruction the echo is held back by geometry, as memory should be.
`tests/recording.test.js` covers the blocked-echo case that exposed the bug.

### Why transitions and not levels

If memory wrote a door's recorded state on every tick, a plate that the live world holds
pressed would fight the memory every frame. Writing only transitions gives a clear rule: a
recording says *what happened*, and it happens once, at the moment it happened.

### Why the region limits what is remembered

A recording only remembers what is inside its region. If a ball leaves the region, its track
ends and its echo disappears. This is deliberate: it makes the player choose what to keep, and
it bounds the cost of sampling.

## Levels (`src/levels.js`)

Each level declares `build(world)`, its drop zones, its goal predicate, and its text. Building
the same level twice gives the same ids, so `resetLevel()` can rebuild the world while
keeping the player's recordings. Recordings refer to the same entities by id.

| Level | Introduces | Intended solution |
|---|---|---|
| 01 LATCH | Plates latch doors; the door remembers being open (R2) | Record a ball riding the belt through the gate onto GOAL. Reset. Replay. |
| 02 SHADOW | Lamps are derived; an echo light outlives its lamp (R5) | Record a drop onto plate B. Reset. The echo light lights the sensor. |
| 03 MACHINE | Emitters; echoes shifted by the live machine (R4) | Record emissions. Reset. Slide the emitter along its rail. The echoes land on GOAL. |
| 04 CHORUS | Combining recordings: a single recording is confined to one half of the room (R1, R7) | Record a ball on LEFT in the left half. Record a ball on RIGHT in the right half. Replay both together. |
| 05 PRESENCE | Memory of a door the player opened; presence blocks it (R3) | Clear the doorway, open the gate while recording, clear the doorway again after each reset, then replay. |
| 06 PHASE | Pulses in time: each recording has its own clock (R5, R1) | Record the lamp side and the plate side separately. Wait before dropping to shift a pulse. |
| OPEN LAB | Everything together; no goal | Post-game sandbox. |

Goals are predicates over the live world, evaluated after every tick. The echo-only goals in
levels 01, 02, and 03 cannot be satisfied by live play alone. `tests/solutions.test.js` checks
both the intended solutions and that live play alone does not solve them.

## Touch and phones (`src/main.js`, `src/menu.js`, `index.html`)

- Keyboard and touch share `PLAY_ACTIONS`. The touch bar's buttons call the same functions as the
  keys, so a fix to one applies to both.
- `menuLayout` in `menu.js` gives each menu's top and spacing. `render.js` draws with it and
  `menuItemAt` finds the nearest item under a tap, so the drawing and the tap targets cannot drift.
- The touch bar is shown with `@media (pointer: coarse)` and hidden by `main.js` outside play.
- The portrait hint is a CSS overlay (`(pointer: coarse) and (orientation: portrait)`) that
  dismisses by setting a data attribute.
- The BAR toggle adds a `collapsed` class to the bar; CSS hides the buttons, keeping the toggle.
- The canvas also resizes on `visualViewport` changes, since phone browsers resize the visible area
  when the address bar moves.

## Discoveries screen (`src/menu.js`, `src/render.js`)

- `discoveryLines(found, all)` builds the list: found discoveries show their text, the rest show a hidden
  marker. `render.js` wraps each line to the screen width with `wrapLines`.

## Keyboard play and debug tools

- The keyboard cursor lives in `main.js` (`view.cursor`). G calls the same `game.act` as a click, so the
  two cannot drift apart. The cursor's movement and the timeline's clamping are pure functions in
  `src/cursor.js` and `src/scrub.js`, tested directly. The cursor is drawn over the scene only while playing.
- `game.deleteRecording` refuses while recording or while any playback is running, so a playback
  never holds a recording that has been removed. Selections after the deleted one shift down.
- `game.debugSnapshot()` returns plain data for F4. The world hash in it is the same hash the tests
  use, so a snapshot can be compared with a test run.
- `game.lastLevel` is saved with progress and restored only up to `maxUnlocked`.

## Presentation

- `render.js` draws in world coordinates (960 × 540) under a letterboxed transform. Echoes
  are drawn as dashed cyan rings with a ring-buffer trail that holds the last 24 positions.
  Conflicts flash at the position where they occurred.
- The debug overlay (F3) draws recorded trajectories, region bounds, echo ids and their
  track ranges, and the conflicts of the current tick. The transition timeline can be scrubbed
  with [ ] and { }; `view.scrub` holds the position (null follows the live world) and is kept
  between 0 and the longest recording. The overlay also shows a smoothed frame time.
- Open doors get a soft glow. Colour-blind mode stripes plates. Reduce flashing skips the
  conflict flash rings (`drawFlashes`); everything else still draws.
- `audio.js` synthesizes everything. Positional sounds are panned by world x. Impact sounds
  are rate-limited to one per 30 ms.

## Menus and settings (`src/menu.js`, `src/main.js`)

- `menu.js` is a pure state machine with screens title, levels, settings, controls, pause and
  playing. `activate` returns an action (`begin`, `level`, `resume`, `setting`, ...) that
  `main.js` carries out. The simulation only advances while the screen is `playing`.
- Progress (`maxUnlocked`) and settings are written to `localStorage` under one key, with
  every access wrapped in try/catch so a blocked store never stops the game.
- Colour-blind palette and reduced motion are render-only settings. Reduced motion freezes
  decorative time; flashes and conflict markers keep real time so events stay visible.

## Save codes (`src/save.js`)

- A code is `{ v: 1, progress }` as JSON, UTF-8 encoded and then base64. `decodeSave` checks only
  the shape. `Game.importProgress` runs the snapshot through the constructor, which clamps every value.

## Accessibility hooks (`index.html`, `src/main.js`)

- `#live` is a visually hidden `aria-live` region. `announce()` writes the newest event, and
  `announceMenu()` writes the focused menu item after each menu key.

## Progress and generations (`src/game.js`)

- Lifetime statistics live in `game.stats` and are saved in the progress snapshot. Loaded values
  are checked, so a corrupt save cannot make a counter negative or non-numeric.
- The consistency invariants that `tests/fuzz.test.js` checks after every tick are listed in its
  `assertConsistent` function. Add to that list when a new piece of state needs guarding.

- `game.progress` is the snapshot that is saved: unlocks, discoveries and best times. `main.js`
  compares a signature of it once per frame and saves only when it changes.
- `game.generation` increments whenever the world is rebuilt (level load or reset). The
  presentation layer uses it to set plate and door state silently in a fresh world.
- A recording in progress is discarded on reset or level change, and the game says so.

## Discoveries (`src/game.js`)

- `DISCOVERIES` maps an id to a one-line finding. `discover(id)` records it once and pushes a
  FOUND event. Conflict kinds map to discoveries through `DISCOVERY_FOR_CONFLICT`.
- Ids are kept in `progress.discoveries`. Unknown ids from storage are dropped, so an edited or
  older save cannot break the game.

## Event log layout

- Events are drawn in a 200 px column at x 440 and wrap. The control legend starts to the right of
  that column, so the two never share space. Drawing stops below y 300 so the log stays above the floor.

## Large text

- `setLargeText` sets one font scale in `render.js`. Every `ctx.font` assignment goes through
  `scaleFont`, which multiplies each px size. Layout positions are not scaled.

## Determinism and the state hash

- `hashWorld` is FNV-1a over quantised (×1000) body and fixture state. `tests/determinism.test.js`
  replays each level twice from the same inputs and compares the hash at every tick.

## Performance notes

- Body–body collision is all-pairs, O(bodies²). A uniform-grid broad phase was built and
  measured against an all-pairs reference; at the sizes measured it was slower at every size
  (300 bodies: 1.24 ms vs 0.36 ms per tick; 1000 bodies: 4.89 ms vs 1.92 ms), so it was removed.
  A broad phase may pay off at much larger counts, which have not been measured.
- The renderer creates a few gradients per frame. Echo trails use a fixed ring buffer and
  allocate nothing per tick.

## Known limits of this design

- Body–body collision uses equal masses and no rotation. Bodies are circles.
- Doors are axis-aligned and only open or close. They do not animate through intermediate
  angles.
- Ghost echoes are a single threshold, not a gradient. Their visual fade is continuous, but
  the rule that they cannot press plates is binary.
- Playback only remembers door and emitter transitions. Plates and lamps are derived, so
  their history is not replayed except through the light they produce (R5).
- There is no save-to-disk. Recordings live only for the session.
