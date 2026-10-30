# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `docs/DIRECTIVE_GAP_ANALYSIS.md` combines both design directives with a status for each requirement and a phased roadmap. Both source files were cut off, and the document marks the missing sections.
- Pressed plates sink a few world units and rise again when released, so presses read at a glance. Reduced motion snaps them.
- Large text starts on for a screen narrower than 600 px, unless the player has chosen otherwise. Chosen settings are never overridden.
- Browser checks for the narrow-screen default, and the save-code paths are now checked against what is actually saved on the clipboard and in the save file.
- DISCOVERIES on the title screen lists each discovery's text once found. Unfound ones show as hidden.
- The touch play bar has a BAR toggle that collapses it to one button, so it covers less of the picture.
- The controls screen names the touch controls on a touch screen.
- Each ball has a soft shadow, so it reads as sitting in the room.
- Browser checks for SAVE CODES: copy to the clipboard, download a save file, load one through the browser's file chooser, refuse a bad code, and copy a debug snapshot with F4. Also checks the DISCOVERIES screen and the touch bar toggle.
- Phones and tablets: menu items can be tapped, and tapping the bottom strip or the controls screen goes back.
- On-screen play bar on touch screens, with REC, PLAY, STOP, RESET, UNDO, DEL, ALL, CLEAR, SPEED, HINT and MENU. It hides in menus.
- A portrait phone is offered a dismissible hint to turn sideways.
- The canvas follows the visible area when a phone's address bar moves, and the play bar clears the home indicator.
- An emulated phone check in the browser test: taps the menus, drops a ball by touch, uses the play bar, and checks the portrait hint and sideways scrolling.
- Debug timeline keys are checked in the browser: [ ] and { } move the cursor, and it stops at the end of the longest recording.
- The help screen is in the screenshots (`docs/screenshots/controls.png`).
- `package-lock.json`. A clean `npm ci` installs the same versions, and the tests pass after it.
- Keyboard play: the arrow keys move a cursor, and G acts at it (toggle a door, remove a ball, or drop one in a zone).
- Shift + 1–9 deletes one recording. Refused while recording or while a replay is running. Selections after it shift down.
- Tab cycles speed through 1×, 2× and ½×; the HUD shows the non-default speed.
- F4 copies a debug snapshot (level, tick, world hash, recordings) as JSON for bug reports.
- Save file: DOWNLOAD SAVE FILE and LOAD SAVE FILE on the save screen, using a .txt file of the same text as a save code.
- CONTINUE returns to the last level started, not the furthest unlocked one. The saved progress records it.
- Discoveries for an echo lighting a sensor, an echo pressing a plate, a running emitter, and two
  recordings playing together. There are now nine.
- A (in play) selects every saved recording at once. Covered by the unit and fuzz tests.
- Debug overlay scrubber: with the overlay open, [ and ] move a cursor 10 frames along the
  transition timeline, and { and } move it 60. The line under the timeline names each recording's
  door states at that frame.
- REDUCE FLASHING setting: hides the flash rings drawn at conflicts. Sound and the log still report them.
- Colour-blind palette stripes every plate.
- Open doors have a soft glow behind them.
- The debug overlay shows smoothed frame time in milliseconds and frames per second.
- The SAVE CODES settings entry now opens its own screen, with COPY and LOAD as separate items.
- Z undoes the last dropped ball in the live world. It never removes an echo.
- Level summary after completion: time, whether it is a new best, and the recording count.
- Debug overlay: a transition timeline, one row per recording, with a tick for each door change.
- Save codes (settings): COPY SAVE CODE and LOAD SAVE CODE. The decoding is in `src/save.js`
  and has its own tests.
- Auto-pause when the window loses focus or the tab is hidden.
- Live region (`index.html`) that announces events and the focused menu item to screen readers.
- Level select marks completed levels with a tick.
- Statistics screen shows discoveries found against the total.
- Graphics: a vignette over the scene, a soft halo around each echo, and slow dust motes drifting
  through the room. Reduced motion freezes the motes.
