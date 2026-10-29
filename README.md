# The World Is a Recording

> You do not control a character. You control the world's memory.

*The World Is a Recording* is a reality-simulation puzzle game in which you are an experimental
machine that can record a patch of the physical world, store it, and replay it. A replay does not simply
rewind time. The world tries to reconcile what it remembers with what is true now, and the
contradictions between the two are the puzzles.

The whole game is plain JavaScript and Canvas 2D. It has no runtime dependencies, no
external assets, and no music files. Every sound is synthesized.

## Quick start

You need Node.js 22, which is what CI runs. Older versions may work but have not been tested. There is nothing to install to play.

```sh
npm start          # serves the game at http://localhost:8080
```

Open that address in a modern browser (Chrome, Edge, Firefox, or Safari). Click once on the
game to enable audio.

To run the test suite:

```sh
npm test
```

To produce a static, hash-manifested build in `dist/`:

```sh
npm run build
```

`dist/` contains the complete game and can be served from any static host.

## Controls

| Input | Action |
|---|---|
| **Drag** on the scene | Select a recording region. Only what happens inside it is remembered. |
| **Right-click** or **C** | Clear the region |
| **Space** | Start recording the region. Press again to stop and save. |
| **Click** in a drop zone | Drop a ball |
| **Click** a door | Open or shut it |
| **Click** a loose ball | Remove it from the world (echoes cannot be removed) |
| **Drag** an emitter's nozzle along its rail | Move the machine |
| **1–9** | Select or deselect a saved recording |
| **P** | Replay every selected recording, starting now, alongside the live world |
| **S** | Stop all replays |
| **X** | Reset the level to its starting state (recordings are kept) |
| **Backspace** | Delete the most recent recording |
| **Shift + Backspace** | Delete every recording |
| **Z** | Undo the last dropped ball (the live world only; recordings keep what they captured) |
| **Tab** | Cycle simulation speed: 1×, 2×, ½× (shown in the HUD) |
| **Arrow keys** | Move the keyboard cursor (shown as a crosshair) |
| **G** | Act at the cursor: toggle a door, remove a ball, or drop a ball in a zone |
| **Shift + 1–9** | Delete that one recording (refused while recording or while a replay runs) |
| **A** | Select every saved recording |
| **?** | Show the controls. From play it pauses first; Back returns to the pause menu. |
| **Enter** | Continue after an objective is complete |
| **H** | Show or hide the level's hint |
| **F3** | Toggle the developer overlay |
| **F4** | Copy a debug snapshot as JSON: level, tick, world hash and recordings |
| **[ ]** / **{ }** (overlay open) | Move the timeline cursor 10 / 60 frames back or forward |
| **M** | Mute |
| **Esc** | Open the pause menu (from the pause menu, Esc resumes) |
| **↑ / ↓ / Enter / Esc** | Navigate menus |

Recordings are selected automatically when they are saved.

### Phones and tablets

The game runs in a phone's browser with touch only. Tap the menu items to choose them, as you would
with the keys. While playing, a bar along the bottom gives the play controls: REC, PLAY, STOP,
RESET, UNDO, DEL, ALL (select the whole room as the region), CLEAR, SPEED, HINT and MENU. Drag
across the room to select a region, tap a drop zone to drop a ball, and tap a door or ball to
change it, just as with the mouse. The bar only shows on touch screens and hides in menus. BAR ▾ above it collapses the bar to that one button, so it stops covering the picture; BAR ▴ opens it again.

The world is drawn to fit the screen, so it is most readable turned sideways. A portrait phone is
offered a suggestion to turn it, which can be dismissed. Tapping the bottom strip of a menu, or
any part of the controls screen, goes back.

Phones have no keyboard, so the on-screen bar is the only way to use the play controls there. The
bar covers the bottom of the picture on a short screen.

### Menus, settings and progress

