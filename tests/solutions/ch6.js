export default function solve(bot, dir) {
  const w = bot.w;
  const vol = (x, y, z, hx = 4.5, hy = 3, hz = 4.5) => bot.vol(x, y, z, hx, hy, hz);
  // 1: plate echo
  bot.walkTo(-5, -12);
  bot.record(0, vol(-5, 1.5, -12, 3, 3, 3), 3.2);
  bot.walkTo(0, -14);
  w.play(0, { mode: 'loop' });
  bot.walkTo(0, -26);
  bot.walkTo(0, -30);
  w.stop(0);
  // 2: overspeed
  bot.walkTo(-4, -31.5);
  w.startRecording(0, vol(-5, 1.5, -33, 5.5, 3, 4.5), 'fw');
  bot.press('btn6'); bot.seconds(2.7); w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.step(30);
  bot.press('btn6');
  bot.walkTo(0, -56.5);
  bot.walkTo(0, -60);
  w.stop(0);
  // 3: chord
  bot.walkTo(-6, -72);
  w.startRecording(0, vol(-6, 1.5, -72), 'D');
  bot.sing(2, 2.0); w.stopRecording();
  bot.walkTo(-6, -68);
  w.play(0, { mode: 'loop' });
  bot.walkTo(6, -72);
  bot.sing(5, 1.2);
  bot.walkTo(6, -80, { tone: 5 });
  bot.walkTo(0, -88);
  bot.walkTo(0, -92);
  w.stop(0);
  // 4: three beats, then cross
  bot.walkTo(0, -94);
  const v = bot.vol(0, -2, -109, 4, 6, 11);
  let start = null;
  for (let k = 0; k < 3; k++) {
    if (start === null) while (w.tick % 200 !== 0) bot.step(1);
    else while (w.tick !== start + 800) bot.step(1);
    start = w.tick;
    w.startRecording(k, v, `beat ${k}`);
    bot.step(600);
    if (w.recorder) w.stopRecording();
  }
  while (w.tick !== start + 800) bot.step(1);
  w.playAll({ mode: 'loop' });
  bot.step(3);
  bot.walkTo(0, -99.8);
  bot.walkTo(0, -122);
  // the cradle: record yourself standing on it, step off, replay, step back on
  bot.walkTo(-0.8, -128);
  w.startRecording(3, vol(-0.8, 1.5, -128, 3, 3, 3), 'cradle');
  bot.step(90); w.stopRecording();
  bot.walkTo(0.8, -123.5);
  w.play(3, { mode: 'loop' });
  bot.step(10);
  bot.walkTo(0.8, -128);
  bot.step(30);
}
