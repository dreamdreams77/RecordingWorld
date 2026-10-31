# Pre-release audit

Scope: the current development branch, audited as QA engineer, gameplay programmer and technical artist. Nothing here was merged, pushed to `main` or deployed.
Method: build adversarial tests first, find what they break, then fix. A passing test is evidence only if it can fail — the fuzzer was mutation-checked (four deliberate breaks: load forgetting omissions, a stale echo after `setHead`, an off-by-one reverse start, a drifting sample — all caught).

## Confirmed bugs

### High
| # | Bug | Found by | Status |
|---|-----|----------|--------|
| H1 | **Collision clamp tunnelling.** A body already inside echo matter (an echo of you appearing on you) moving upward was clamped to the *underside* of the echo — inside the floor — and the next clamp moved it to the far face of the floor slab: 30 m across the level. | fuzzer, sandbox | fixed (a clamp may move a body at most 3 m; the overlap is resolved by depenetration) |
| H2 | **GPU resource leak.** Changing chapter did not free scenery/effect geometries, materials, textures, post-processing targets or the environment map: 197 → 1,273 geometries and 65 → 272 textures after 24 loads; JS heap +21 MB. | browser memory suite | fixed (flat after 24 loads) |
| H3 | **Ghost ≠ commit.** The preview drew canon-sealed history that real playback refuses to create. | `instrument.invariants` | fixed |
| H4 | **Lost taps.** Jump (and note) were read as "held at frame start"; a tap pressed and released between two frames never registered. | real-keyboard browser run | fixed |

### Medium
| # | Bug | Status |
|---|-----|--------|
| M1 | Moving an echo's head with `scrub`/`setHead`/`play` left its state one tick stale (`stepHead`/`playFrom` were correct) | fixed |
| M2 | An object removed from the world during a recording stayed in the echo, frozen, for the rest of the recording | fixed |
| M3 | The six recording colours were invisible on the echoes; reversed/slowed/solo looked like normal playback | fixed (verified by eye in Chapters I, IV, VI) |
| M4 | Preview cursor outlived its recording (tick 80 on a 13-tick take); `scrubTo(NaN)` poisoned the cursor | fixed |
| M5 | Hints for the Prism Hall and Blind Eye described scrubbing with controls that no longer behave that way | fixed; Shift-hold reaches tick 300 in ~2 s (tested) |
| M6 | Sandbox: unlimited objects. 80 crates × 6 echoes cost 8 ms/step (p99 13.6); 120 crates exceeded the frame budget | capped at 60 (tested within budget) |
| M7 | Sandbox editing keys B and X were also note keys (editing sang, and resonators heard it) | rebound to I and Shift+Del |
| M8 | Portrait phones: subtitle under the action buttons; toast feed over the left button column; text tiny at ≥1080p | fixed (verified at 360×640, 412×915, 1920×1080) |

### Low / by design (documented, not changed)
* Starting an echo of yourself while standing in it shoves you out along the shortest axis (up to 3 m). This is the documented displacement rule.
* Fast playback rates can skip the first/last frame (sampling stride). A frozen singing echo sustains its note.
* Saving does not carry the "roll back this slot" history.
* **Unresolved:** a blown-out white strip of floor light in Chapter VI (and a very bright beam cone in Chapter V); Chapter IV is dim. Not caused by the light shafts (capped and reduced); source not identified.

## Puzzle integrity
* Reachability analysis on the real collision geometry (walking 0.62 m step-up, 1.1 m jump, falling; lethal hazards too wide to jump count as blocking; analysis self-tested by removing a door and the Dead Field laser): **no section gate in any chapter can be reached without its mechanism**, even with a 2.1 m crate-assisted jump.
* Per chapter: intended solution completes; two runs are bit-identical tick for tick; withholding recordings (or tapes) is blocked *by the world* (shut door / missing stair), not by an unrelated failure; rewinding to the start restores the exact initial world and a second solve gives the identical final state.
* Chapter VI Eyes: the three histories (an object's recorded state, the Recollector's body, the Eye's recorded perception) obey one rule across all 8 combinations of what a recording contains — the door opens iff the plate is remembered pressed and nobody is seen, and exactly one combination does it.

## Not verified
Audio quality by ear; real GPUs, real phones, real mouse/pointer-lock; Chapters III and V with echoes in front (only plain-world views reviewed); frozen-echo shading on a very bright background; whether the minimal-HUD timings feel right in play; anything under real network/hosting.
