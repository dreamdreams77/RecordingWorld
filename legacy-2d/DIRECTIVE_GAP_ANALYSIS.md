# Directive Gap Analysis

This document combines the two development directives for *The World Is a Recording* and records,
for each requirement, what the repository does today. It is a planning document. It does not claim
any requirement is finished unless the status says so.

## Sources and limits

Two directive files were provided. Both are cut off in the copies received:

- **Directive A** ("Master Development Directive — Temporal Reality Simulation") stops inside
  section 11, *Puzzle Design Philosophy*, at "Build puzzles around s".
- **Directive B** ("Claude Game Development Directive") stops inside section 19, *Post-Game
  Sandbox*, at "After completing the campaign, unlock a fully functi".

The text below covers everything that was readable. Where the two directives repeat a requirement,
it is merged once and both sources are noted. Anything after the cut-off points is **not** covered
here and should be supplied in full before planning those sections.

## Status key

- **Done**: implemented, tested, and documented in this repository.
- **Partial**: some of the requirement exists; the gap is described.
- **Not started**: no implementation.

## 1. Creative premise (A §1, B §1–2)

Core ideas to keep, in the directives' own terms:

- The world is a *physical record* of what has happened. Objects, structures and machines carry
  their histories.
- The player does not command reality. They change the conditions under which reality operates.
- Reality does not distinguish between an event happening and an event being remembered.
- The central mechanic is the manipulation of physical history, not time travel.
- A recording is a historical simulation (physical relationships, mechanical operations,
  environmental states), not an animation.

Status: **Partial.** The repository's premise is that recorded echoes are physical bodies that
collide, press plates and open doors, and that conflicts are resolved by explicit rules. Recordings
are physical, but the scope is a small set of 2D rooms, not whole machines and architecture.

## 2. Recording architecture (A §3.1, B §4)

Required: stable entity identity; world position, velocity and relevant physical state; discrete
events (switch changes, machine operations, door locks, trigger entry, connection changes); a
compact temporal representation; several simultaneous recordings without duplicating scenes;
inspectable history; reproducible meaningful behaviour.

Status: **Partial.**
- Done: stable body identities, per-body position and velocity tracks in compact buffers, discrete
  door and plate transitions, multiple simultaneous playbacks, inspectable transitions in the debug
  overlay, deterministic state hashing.
- Not started: recording of angular velocity, rotation, scale, collision configuration, power and
  connection state, audio emission, and environmental influence. The game has no rotating bodies,
  no power network and no audio emitters to record yet.
- Not started: a clear rule for *continuous* versus *discrete* state in the recording format beyond
  door and plate transitions.

## 3. Reconciliation rules (A §4, B §5–6)

Required rule categories: ownership of recorded versus present objects; collision; state
precedence; trigger activation; physical interaction; historical visibility; temporal persistence;
conflicting machine states; repeated event activation; recording termination; several recordings
affecting one entity. Rules must be learnable, predictable, and explainable to the player.

Status: **Partial.** The rules R1–R7 are documented in `docs/ARCHITECTURE.md`:
- R1 *Echo*: recorded bodies become physical echoes held to their memory by a spring.
- R2–R7 cover memory writes, presence, place, light, present, and discord/ghost.
- Done: conflicts are shown in the event log with a one-time explanation per kind.
- Not started: an explicit ownership model for entities that exist in only one historical state
  (A §4 and B §6 both ask for this); general repeated-event rules beyond doors and plates;
  "recording termination" as a rule (recordings currently simply end).

## 4. Interaction modes (A §4.1, B §5)

The directives ask for five modes built from shared systems, not scripted abilities:

| Mode | Directive text | Status |
|---|---|---|
| Historical Projection | a recorded object interacts with present objects without replacing their state | Done (echoes) |
| Historical Influence | a recorded event changes a present system it is connected to | Done for plates, doors, lights and emitters |
| State Conflict | a present object and its historical counterpart disagree, and the conflict is shown and resolved | Partial: conflicts are detected and explained; the visual representation is a flash and a log line |
| Temporal Overlap | two recordings of the same place interact under the same rules | Partial: several playbacks run together; the "two pasts" discovery exists; no dedicated overlap rules |
| Historical Continuation | a captured machine keeps operating after its configuration changes | Partial: recorded emitters keep their schedule; the general machine case is not started |

## 5. Physics (A §5, B §3)

Required: a ball follows its environment by the rules, not a prerecorded path; recorded objects
collide, trigger, influence mechanisms and take part in compound interactions; deterministic where
practical; the game never relies on arbitrary outcomes.

Status: **Done** for 2D rigid circles, walls, belts, doors, plates, lamps, sensors and emitters.
The simulation is fixed-step and deterministic; tests replay each level and compare a state hash at
every tick. **Not started:** rotation, angular velocity, shapes other than circles, and compound
mechanisms such as linkages.

