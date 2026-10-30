# Changelog

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