- Statistics screen (title → STATISTICS): recordings made, level completions and time in levels.
  Saved between sessions and cleared by ERASE SAVED PROGRESS.
- Shift+Backspace deletes every recording. Refused while recording, and says so when there is nothing to clear.
- Tab toggles 2× simulation speed. The HUD shows SPEED ×2 while it is on.
- ? opens the controls from play (pausing first) or from the pause menu. Back returns to the pause menu.
- Setting: ECHO TRAILS turns off the fading trail behind each echo.
- Tests: `tests/stats.test.js`. The fuzz test now checks consistency after every tick: selection names
  real recordings, unlocks are in range, progress serialises, counters are non-negative.
- Pause menu: RESTART LEVEL.
- Settings: HINTS SHOWN (starts the hint open), SOUND (saved; M also toggles it).
- Best time per level, saved and shown on LEVEL SELECT ("best 10.0s"). Ticks are counted from the
  last reset, so the time is for the attempt that finished, and a faster attempt replaces it.
- ERASE SAVED PROGRESS in settings. It needs two presses, and moving the cursor cancels the first.
- Seeded random-play test (`tests/fuzz.test.js`): random actions across all levels must keep every
  body finite and inside the room.
- Progress tests (`tests/progress.test.js`).
- Large text setting (multiplies every font size by 1.3). Positions are unchanged, so very large
  text can crowd the HUD.
- Hidden discoveries. Each conflict kind is found the first time it happens, and entering the Open
  Lab is found too. Discoveries are shown in a FOUND event and counted on the title screen, and they
  are saved between sessions. Tested in `tests/discovery.test.js`.
- Browser test `tools/e2e.mjs` (`npm run e2e`). It drives the page with real mouse and keyboard
  input, solves level 1, and can regenerate screenshots into `docs/screenshots/` from the canvas.
- CI workflow: unit tests plus a reproducible-build check.
- Menus: title, level select, settings, controls and pause, driven by a pure state machine (`src/menu.js`) and tested in `tests/menu.test.js`.
- Settings for reduced motion and a colour-blind palette, saved in the browser.
- Saved progress: the furthest unlocked level is kept in the browser.
- Developer overlay inspector: hovering the scene shows the body, echo or door under the pointer.
- State hash (`hashWorld`, FNV-1a over quantised state) and per-level determinism tests that replay each level twice and compare hash traces.
- Level 05 PRESENCE: a gate with no plate that only memory can open, held back by a body in its doorway.
- Level 06 PHASE: a sensor's light pulse and a plate's weight pulse must coincide across recordings.
- Revealable hints (H). Hints are wrapped and shown bottom-left.
- Plain-language explanations for each kind of conflict, shown in full the first time each occurs.
- Clicking a loose ball removes it from the world.
- A ghost-transition conflict event, so the explanation for ghosting is shown when it happens.
- Reconciliation rule R7 (*discord*): echoes that stay off their memory build discord and become
  ghosts. Ghosts are drawn faint and cannot press plates until they regain coherence.
- Level 04 CHORUS, which can only be solved by combining two recordings confined to different
  halves of the room. The ending now follows the final story level (PHASE).
- Tests for the discord rule and for the chorus solution, including the single-recording
  negative case.

### Changed
- Loading a save file uses one hidden file input for the page, instead of creating one each time. This is simpler, and the browser check can exercise the real import without the native file dialog.
- The save-file and clipboard checks in the browser test read the real results, rather than waiting for a message.
- Starting settings are computed by one pure function, `startingSettings` in `src/settings.js`.
- Keyboard and touch play share one set of actions (`PLAY_ACTIONS` in `main.js`), so the two cannot disagree.
- Menu layout (where each item sits) is one function, used both to draw the menu and to find the item under a tap.
- The click and G actions are one game verb, `game.act`, instead of logic in `main.js`.
- Cursor movement and timeline clamping are pure functions in `src/cursor.js` and `src/scrub.js`.
- The README states the tested Node version (22, as CI runs), not an untested minimum.
- Settings and save-code menus space their items to fit the longer list.
- The fuzz test includes a select-all action.
- Settings and progress persistence now go through one place in `main.js`: a single signature
  decides whether to save, instead of separate counters.
