export const variants = [{ name: 'time-dials', carillon: 'time' }, { name: 'sing-it-yourself', carillon: 'manual' }, { name: 'trusted-operator', carillon: 'trust', flags: { op2: true } }];
export default function solve(bot, dir, opts = {}) {
  const variant = opts.variant?.carillon ?? 'time';
  const d2 = variant === 'trust' ? 'time' : variant;
  const w = bot.w;
  const vol = (x, y, z, hx = 4.5, hy = 3, hz = 4.5) => bot.vol(x, y, z, hx, hy, hz);
  // --- A: record singing next to the glass, then loop it
  bot.walkTo(-4, -10);
  w.startRecording(0, vol(-4, 1.5, -10), 'voice');
  bot.sing(3, 2.0);
  w.stopRecording();
  if (opts.experiments) { // the brittle glass: sustained A
    bot.walkTo(-6, -21);
    bot.sing(6, 2.6);
    if (!(bot.signal('brittleA') > 0.5)) throw new Error('the pane did not shatter');
    bot.walkTo(-14, -21);
    bot.walkTo(-1, -14);
  }
  bot.walkTo(-1, -14);
  w.play(0, { mode: 'loop' });
  bot.walkTo(0, -20);
  bot.walkTo(0, -35);
  bot.walkTo(0, -38);
  w.stop(0);

  // --- B: chord = echo D + live G
  if (opts.experiments) {
    bot.walkTo(5, -40);
    bot.walkTo(5, -47);
    for (const n of [3, 5, 3, 6, 1]) { bot.sing(n, 0.35); bot.step(18); }
    bot.step(30);
    bot.walkTo(7, -45);
    bot.walkTo(14, -45);
    bot.walkTo(20, -45);
    bot.walkTo(7, -45);
    bot.walkTo(6, -47);
    bot.step(60 * 16);
  }
  bot.walkTo(-6, -54);
  w.startRecording(0, vol(-6, 1.5, -54), 'D');
  bot.sing(2, 2.0);
  w.stopRecording();
  bot.walkTo(-6, -50);
  w.play(0, { mode: 'loop' });
  bot.walkTo(6, -54);
  bot.sing(5, 1.2);
  bot.walkTo(6, -62, { tone: 5 });
  bot.walkTo(0, -70);
  bot.walkTo(0, -74);
  w.stop(0);

  // --- C: two echoes + live voice
  bot.walkTo(-7, -80);
  w.startRecording(0, vol(-7, 1.5, -80), 'C');
  bot.sing(1, 2.0);
  w.stopRecording();
  bot.walkTo(-5, -84);
  w.play(0, { mode: 'loop' });
  bot.walkTo(-7, -90);
  w.startRecording(1, vol(-7, 1.5, -90), 'F');
  bot.sing(4, 2.0);
  w.stopRecording();
  bot.walkTo(-5, -94);
  w.play(1, { mode: 'loop' });
  bot.walkTo(-7, -100);
  bot.sing(6, 1.5);
  bot.walkTo(0, -104, { tone: 6 });
  bot.walkTo(0, -110.5);
  bot.walkTo(0, -114);
  bot.walkTo(0, -116);
  if (opts.experiments) { // the Mirror Lock: up and back, four times as fast
    bot.walkTo(-4.5, -125.5);
    w.startRecording(1, vol(-7.2, 1.5, -127, 1.6, 3, 2.5), 'scale');
    bot.press('go3'); bot.step(145); w.stopRecording();
    bot.walkTo(0, -121);
    w.play(1, { mode: 'pingpong', rate: 4 });
    for (let i = 0; i < 600 && !(bot.signal('lock3') > 0.5); i++) bot.step(1);
    if (!(bot.signal('lock3') > 0.5)) throw new Error('the mirror lock did not open');
    w.stop(1);
    bot.walkTo(8, -127); bot.walkTo(15, -127); bot.walkTo(8, -127); bot.walkTo(0, -118);
  }
  // --- D1: retrograde at speed
  if (variant === 'trust') {
    bot.walkTo(-1, -120);               // the Operator, who trusts you, hums the lock's answer himself
    for (let i = 0; i < 2500 && bot.signal('lock1') < 0.5; i++) bot.step(1);
  } else if (variant === 'time') {
    bot.walkTo(-3.5, -114.5);
    w.startRecording(0, vol(-6.3, 1.5, -118, 1.7, 3, 3), 'carillon');
    bot.press('go1'); bot.step(340); w.stopRecording();
    bot.walkTo(0, -120);
    w.play(0, { mode: 'once', rate: -2 });
    bot.step(240);
    w.stop(0);
  } else {
    bot.walkTo(2, -120);
    for (const n of [4, 6, 5, 3, 1]) { bot.sing(n, 0.25); bot.step(13); }
    bot.step(10);
  }
  if (bot.signal('lock1') < 0.5) throw new Error('lock1 did not open');
  bot.walkTo(0, -127);
  bot.walkTo(0, -129);
  bot.step(80);
  bot.walkTo(0, -131);
  // --- D2: slow it down
  if (d2 === 'time') {
    bot.walkTo(-3.5, -132.5);
    w.startRecording(0, vol(-6.3, 1.5, -136, 1.7, 3, 3), 'carillon 2');
    bot.press('go2'); bot.step(100); w.stopRecording();
    bot.walkTo(0, -137);
    w.play(0, { mode: 'once', rate: 0.25 });
    bot.step(360);
    w.stop(0);
  } else {
    bot.walkTo(2, -138);
    for (const n of [2, 5, 3, 1, 6]) { bot.sing(n, 0.3); bot.step(15); }
    bot.step(10);
  }
  if (bot.signal('lock2') < 0.5) throw new Error('lock2 did not open');
  bot.walkTo(0, -145);
  bot.walkTo(0, -147);
  bot.step(80);
  bot.walkTo(0, -152);
  bot.walkTo(0, -160);
}