The game opens on a title screen with BEGIN (or CONTINUE once a level is complete, which returns to the level you last started), LEVEL SELECT, SETTINGS, STATISTICS, DISCOVERIES and CONTROLS. DISCOVERIES lists each discovery's text once you have found it; the rest show as hidden. Levels unlock as you complete them. The furthest level, the best time for each level, and your discoveries are saved in the browser. The pause menu (Esc) offers RESUME, RESTART LEVEL, LEVEL SELECT, SETTINGS and TITLE. STATISTICS on the title screen shows recordings made, level completions and time spent in levels.

SETTINGS holds:

- **Reduced motion** freezes decorative animation. Outcomes such as flashes still show.
- **Colour-blind palette** swaps the red and green doors for orange and teal, and stripes every plate so plates are told apart by pattern too.
- **Large text** multiplies every font size by 1.3. Positions do not change, so very large text can crowd the HUD.
- **Hints shown** starts each level with its hint open.
- **Sound** turns sound off. M toggles it during play.
- **Echo trails** turns off the fading trail behind each echo.
- **Reduce flashing** hides the flash rings drawn where a conflict happens. The sound and the event log still report it.
- **Save codes** opens a screen with four actions. **Copy save code** puts your progress on the clipboard as a short text string. **Load save code** pastes one in and replaces your progress. **Download save file** saves the same text as a .txt file, and **Load save file** replaces your progress from one.
- **Erase saved progress** clears unlocks, discoveries, best times and statistics. It needs two presses.

Storage is optional. If the browser blocks it, the game still runs and progress is simply not kept.

Large text is on by default on a screen narrower than 600 px, such as a phone held upright. Any choice you make in SETTINGS is kept, and is never overridden.

## How to play

A recording is a memory of what happened inside its region. Replays put that memory back into
the world, and the world responds. Four things matter:

1. **Echoes are physical.** A replayed ball is an echo. It follows the path it remembers, but it
   still collides with the world. It can push things and press plates. If something blocks its
   path, it deviates from memory, and the game shows a contradiction. An echo that stays
   off its memory long enough loses coherence and becomes a *ghost*: faint, and unable to press
   plates until it is back on its path.
2. **Doors and machines remember transitions.** When a recording shows a door opening, that
   opening is replayed at the same moment. If something is standing in the doorway, the memory
   waits until the doorway is clear.
3. **Light outlives its source.** A lamp that was lit in a recording still shines in the replay,
   even if the lamp is now dark.
4. **Machines keep their rhythm, but move with you.** An emitter's echoes keep the timing and
   path they were recorded with, but they start from where the emitter is now.

### Levels

| # | Title | Idea |
|---|---|---|
| 1 | LATCH | Plates latch doors open, and the door remembers. |
| 2 | SHADOW | A recorded light can light a sensor after its lamp has gone dark. |
| 3 | MACHINE | Slide the emitter, and its recorded emissions land somewhere new. |
| 4 | CHORUS | One recording holds one half of the room. Two replays must sound together. |
| 5 | PRESENCE | A gate with no plate. Only memory can open it, and a body in the doorway holds memory back. |
| 6 | PHASE | A sensor's light pulse and a plate's weight pulse must coincide. Timing is set by when you drop. |
| — | OPEN LAB | After the ending: no goal, everything at once. |

The game is designed to be learned by experiment. The HUD states each level's objective. Each
level's hint is in `src/levels.js`, and this README does not spell out the solutions.

## Developer tour

Start here:

- `src/sim.js`: the deterministic physics. Read this first.
- `src/recording.js`: recording, playback, and the reconciliation rules R1–R6.
- `src/game.js`: the headless controller. Every player verb is a method here.
- `src/levels.js`: level definitions and goal predicates.
- `tests/solutions.test.js`: each level's intended solution, played through the controller.

`docs/ARCHITECTURE.md` explains the design and each reconciliation rule in detail.
`CONTRIBUTING.md` lists the ground rules.

## Accessibility

- A visually hidden live region announces events and the focused menu item, so screen readers
  follow the game. The canvas is labelled.
- Pausing is automatic when the window loses focus or the tab is hidden.
- Large text, reduced motion, a colour-blind palette, hints shown by default, and sound off are all
  in SETTINGS.

## Screenshots

These are generated from the game's own canvas by `npm run e2e -- --screenshots`, not hand-made.

