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
