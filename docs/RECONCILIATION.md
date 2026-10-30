# Recording and reconciliation

This document is the contract between the simulation and the player. Everything here is implemented in
`src/sim/` and exercised by `tests/`.

## What a recording is

A recording is **not an animation**. While recording, the simulation samples, every fixed tick (60 Hz), the
complete *state vector* of every entity whose bounds overlap the pinned volume (`src/sim/recorder`, see
`Recorder.capture`). A state vector is the channel list declared by the entity type in `src/sim/types.js`:
position and velocity for bodies, `s` (openness) for sliders, `omega` for flywheels, `charge` for resonators,
`rot` for mirrors, `lit` for sensors, `tone` for the player's voice, and so on.

* Storage: per entity a `Track` of **change-compressed keyframes** (a keyframe is written only on a tick where
  some channel or the "inside the volume" flag differs from the previous one). Lookup is a binary search;
  sample-and-hold is lossless at 60 Hz. Diagnostics (F3) show real keyframe counts against the raw size.
* Membership: an entity exists in the recording for the ticks during which it was inside the volume
  (bodies by centre; doors/bridges/conveyors by any overlap).
* Identity: entities keep stable string ids. A track also stores a template of the entity definition so history
  can contain things with **no present counterpart** (archive tapes).
* What is *not* recorded: the echoes themselves. A recording captures the *reconciled effect* of echoes on present
  entities (a door that an echo opened is recorded open), never the echo bodies, so recordings can be layered.

## Playback

Each slot owns a `Playback` with a head, rate (±), and a mode: `once`, `loop`, `ping-pong`, `hold`
(freeze on the final frame and stay in the world). Playback is *state-driven*: each tick the echo layer's
entities receive the recorded state for the head position. Echoes are **physical**: they have colliders, press
plates, block light, emit sound and carry present bodies standing on them.

## The reconciliation rules

Each tick the world is the union of the **present layer** and one **echo layer per active playback**.

| # | Rule | Applies to | Behaviour |
|---|------|-----------|-----------|
| R1 | **Matter** | bridges, lifts, walls, crates, bodies, mirrors | Solids from every layer are physically present: a collider exists wherever *any* history put one. |
| R2 | **Apertures** | doors (`slider` mode `door`) | A doorway that *any* history holds open is open for everyone. The present door is shown "overruled". |
| R3 | **Signals are monotone** | plates, levers, gates, sensors, resonators, sliders (complete), emitters | The reconciled output of an id is the **OR (max)** over layers. History can add power but never remove it. Use `!id` (NOT) inputs to make history subtract. |
| R4 | **Superposition** | flywheels | Histories **add**. `gt` gates compare the sum (e.g. echo 1.0 + live 1.0 = 2.0). |
| R5 | **Light and sound use reconciled geometry** | beams, resonators | Emitters from all layers shine/sing; beams and sound travel through the union of solids (closed doors block, glass dims sound). Mirrors of the same id in several histories count once. |
| R6 | **Temporal collision** | present bodies vs echo/moving matter | A present body overlapped by echo matter is shoved out along the axis of least penetration (and may be carried by it). Unresolvable squeezes become a *crush* and return the player to the checkpoint / crate to its home. |
| R7 | **Coherence** | each playback | Overlapping matter from different histories (other than the same entity) drains the involved playbacks' coherence in proportion to overlap volume; coherence regenerates when calm. At zero the echo **collapses** (the recording is kept). Low coherence shows as dropout bands and screen tearing. |
| R8 | **Ownership** | all | The same id in several layers is one logical entity with several histories; its state disagreement is reported as a `state` conflict (gold outline in game, listed in the inspector). |

| R9 | **Canon outranks apocrypha** | ledgers (`World.canonize`) | Entering a recording in a *ledger* makes its final frame **present reality**: tracked present entities adopt the recorded state (sliders are pinned there — even pinned shut), history-only matter is built for real, and every id the recording touched is **sealed**: it ignores all echoes of itself from then on. This is the only way history can *subtract* (besides negated wires). It is consumed from the slot, recoverable only by rewinding (F6) or rolling the slot back. |
| R10 | **History does not wear** | `crumble` | A crumbling floor wears out under load in the present (and stays worn). An echo of it keeps the integrity it was recorded with, so a recording of the intact floor, held, carries weight the present floor can no longer bear. |
| R11 | **Hazards are matter that hurts** | hazard sliders | Any history's hazard zaps present bodies on contact. Echoes of hazards are not safer than the present. |

Sinks (`slider`, `flywheel`, `gate`, `lamp`, `emitter`, `beam`, `conveyor`, `mirror`) read the *previous tick's*
reconciled signals (`def.in`, AND by default, `logic:'or'` for OR, `!` prefix to negate).

## Time as a control

Playback has a signed **rate** (0.25–4×), a **head** that can be scrubbed, and modes `once / loop / ping-pong / hold`; `U` starts
every slot on the same tick. Machinery cares about all of these: the *tempo locks* (`resonator.tempo`) accept a melody only when
its notes arrive 20–36 ticks apart, so a carillon recorded and played in reverse at ×2 (or slowed to ×0.25) opens locks the
forward recording never could; the Prism Hall needs two histories half a cycle apart (scrub the head to the middle); the beat bridges
need recordings started 800 ticks apart. `hold` is how history persists; `reverse` is how a descent becomes an ascent.

## Recovery

* **Recording rollback** — every slot keeps its last four takes (overwrite, erase, tape load, canonisation): `Shift+Backspace`.
* **Rewind (F6)** — `World.capture()/reinstate()` snapshot the whole world every 5 s and before every ledger decision (recordings are
  immutable and shared, so captures are cheap); the oldest of the last 24 captures is two minutes back.
* **Section reset (Shift+K)** — restores the world as it was when the section began, keeping the recordings you made; the reset itself can be rewound.
* `K` returns to the checkpoint and recalls crates; checkpoints are saved automatically when a section begins.

## Archive tapes

A tape is generated by **simulating an alternate history** with the same `World` class (entities with
`era:'past'`, optional scripted state changes and scripted "ghost" Recollectors), recording a volume of it, and
loading the result into a slot. A tape therefore obeys every rule above; there is no special-case playback.
Examples: a staircase descending into place (Ch. III), an operator standing on an unreachable plate, two
conflicting surveys of one bridge.

## Determinism

Fixed 60 Hz step, no wall-clock or random use in `src/sim/`. `World.hash()` hashes all entity states, playbacks
and recording sizes. Tests assert identical hashes for identical inputs, and that
`snapshot() → JSON → restore()` reproduces the exact future (this is also how saving works).
