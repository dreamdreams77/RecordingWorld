# Architecture

```
src/
  sim/        deterministic simulation — no DOM, no three.js, runs in Node
    math.js        boxes, rays, hashing
    types.js       entity type registry (state-vector layout, colliders, behaviour hooks)
    world.js       the tick: playbacks → control → machines → solids → physics → fields → signals → conflicts → recorder
    recording.js   Track (change-compressed keyframes), Recording, Recorder, Playback
    fields.js      light beams and sound propagation through reconciled geometry
    archive.js     archive tapes = recordings of simulated alternate histories
    director.js    campaign layer: sections, checkpoints, caps unlocks, discoveries, experiments, tapes, finale
    bot.js         headless player using the real controls (used by tests and the benchmark)
  levels/     plain-data levels (ch1…ch6, sandbox) built with builder.js helpers
  render/     three.js: procedural textures, PBR material library, echo/conflict shaders,
              entity views, effects (beams, conflicts, frame, sound field), sky, scenery, post-processing
  audio/      Web Audio: spatial voices driven by simulation state, tape-processed historical sound
  ui/         HUD (instrument), menus, styles
  game/       Game (loop, input mapping), Input, settings, progress/save
tests/        node:test — simulation unit tests, per-chapter bot solutions (campaign.test.js), benchmark
e2e/          Playwright smoke test in real Chromium
```

## Separation of concerns

* **Simulation** knows nothing of rendering. Rendering reads `world.aliveList`, `world.solids`, `world.beams`,
  `world.conflicts`, `world.sources` each frame and never mutates them.
* **Temporal recording / playback / reconciliation** live in `recording.js` and `world.js` (see
  RECONCILIATION.md). **Physics** is `World.physics/moveBody/depenetrate` (AABB rigid bodies, carry, push,
  step-up, centre-of-mass slip).
* **Level management / campaign progression**: levels are data; `Director` adds sections, checkpoints and
  unlocks. `progress.js` stores progress and snapshots (localStorage, guarded).
* **Developer tools** (F3/F4) display real data: tick, world hash, solid/conflict counts, per-recording
  keyframes and compression, playheads and coherence, trajectories of recorded bodies, recorded volumes.

## Rendering

* Procedural PBR textures (albedo / ORM / normal) synthesised from tileable noise at start-up; box UVs are
  in world metres so texture density is uniform.
* Visual language: **present** = crisp cold PBR; **history** = opaque "emulsion" projections (duotone, laminar scan
  slices, dissolving reconstruction front); **conflict** = white-hot moiré shells; **reconciled** = gold hairlines.
* Planar reflection for polished floors (own oblique-clipped mirror pass), PCF shadows following the player,
  fixed pool of point lights (no shader recompiles), exponential fog, light-shaft cones, dust motes,
  instanced architecture (ribs, columns, gears, rings, frames), MSAA + GTAO + bloom + custom grade pass
  (chromatic aberration, interference tearing, split toning, vignette, grain, daltonisation, emulsion reveal).
* Quality presets Low → Ultra scale texture size, shadows, AO, reflections, MSAA, particles, scenery density and
  pixel ratio.

## Audio

All sound is synthesised. Voices (emitter tones, flywheel hum, conveyor, sliders, the player's voice) are
created/retired from simulation state each frame and positioned with HRTF panners. Echo voices pass through a
tape chain (band-limit, saturation, flutter, wetter reverb). Conflicts and lost coherence add a beating,
crackling "interference" voice.
