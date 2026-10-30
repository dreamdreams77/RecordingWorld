# Level format

A level is a JS object (see `src/levels/ch1.js`):

```js
{ id, index, title, subtitle, theme,            // theme selects materials + scenery + sky + audio
  spawn:{pos,yaw}, caps:{slots,maxTicks,maxVolume,modes,sound}, killY,
  entities:[...],                                // see builder.js: wall, floor, door, bridge, crate, plate, lever, button,
                                                 // gate, flywheel, conveyor, lamp, emitter, resonator, beam, mirror, sensor
  sections:[{id,name,trigger:[x0,y0,z0,x1,y1,z1],checkpoint,caps?,intro,objective,hint}],
  exit:{box}, finale:{signal},                   // exit zone, or a signal that triggers the ending
  discoveries:[{id,pos,title,text}], experiments:[{id,title,desc,signal}],
  tapes:[{id,name,archive,pos}], archives:[{id,name,keep,volume,ticks,script}] }
```

Entities: `in:[ids]` wires inputs (AND; `logic:'or'`; `'!id'` negates). `era:'past'` entities only exist in archive
simulations; `past:{...}` overrides a present entity's definition there. Levels extend toward −z.
Every level ships with a bot solution in `tests/solutions/` that must complete it through the real controls.

## Additions (v1.1)
* **Entities:** `crumble` (wears under load), `descender` (one-way platform; `s0`, `lift`, `in`), `carillon` (`melody:[[note,ticks]]`, `once`),
  `prism`, `filter` (`hue` 1–3), `beam` (`hue`), `sensor` (`hue`, `hold`), `resonator` (`seq` + `tempo:[min,max]` ticks between notes),
  `ledger` (`accepts:'entityId'`), `actor` (`path:[[tick,x,z]]`, `tones:[[t0,t1,note]]`, `startOn`, `hideAt`, `loop`), and sliders with `hazard:true`.
* **Level keys:** `events:[{on:'section:id'|'finale', set:{id:{channel:v}}, actors:[ids], say}]` — physical story events;
  `exits:[{id,box}]` (several endings of a chapter); `canon:{ledgerId:{key,value}}` (what entering a ledger records in the save);
  `par:{recordings}` (the best scripted variant must not exceed it — enforced by a test); `ifCanon:{key,is}` on an entity includes it only after that choice.
* **Solutions:** `tests/solutions/<id>.js` may export `variants` (several distinct, verified ways through the same level).
