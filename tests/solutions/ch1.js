// Scripted solution for Chapter I, driven through the real controls by the Bot.
export default function solve(bot, dir, opts = {}) {
  const w = bot.w;
  // --- A: record yourself on the plate, replay it, leave through the door
  bot.walkTo(-5, -12);
  bot.record(0, bot.vol(-5, 1.5, -12, 3, 3, 3), 3.2, null, 'plate A');
  bot.walkTo(0, -14);
  w.play(0, { mode: 'loop' });
  bot.walkTo(0, -22.5);
  bot.walkTo(0, -26);
  w.stop(0);

  // --- optional Annex: three witnesses (two recordings + yourself)
  if (opts.experiments) {
    bot.walkTo(8, -39);
    bot.walkTo(12, -39);
    bot.record(0, bot.vol(12, 1.5, -39, 2.5, 3, 3), 2.5);
    bot.walkTo(15.5, -39);
    bot.record(1, bot.vol(15.5, 1.5, -39, 2.5, 3, 3), 2.5);
    bot.walkTo(14, -42);
    w.play(0, { mode: 'loop' }); w.play(1, { mode: 'loop' });
    bot.walkTo(19, -39);
    bot.step(60);
    bot.walkTo(25, -39);
    w.stop(0); w.stop(1);
    bot.walkTo(19, -39); bot.walkTo(8, -39);
  }

  // --- B: crate on plate 1, echo on plate 2
  bot.walkTo(2, -31);
  bot.walkTo(-4.3, -31);
  bot.walkTo(-4.3, -29);
  bot.walkTo(-5, -29);
  bot.walkTo(-5, -34.2);
  bot.walkTo(5, -35);
  bot.record(0, bot.vol(5, 1.5, -35, 3, 3, 3), 3);
  bot.walkTo(5, -39);
  w.play(0, { mode: 'loop' });
  bot.walkTo(0, -45);
  bot.walkTo(0, -52);
  w.stop(0);

  // --- C: capture the bridge fully raised, then hold it
  bot.walkTo(-3.5, -52);
  w.startRecording(0, bot.vol(-0.5, -1.5, -59.5, 5, 4, 8), 'bridge');
  bot.press('btnC');
  bot.seconds(1.9);
  w.stopRecording();
  bot.walkTo(0, -52);
  w.play(0, { mode: 'hold' });
  bot.step(60);
  bot.walkTo(0, -70);
  bot.walkTo(0, -85);
}
