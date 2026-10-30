export const variants = [{ name: 'archive', fork: 'E' }, { name: 'observatory', fork: 'W' }];
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
  bot.walkTo(0, -98);
  // --- D: the fork
  const E = (opts.variant?.fork ?? 'E') === 'E', sx = E ? 5 : -5, lane = E ? 4 : -4;
  w.stop(0); w.stop(1);
  bot.walkTo(sx, -102.3);
  dir.loadTape(dir.nearbyTape(), 0);
  w.play(0, { mode: 'hold' });
  bot.step(150);
  bot.walkTo(lane, -108.5);
  bot.walkTo(lane, -125);
  bot.walkTo(sx, -131.5);
  bot.lookAt(sx, 0.6, -134);
  bot.step(1, { interact: true, slot: 0 });
  bot.step(3);
  if (bot.signal(E ? 'ledE' : 'ledW') < 0.5) throw new Error('the ledger did not accept the history');
  bot.step(90);
  const ex = E ? 3.5 : -3.5;
  bot.walkTo(ex, -134);
  bot.walkTo(ex, -146);
  bot.walkTo(ex, -154);
  bot.walkTo(ex, -160);
}