## 6. Graphics (A §6, B §7–8, B §11)

The directives ask for a near-photoreal, physically based 3D renderer with dynamic lighting,
reflections, volumetrics, tone mapping, and a distinct temporal visual language. They explicitly
reject flat lighting, low-poly environments, default materials, a single outline shader as the main
temporal effect, and transparent blue ghosts.

Status: **Not started** for the 3D renderer. The game is a 2D canvas renderer. What exists:
- Done: a vignette, a radial echo halo, drifting dust motes, door glow, plate sinking, ball shadows,
  colour-blind palette with plate stripes, reduced motion, reduced flashing, large text.
- Not started: physically based materials, real-time shadows, reflections, volumetrics, bloom,
  depth of field, tone mapping, colour grading, anti-aliasing options, LOD and instancing.
- Not started: distinct visual treatments for the four temporal states the directives list
  (projection, conflict, reconstruction, stable reconciliation) beyond the current halo and flash.

Required by the directives and still missing: the choice of a rendering technology made for quality
rather than ease (B §8). A decision is needed before any graphics work is planned in detail, because
moving to WebGL changes almost every rendering file.

## 7. Architecture and environment (A §6.2–6.5, B §9, B §12)

Required: impossible architecture; monumental scale; distant structures and atmospheric perspective;
a material library (brushed metal, anodised metal, polished black, rough concrete, frosted and
translucent glass, ceramic, oxidised metal, dark stone, emissive temporal materials, layered
historical surfaces); architectural reconstruction in which a bridge, wall or corridor rebuilds
itself through the simulation rather than fading between scenes.

Status: **Not started.** Each level is a single 960 × 540 room. There is no scale beyond the room, no
material library, and no architectural reconstruction. This is the largest visual gap.

## 8. Procedural systems (B §10)

Required: procedural architecture, mechanical assemblies, temporal reconstruction, spatial
distortion, structural transitions, repeated elements, all supporting authored direction.

Status: **Not started.** Levels are authored by hand as rectangles and circles.

## 9. Camera and presentation (A §6.6)

Required: smooth camera, adjustable sensitivity, camera collision, context framing, interpolation,
interaction targeting, field of view, optional camera shake, adjustable effects.

Status: **Not applicable yet.** The game is a fixed 2D view. Adjustable effects exist through the
settings (reduced motion, reduced flashing, echo trails). Camera work depends on the 3D decision in
section 6.

## 10. Performance and scalability (A §7, B §17)

Required: resolution, quality presets, shadow, post-processing, anti-aliasing, view distance,
particle quality, temporal effect quality, frame limiting, VSync; instancing, culling, batching,
LOD; no uncontrolled memory growth; no per-frame allocation in replay; measured performance and no
fabricated claims.

Status: **Partial.**
- Done: frame time and frame rate are shown in the debug overlay; the simulation caps steps per
  frame; the tests do not depend on wall-clock time.
- Not started: quality presets, resolution and frame-limit settings, any memory measurement, and an
  audit of per-frame allocation in replay. The debug overlay shows frame time only; it does not show
  memory.

## 11. The Recollector interface (A §8, B §4)

Required: an instrument rather than a game HUD (oscilloscope, spectral and drafting styles); recording
volume selection; duration; status; historical timeline; playback controls; object inspection; state
comparison; conflict information; recording selection and management; playback speed; diagnostics.
The player must always be able to tell observing, recording, replaying and reconciling apart.

Status: **Partial.**
- Done: recording volume (region), recording status, a per-recording transition timeline with a
  scrubber, playback speed (1×, 2×, ½×), recording selection and deletion, a debug inspector.
- Not started: an instrument-style visual language (the HUD is a text layout), object inspection by
  click outside debug mode, a state comparison view, and a clear visual distinction between the four
  modes in the directive. The mode is currently shown as a single word, RECORDING or LIVE.

## 12. Audio (A §9, B §16)

Required: spatial audio; reverberation suited to each space; environmental ambience; machine sounds;
recording and playback feedback; temporal interference sounds; historical sound events that interact
with present acoustics; sound that changes when temporal states conflict; original, procedural,
unsettling sound; no copyrighted audio.

Status: **Partial.** Done: all sound is procedural Web Audio with no assets; impacts, plates, doors,
recording and playback have distinct sounds; panning is by world x. **Not started:** reverberation,
per-environment acoustics, historical sound sources that propagate through the present room, sound
that changes with conflict state, and any listening test. Sound has not been checked by ear.

## 13. Campaign (A §10, B §13–14)

Required: 3–5 hours on a first playthrough; a natural tutorial; a complete campaign with six
environments, each introducing a new application of the mechanic:

