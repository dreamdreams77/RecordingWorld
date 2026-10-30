# Contributing

Thank you for looking at the source. This project is small on purpose. Please keep it that way.

## Ground rules

1. **No external assets.** Everything visual is drawn with Canvas 2D and everything audible is
   synthesized with the Web Audio API. Do not add images, fonts, sound files, or CDN scripts.
2. **No runtime dependencies.** The game ships with none. Unit tests and build tooling use only Node's standard library. The one exception is the browser test (`tools/e2e.mjs`), which uses `puppeteer-core` and `@sparticuz/chromium` as devDependencies. They are never bundled into `dist/`.
3. **The simulation is deterministic.** Do not use `Math.random`, `Date.now`, or
   `performance.now` inside `src/sim.js`, `src/recording.js`, `src/levels.js`, or `src/game.js`.
   Iterate arrays in order. If you change physics, the level solution tests must still pass.
4. **Keep the rules in one place.** Reconciliation behaviour belongs in `src/recording.js`, and
   each rule there is labelled R1–R6. If you add a rule, add a label, document it in
   `docs/ARCHITECTURE.md`, and write a test for it.
5. **Every level needs a test.** A level without a scripted solution in `tests/solutions.test.js`
   is not finished.

## Workflow

```sh
npm test        # run the test suite
npm start       # serve at http://localhost:8080
npm run build   # produce dist/ with a manifest
npm run e2e     # browser test; add -- --screenshots to regenerate docs/screenshots/
```

## Pull requests

- Describe the player-visible change and the rule it touches.
- Include the test you added or changed.
- Do not commit `dist/`, `node_modules/`, or logs.
- Update `CHANGELOG.md` under an "Unreleased" heading.