| | |
|---|---|
| ![Title](docs/screenshots/title.png) | ![Settings with large text](docs/screenshots/settings-large-text.png) |
| ![Level 1 while recording](docs/screenshots/level-01-recording.png) | ![Level 1 complete](docs/screenshots/level-01-complete.png) |
| ![Pause menu](docs/screenshots/pause.png) | ![Debug inspector](docs/screenshots/debug-inspector.png) |

## Tests and CI

- `npm test` runs the unit tests: physics, recording and reconciliation, menus, discoveries, and
  a scripted solution for every story level. The determinism tests replay each level twice and
  compare a state hash at every tick.
- `npm run e2e` opens the game in headless Chromium and plays level 1 with the mouse and
  keyboard, then checks the menus, settings, pause, the keyboard cursor, the debug timeline keys
  and recording deletion. It needs the dev dependencies
  (`npm ci` installs them from the lockfile), or set `CHROME_PATH` to a Chrome binary. Pass `-- --screenshots` to regenerate
  `docs/screenshots/` from the game's canvas.
- `.github/workflows/ci.yml` runs the unit tests and checks that two builds produce identical
  manifests.

## Repository layout

```
index.html                 page shell (one canvas)
src/
  main.js                  input, frame loop, wiring
  game.js                  headless controller
  sim.js                   deterministic simulation
  recording.js             recording, playback, reconciliation
  levels.js                level definitions
  render.js                Canvas 2D presentation and HUD
  audio.js                 procedural Web Audio
tests/
  sim.test.js              simulation unit tests
  solutions.test.js        scripted playthroughs and progression
tools/
  serve.mjs                zero-dependency dev server
  build.mjs                static build with manifest
docs/
  ARCHITECTURE.md          technical design
  DIRECTIVE_GAP_ANALYSIS.md  combined design directives vs. this repo, with a roadmap
```

## Known limitations

This is an honest list. See `CHANGELOG.md` for what has changed. The full gap against the two
design directives, including which sections of each were cut off in the source files, is in
`docs/DIRECTIVE_GAP_ANALYSIS.md`.

- **Length.** The game has six story levels and one sandbox. A first playthrough takes a short
  sitting, not the three to five hours the design brief asked for. More levels, each with a
  verified solution, are the most valuable next step.
- **Not built yet.** Second-order replay (replays that record their own echoes) is not implemented;
  the recorder ignores echoes by design. Experimental challenges are not implemented. The hidden
  final sequence exists only as the discoveries and the ending screen.
- **Shapes.** Bodies are circles. Walls and doors are axis-aligned rectangles. There is no
  rotation, and doors open or close instantly rather than over time.
- **Plates.** A pressed plate sinks 3 world units for show. Collision uses the plate's resting
  position, so a ball can look slightly sunk into a pressed plate.
- **Persistence.** Progress is kept in the browser and can be exported as a save file. Recordings
  last only for the session; they are not part of a save.
- **Performance.** Collision between bodies is all-pairs. Levels stay under about 100 bodies,
  which is comfortable. Larger scenes need a broad phase.
- **Frame-rate sensitivity in the browser.** The simulation is deterministic per tick, but the
  browser runs it at whatever rate the frame loop delivers. On very slow machines, time passes
  more slowly relative to the wall clock.
- **Audio.** Panning is stereo only. Procedural sounds are simple by design. They have never been
  listened to on real hardware; they are checked only by their code.
- **Phones.** The browser checks run in emulated Chromium. They have not been run on real iPhone
  or Android devices, and the on-screen play bar has not been looked at on a phone screen. The
  world is small on a portrait phone, so it is best played sideways.
- **Accessibility.** Colour carries meaning (cyan for echoes, amber for present light, red for
  shut doors). The colour-blind palette changes the doors and stripes the plates, but echo and
  present light are still told apart by colour alone.
- **Testing scope.** The automated tests cover the simulation, the reconciliation rules, and the
  intended solution of each level. The browser checks drive the page in headless Chromium, on
  desktop and emulated phone. There is no automated visual regression testing, and CI has not run
  on GitHub.

## Licence

MIT. See `LICENSE`.
