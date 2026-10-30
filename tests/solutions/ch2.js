export const variants = [{ name: 'remembered-button', field: 'record' }, { name: 'crate-on-plate', field: 'crate' }];
export default function solve(bot, dir, opts = {}) {
  const w = bot.w;
  const flyVol = (x, z) => bot.vol(x + 1, 1.5, z, 5.5, 3, 4.5);
  // --- A: record the flywheel at speed, hold it, run to the door
  bot.walkTo(-3, -6.2);
  w.startRecording(0, flyVol(-5, -8), 'flywheel');
  bot.press('btn1');
  bot.seconds(2.7);
  w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.walkTo(0, -20);
  bot.walkTo(0, -43);
  bot.walkTo(0, -46);
  w.stop(0);

  // --- B: same trick, with the crate in the tunnel
  bot.walkTo(-4, -47.5);
  w.startRecording(0, flyVol(-6, -49), 'flywheel 2');
  bot.press('btn2');
  bot.seconds(2.7);
  w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.walkTo(4, -52);
  // wait for the belt to deliver the crate onto the plate (15 m at 1.4 m/s)
  for (let i = 0; i < 20 * 60 && !(bot.signal('plateB') > 0.5); i++) bot.step(1);
  if (!(bot.signal('plateB') > 0.5)) throw new Error('crate never reached the plate');
  bot.walkTo(4, -76);
  bot.walkTo(0, -79);
  bot.walkTo(0, -82);
  w.stop(0);

  // --- optional vault: two echoes + live
  if (opts.experiments) {
    bot.walkTo(-4, -83.5);
    for (const slot of [0, 1]) {
      w.startRecording(slot, flyVol(-6, -85), `fw ${slot}`);
      bot.press('btn3');
      bot.seconds(2.7);
      w.stopRecording();
      w.play(slot, { mode: 'hold' });
      if (slot === 0) { bot.step(60); }
    }
    bot.press('btn3');
    bot.seconds(2.0);
    bot.walkTo(8, -92);
    bot.walkTo(18, -93);
    w.stop(0); w.stop(1);
    bot.walkTo(8, -93);
    bot.walkTo(0, -90);
    bot.step(60 * 14);
  }

  // --- C: echo + live crosses 1.5 while the door is 25 m away
  bot.walkTo(-4, -83.5);
  w.startRecording(0, flyVol(-6, -85), 'governor');
  bot.press('btn3');
  bot.seconds(2.7);
  w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.step(30);
  bot.press('btn3');
  bot.walkTo(0, -108.5);
  bot.walkTo(0, -112);
  bot.walkTo(0, -113);
  // --- D: the dead field
  w.stop(0); w.stop(1);
  if ((opts.variant?.field ?? 'record') === 'record') {
    bot.walkTo(-6, -110.2);
    w.startRecording(0, bot.vol(-5, 1.2, -110.9, 4, 2.2, 2.9), 'button held');
    bot.press('safeBtn'); bot.step(30); w.stopRecording();
    w.play(0, { mode: 'hold' });
    bot.walkTo(0, -112.5);
  } else {
    bot.walkTo(-1, -113);
    bot.walkTo(-7, -113);
    bot.walkTo(-7, -111.3);
    bot.faceXZ(8, -111.3);
    for (let i = 0; i < 400 && !(bot.signal('safePl') > 0.5); i++) bot.step(1, { mz: 1 });
    bot.step(30);
    bot.walkTo(0, -112.5);
  }
  bot.step(40);
  if (bot.st('laser', 's') > 0.1) throw new Error('the laser is still armed');
  // run the field, hopping each sweeper as we meet it
  const bars = [-122, -134];
  bot.faceXZ(0, -145);
  for (let i = 0; i < 1200 && bot.p[2] > -145; i++) {
    const near = bars.some((z) => bot.p[2] - z > 0 && bot.p[2] - z < 1.9);
    bot.step(1, { mz: 1, jump: near && bot.p[1] < 1.0 });
  }
  bot.walkTo(0, -147);
  bot.walkTo(0, -156);
}