- Pointer release while paused no longer drops a ball or commits a region.
- Enter on a completed level advances silently; the completion chime plays once, on completion.
- Clearing the region is on **C** (was Esc). Esc now opens the pause menu.

### Fixed
- README said the colour-blind palette and reduced motion were not implemented. Both exist; the limits section now says what the palette covers.
- The menu announcer called the menu lookup on the playing screen, which has no menu. Found by the
  browser test. It now returns early during play.
- A damaged unlock value in a save (for example a string) made the unlock count NaN. Only whole numbers
  count now, and anything else means nothing is unlocked.
- Importing a save could keep unknown discoveries or unlock beyond the last level. Imports are now
  checked field by field.
- Clicking a door played its sound twice (once on click, once on the state change). It now plays once.
- Resetting or changing level during a recording discarded it silently. The game now says
  RECORDING DISCARDED.
- A region that was too small was dropped with no message. The game now says REGION TOO SMALL.
- Plate and door sounds fired when a level or reset rebuilt the world. A rebuilt world now sets its
  starting state without sounding.
- The keyboard shortcut check for recordings 1–9 compared strings by range, which also matched
  some other keys. It is now an exact match.
- Dead code removed: `Game.recordingKeys`, `Game.sandboxOccupied`, `sim.rectOccupied`,
  `menu.SCREENS`, and an unused import in `render.js`.
- The event log ran into the right-hand control legend and let long messages run off the screen.
  Events now wrap in a 200 px column between x 440 and 640 (found in the generated screenshots).
- **Memory was written into stale objects after a reset.** Playback bound fixture tracks to the
  objects of the world in which the recording was made. After `resetLevel()` rebuilt the world,
  memory writes landed on objects nobody was looking at. Playback now binds each fixture to the
  object with the same id in its own world. Level 1 had passed only because its echo latched the
  gate live.
- A body touching a door did not count as standing in its doorway. Touching now counts.
- An echo could be launched through a thin wall by its own spring. The spring's acceleration is
  now capped (`ECHO_MAX_ACCEL`).

### Removed
- A uniform-grid broad phase was prototyped, checked against an all-pairs reference, and removed: it was slower than all-pairs at every size measured (300 bodies: 1.24 ms vs 0.36 ms per tick; 1000 bodies: 4.89 ms vs 1.92 ms).
## [0.1.0] - 2026-10-29

### Added
- Deterministic fixed-step 2D simulation core (`src/sim.js`): gravity, circle–rectangle
  collision with restitution and ground drag, circle–circle collision, belts, plates,
  latching doors, lamps, light sensors, and emitters.
- Recording system (`src/recording.js`): region-bounded recording of bodies and fixture
  state, one track per entity, stored in compact `Float32Array` buffers.
- Playback with reality reconciliation: echo bodies driven by a spring toward their
  recorded path (R1), memory writes for fixture transitions (R2), presence blocking with
  deferred writes (R3), emitter placement from present while timing and path come from
  memory (R4), and echo light (R5). See `docs/ARCHITECTURE.md`.
- Four levels: LATCH, SHADOW, MACHINE, and the open-ended OPEN LAB sandbox.
- Headless `Game` controller (`src/game.js`) that exposes every player verb and is used
  by the tests.
- Procedural audio (`src/audio.js`): impacts, plates, doors, recording and playback
  cues, conflict tones, and an ambient bed. No sample files.
- Canvas 2D presentation (`src/render.js`): instrument-style HUD, ghost echoes with
  trails, region brackets, conflict flashes, and a debug overlay toggled with F3.
- Automated tests: simulation unit tests, reconciliation tests, and scripted playthroughs
  of every level's intended solution.
- Zero-dependency dev server (`npm start`) and a static build (`npm run build`) with a
  content-hash manifest.
