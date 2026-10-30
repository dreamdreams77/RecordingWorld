# Contributing

* `npm install`, `npm test` (simulation + per-chapter solver tests), `npm run dev`, `npm run e2e` (needs the dev server and Chromium).
* Simulation code (`src/sim/`) must stay deterministic and DOM-free: no `Math.random`, `Date`, or `performance` in sim logic (timing for stats only).
* New entity types: register in `src/sim/types.js` (declare channels; colliders/outputs derive from state), add a view in `src/render/entities.js`, add tests.
* Every level change needs its bot solution in `tests/solutions/<id>.js` to keep passing: `npm test`.
* Changes to reconciliation rules must update `docs/RECONCILIATION.md` and add a test in `tests/sim.test.js`.