| Environment | Directive introduces | Current state |
|---|---|---|
| I — The Observation Chamber | recording, playback, historical projection, physical interaction | Partial: levels 1–2 cover echoes, plates, lamps |
| II — The Machine That Remembers | mechanical state, recorded operations, historical influence, multi-object interaction | Partial: levels 3 (emitters) and 4 cover parts of this |
| III — The Architecture of Absence | historical architecture, spatial contradiction, multiple recording volumes, state conflict, reconstruction | Partial: level 5 covers presence conflicts; no architecture |
| IV — The Acoustic World | recorded sound as a gameplay system, sound-driven machines | Not started |
| V — The Infinite Observatory | complex combinations, large-scale simulation, long events, advanced reconciliation | Not started |
| VI — The World Is a Recording | a final sequence built from mastery of the mechanic; no boss; no cut-scene-only ending | Partial: an ending screen and the Open Lab exist; no mechanical finale |

Also required and not started: optional experimental challenges; a complete opening; a post-game
sandbox that is fully functional (partly covered by the Open Lab; the post-game unlock is in the
truncated part of B §19). Length is far short of 3–5 hours: the game has six story levels and one
sandbox, and a first playthrough is a short sitting. Directive B also forbids padding, RPG
leveling and grinding; none of these is present.

## 14. Environmental storytelling (A §6.5, B §15)

Required: history told through the physical world, with little text; rooms that show evidence of
earlier configurations; machines whose current operation differs from their purpose; locations that
look impossible until their history is found; an ending that recontextualises the world.

Status: **Not started** as designed. The levels use text for hints and objectives. No history is
revealed by recording.

## 15. Persistent state (B §17)

Required: save and load the player's progress and the relevant experimental states.

Status: **Partial.** Done: progress (unlocks, discoveries, best times, statistics) is saved in the
browser and can be exported and imported as a save code or file. **Not started:** saving recordings
or the state of a session. Recordings are lost when the page closes.

## 16. Developer mode (A §7–8, B §18)

Required: simulation ticks; recording boundaries; historical trajectories; object histories; state
transitions; active conflicts; reconciliation decisions; collision information; trigger activation;
active recordings; entity counts; simulation and rendering performance; memory where available;
inspection of individual objects; comparison of historical and present states; simulation stepping.
It must not change normal gameplay and must show real data only.

Status: **Partial.** Done: F3 overlay with tick, world hash, body, playback, conflict and echo counts,
recorded trajectories, the transition timeline with scrubbing, the event log, and the snapshot
copy (F4). It does not change gameplay. **Not started:** memory usage, a per-object inspector, a
comparison view of present versus historical state, single-step simulation control, and a
reconciliation decision log (the conflict log exists, but not the decisions behind every outcome).

## 17. Puzzle design (A §11, partly truncated)

Only the opening of section 11 is readable: "The game must not be a collection of arbitrary puzzle
solutions. Build puzzles around s…". The rest is not available. Status: unknown until the full text
is supplied. The six story levels were designed around the reconciliation rules, and each has a
scripted solution that the tests verify. That is evidence against arbitrary solutions, but it is not
a substitute for the directive's own rules, which remain to be read in full.

## 18. Post-game sandbox (B §19, truncated)

Only the first sentence is available: "After completing the campaign, unlock a fully functi…". The
Open Lab is unlocked after the final story level. Status: **Partial.** The rest of the requirement is
not available.

## 19. Quality bar and process

Both directives ask for no fake footage, no fake benchmarks, no fake test results, no unimplemented
systems described as complete, and no placeholder art presented as final. This repository follows
that rule: the README and CHANGELOG list what is not built, and the limitations section is kept up to
date. This document does the same.

## Roadmap

The directives describe a large product. The following order makes each phase testable before the
next depends on it.

1. **Decide the rendering technology** (section 6). This decision blocks most graphics work.
2. **Finish the reconciliation rules** (sections 3–4): an explicit ownership model, recording
   termination, repeated-event rules, and conflict visualisation that is distinct from the flash.
3. **Extend the recording format** (section 2): rotation, connection and power state, audio events.
   Only once there are mechanisms that use them.
4. **Second-order replay** (in the existing notes): a recording that records its own echoes. The
   recorder currently ignores echoes by design.
5. **Campaign content** (section 13): more levels, each with a verified scripted solution, until
   the first playthrough reaches the target length. No level is added without its solution test.
6. **Persistent experimental state** (section 15): save recordings with the progress.
7. **Recollector instrument and developer tools** (sections 11, 16).
8. **Audio as a system** (section 12) and listening tests.
9. **Environments IV–VI and the final sequence** (sections 13–14), after the mechanics they depend on.
10. **Read the truncated sections** (17, 18, and the rest of both directives) and extend this plan.

Each phase should end with the test suite passing, the browser checks passing, and the docs updated
to say what is and is not done.
