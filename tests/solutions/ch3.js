export default function solve(bot, dir, opts = {}) {
  const w = bot.w;
  // --- A: load the stair tape, wait for reconstruction, climb
  bot.walkTo(5, -0.5);
  dir.loadTape(dir.nearbyTape(), 0);
  w.play(0, { mode: 'hold' });
  bot.step(6 * 60);
  bot.walkTo(0, -10);
  bot.walkTo(0, -20.2);
  bot.walkTo(0, -21.5);
  if (opts.experiments) {
    bot.walkTo(-1.5, -21.5);
    bot.walkTo(-3.5, -23.5);
    bot.walkTo(-6, -26);
    bot.step(90);
    bot.walkTo(-6, -27.5);
    bot.walkTo(-6, -31);
    bot.walkTo(-6, -27);
    bot.walkTo(-3.5, -23.5);
    bot.walkTo(-1.5, -21.8);
  }
  bot.walkTo(0, -23);
  bot.step(120); // drop to the lower hall
  bot.walkTo(0, -32);
  bot.walkTo(0, -36);
  w.stop(0);

  // --- B: the operator stands on the plate
  bot.walkTo(5, -36.2);
  dir.loadTape(dir.nearbyTape(), 0);
  w.play(0, { mode: 'hold' });
  bot.step(120);
  bot.walkTo(6, -43);
  bot.walkTo(6, -52);
  bot.walkTo(0, -55);
  bot.walkTo(0, -60.5);
  bot.walkTo(0, -64);
  w.stop(0);

  // --- C: both survey spans at once
  bot.walkTo(-6, -64.6);
  dir.loadTape(dir.nearbyTape(), 0);
  bot.walkTo(6, -64.6);
  dir.loadTape(dir.nearbyTape(), 1);
  bot.walkTo(0, -66);
  w.playAll({ mode: 'hold' });
  bot.step(190);
  bot.walkTo(0, -75);
  bot.walkTo(0, -88);
  bot.walkTo(0, -96);
}
