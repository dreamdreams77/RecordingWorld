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
  // the Well
  bot.walkTo(0, -95);
  bot.walkTo(0, -101);
  for (let i = 0; i < 1200 && bot.st('P', 's') < 0.99; i++) bot.step(1);
  bot.step(30);
  if (bot.p[1] > -10) throw new Error(`the platform did not carry us down (y=${bot.p[1]})`);
  w.startRecording(0, vol(0, -11.5, -105.8, 3, 2.5, 1.3), 'tile, intact');
  bot.step(30); w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.walkTo(0, -104.6);
  bot.step(10);
  // press the lift button early, then wait for the crusher to rise
  const pressLift = () => { bot.walkTo(2, -116.4); bot.press('liftBtn'); };
  bot.walkTo(0, -108, { tol: 0.4 });
  for (let i = 0; i < 400 && !(bot.st('crush', 's') < 0.05); i++) bot.step(1);
  bot.walkTo(0, -113.8, { tol: 0.4 });
  if (bot.st('tileT', 'integ') > 0.5) throw new Error('the tile should have worn away under us');
  pressLift();
  bot.walkTo(0, -117.5, { tol: 0.4 });
  for (let i = 0; i < 60 * 14 && bot.st('L', 's') > 0.03; i++) bot.step(1);
  bot.walkTo(0, -121.5, { tol: 0.4 });
  if (bot.p[1] < -1) throw new Error(`the lift did not carry us up (y=${bot.p[1].toFixed(2)})`);
  bot.walkTo(0, -123);
  w.stop(0);
  // 4: three beats, then cross
  const Dz = -38;
  bot.walkTo(0, -132);
  const v = bot.vol(0, -2, -109 + Dz, 4, 6, 11);
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
  bot.walkTo(0, -99.8 + Dz);
  bot.walkTo(0, -122 + Dz);
  // the cradle: record yourself standing on it, step off, replay, step back on
  bot.walkTo(-0.8, -128 + Dz);
  w.startRecording(3, vol(-0.8, 1.5, -128 + Dz, 3, 3, 3), 'cradle');
  bot.step(90); w.stopRecording();
  bot.walkTo(0.8, -123.5 + Dz);
  w.play(3, { mode: 'loop' });
  bot.step(10);
  bot.walkTo(0.8, -128 + Dz);
  bot.step(30);
}
