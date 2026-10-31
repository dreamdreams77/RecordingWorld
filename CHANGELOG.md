# Changelog

## 1.4.0 — the instrument
* **The reel:** a timeline that is not a video scrubber. Each recorded object has a lane showing when it was inside the volume and when its state changed; the significant moments (a plate pressed or released, a door opening, a note sung, an Eye seeing someone, a crate pushed, something entering or leaving) are marked where they happened and described in words ("Now: plateA pressed · next: plateA released in 0.35 s"). It opens while recording or handling an echo and falls away to a row of chips while exploring.
* **Preview before committing:** scrub to any moment of a stored recording and a **ghost** appears in the real 3D scene — outlines of every recorded object, brighter for the ones that will change the world (a door that will be open, a plate that will be down). Then play from there (T) or freeze there (F). The ghost samples the stored tracks into scratch buffers: no world copy, no extra entity views, ~0.003 ms per frame.
* **Frame-exact control:** `,` `.` move exactly one tick (hold to repeat, accelerating; Shift = ten), `;` `'` jump between events, Home/End, **Ctrl + mouse** is a jog wheel, the mouse wheel steps while a moment is under inspection. On touch: drag the reel, ◂ ▸ step (hold to repeat), ⏮ ⏭ events, tap a lane to leave an object out (hold: only it).
* **Freeze (F):** hold an echo on a frame, step it tick by tick, release.
* **Every verb has its own voice:** reverse (tape sucked backwards, warm amber, scan-lines run the other way, ring contracts), slow (heavy winding-down), fast, loop (the seam closing), freeze (glassy chime, pale faceted ice on the echo), omit (hollow thud, plum ring pulling inward), solo (a bell, a bright rim), scrub (tape-head hiss whose pitch follows position), event jump (a tick). Echoes visibly change in the world: frozen, reversed, slowed or solo echoes look different.
* Everything works with keyboard, mouse (Ctrl jog) and touch; previewing never touches the simulation (tested: 300 scrub/ghost/jump operations leave the world hash unchanged); saves, rewinds and omit/solo state round-trip exactly.

## 1.3.0 — the Recollector edits history
* **Selective playback (O / Shift+O):** leave any object out of an echo, or replay only it. Freezing an echo (T while playing) is now labelled as such on the deck.
* **The Unwitnessed Hall (VI):** two Eyes that see every Recollector, present or remembered. *The Witness* — the plate must be pressed and nobody seen: replay yourself, then remove yourself from your own memory. *The Blind Eye* — the shutter blinds the Eye for a heartbeat: record it, slow and scrub it to the covering frame, freeze it, and walk out behind a memory. Both verified by the bot and by negative tests.
* **Stale-page recovery:** if a cached page points at script files a newer deploy replaced, the page reloads itself once; otherwise it says why it cannot start.

## 1.2.0 — nuance pass
* **Couplings:** brittle glass panes (a sustained note turns sound into a permanent change of matter), a counting gate that jams on overshoot (the Counting House in II), colour-keyed optics chains (the Glass Vault and Mirror Lock in IV), and a plate-attribution rule so the game can say *which* history is holding something.
* **Causality read-out:** aiming at a mechanism shows what it listens to, which history answers, and whether it is sealed, pinned or overruled (`World.explain`).
* **Story as state:** barks from recurring figures build the Operator's trust and a ledger of *truths* shown in the Archive; trust, the ending and the Fork's canon become flags that gate actors, tapes and discoveries in later chapters. Verified by new bot variants (trusted Operator in IV; archive/observatory canon in V and VI).
* **Feel:** shockwave rings and sparks for reconciliation, canon, shatter and collapse; landing dip, strafe lean and speed FOV (all off under *reduced motion*).
* **Tooling:** `npm run bench` reports per-chapter simulation cost (slowest chapter ≈ 0.23 ms/step with six echoes).
* **Chapter set pieces:** I calibration sweeps travel the hall; II steam plumes at every flywheel and belt; III absent architecture drifts as debris; IV resonant motes spiral from tuned mechanisms; V a colossal astrolabe and meteors; VI flickering film frames. Plus chapter title cards, generated wall trim and echo trails.
* **Touch controls** for phones/tablets (move stick, look, tap-to-pin, action buttons, notes), Low preset by default on touch devices, blank-page guard with instructions, GitHub Pages workflow.
* Fix found by the browser test: the ledger's bare `canon` interact event crashed the canon handler.

## 1.1.0 — depth pass
* New systems: moving hazards, wearing floors, one-way descenders, a melody-playing carillon with tempo/order locks, prisms with colour dispersion, gel filters and colour-keyed sensors, scripted actors, ledgers and **canon** (a history made real, with sealing and pins), rewind, section reset and recording rollback.
* New multi-stage sections with several verified solutions: II *The Dead Field*, III *The Fork*, IV *The Carillon* (two locks), V *The Prism Hall*, VI *The Well*.
* Time manipulation is now load-bearing: reverse, ×0.25 / ×2 playback, scrub-offset synchronisation and beat-aligned recordings each unlock something nothing else does.
* Contradiction with consequences: the Fork's choice is enforced by rule (sealing) and persists (witness figure, perk, ending line).
* Environmental storytelling through actors and physical events (the observation window opens, residual operators hum the Registry motif that also solves the carillon lock).
* Fixes found while building: AND/OR collision, mirror trapping, empty recordings, Enter on the title screen, graphics fallback.

## 1.0.0
* New 3D game (three.js + Vite) replacing the earlier 2D Canvas prototype, which is preserved unchanged in `legacy-2d/`.
* Deterministic fixed-step simulation with change-compressed recording, physical playback and documented reconciliation rules.
* Six chapters, optional experiments, hidden logs, archive tapes, finale with two endings, and a sandbox.
* Procedural PBR rendering, themed environments, emulsion/conflict/reconciled visual language, procedural spatial audio.
* Save/load by exact world snapshot, settings, accessibility options, developer overlay.
* Tests: simulation unit tests, bot solutions for every chapter (including optional experiments), Playwright smoke test.
