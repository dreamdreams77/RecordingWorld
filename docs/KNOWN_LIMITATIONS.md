# Known limitations

This file separates three things, because they are easy to blur:

* **Confirmed limitations** — true by design or by measurement.
* **Tested only in software** — checked, but only in a software-rendered browser or in code, not on the real thing.
* **Never tested** — nobody has done this at all.

The pre-release audit (`docs/AUDIT.md`) describes how the automated side was checked.

## Never tested
* **Human play.** No person unfamiliar with the project has played it. The "3–5 hours" target is a guess: the scripted solver finishes the six chapters in about 4–6 minutes of simulated play. Whether the teaching, hints and difficulty work for a new player is unknown.
* **Sound heard by a person.** Audio has been analysed, not listened to (see below). Whether the mix is pleasant, whether the ambience is too loud against the cues, and how it sounds on phone speakers are all unknown.
* **Real GPUs.** All rendering checks ran in software-rendered Chromium (SwiftShader). Frame rate, the High/Ultra presets (ambient occlusion, 4× MSAA, 4096 shadow maps) and the adaptive-resolution governor on real hardware have not been measured.
* **Real phones and tablets.** Touch controls are tested with synthetic touch events in desktop Chromium (including CDP touch). Real devices, real thumbs, real browsers' gesture handling and real mobile GPUs have not been tried.
* **Real mouse pointer-lock** in a user-driven session (tests drive input through the game's own input layer and real keyboard events, not a physical mouse).
* **The deployed site.** The Pages workflow succeeds; the live page has not been opened by anything that could report what it shows.

## Test-suite caveats
* `e2e/keyboard-real.mjs` measures real wall-clock behaviour (records for ~0.9 s, holds a key for 1.2 s). On a CPU-starved machine (several software-rendered browsers at once) the game deliberately slows simulation time, and its "recording has real length" and "holding . accelerates" checks fail. They pass 25/25 when run alone. Run the browser suites one at a time.
* `e2e/touch.mjs` "tapping the view pins the volume" depends on the down and up events arriving within the game's 350 ms tap window; the harness now sends them together.

## Tested only in software
* **Audio.** Every instrument cue is rendered offline through the real engine and measured: one scale (D minor pentatonic), sine/triangle plus band-passed hiss only, loudness within about 2 dB across cues, no clipping, none silent, cues dropped while paused, voices released on chapter change. That proves consistency, not quality.
* **Visuals.** Chapters were inspected in screenshots from software rendering at low/medium quality, at 360×640, 412×915, 800×450, 1280×720 and 1920×1080 for the UI.
* **Memory.** GPU resource counts stay flat over 24 chapter loads and the JS heap is stable in a soak run; long human sessions have not been observed.

## Confirmed limitations
### Visual
* Chapter VI has a very bright floor strip, Chapter V a very bright beam cone, and Chapter IV is dim. These were reported by the audit and are being addressed in the presentation pass; check `CHANGELOG.md` for whether a fix has landed and has been confirmed by eye.

### Simulation and physics
* Physics is AABB-based: no rotated or rolling bodies. Mirrors reflect only on the horizontal plane at 45°.
* Echo bodies are kinematic: present objects cannot push them (they push and carry present objects). A body carried or shoved by an echo moves at most 3 m on one axis per tick (a deliberate guard against the collision clamp throwing bodies across a level).
* Starting an echo of yourself while standing in it shoves you out along the shortest axis (up to 3 m). This is the documented displacement rule.
* Only one recording can be captured at a time.
* At fast playback rates the first or last frame of a recording can be skipped by the sampling stride.
* Actors are scripted figures: they walk, hum and can be recorded, but do not react to the player.
* Moving hazards are timed obstacles solved by jumping or waiting. There is no pursuit or enemy behaviour.
* The Chapter II Dead Field has two verified routes. The Well and the Prism Hall have one intended mechanic each (the Prism Hall has two verified timings of it).

### Saving
* Saves live in `localStorage` (about 5 MB browser limit). Long recordings in many slots may not fit, and the game says so.
* Recording rollback history and rewind captures live in memory for the session and are **not** saved.
* Canonisation consumes the slot; only rewinding or rolling the slot back undoes it. Choices persist in the save (`progress.canon`) and apply on the next load of later chapters. A chapter already in progress does not re-apply them.

### Input
* Keyboard + mouse and touch are supported. **Gamepads are not supported.**
* The sandbox holds at most 60 placed objects (more exceeded the frame budget in testing).

### Things that are by design, not defects
* A frozen singing echo sustains its note.
* A replay never rewinds the world; it is reconciled with the present by the rules in `RECONCILIATION.md`.
