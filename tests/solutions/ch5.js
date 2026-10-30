export const variants = [{ name: 'scrub-half-cycle', prism: 'scrub' }, { name: 'wait-half-cycle', prism: 'wait' }];
export default function solve(bot, dir, opts = {}) {
  const w = bot.w;
  const press = (id) => bot.press(id);
  // --- A
  bot.walkTo(2.5, -12);
  if (opts.experiments) { bot.walkTo(4.5, -23.5); press('M2'); bot.walkTo(2.5, -12); }
  w.startRecording(0, bot.vol(-0.5, 1.5, -15, 8.5, 3, 11), 'lit');
  bot.step(100);
  w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.walkTo(2.5, -16);
  press('M5');
  bot.step(30);
  if (opts.experiments) { bot.walkTo(-4, -17); bot.walkTo(-5, -23); bot.walkTo(-12, -23); bot.walkTo(-20, -23); bot.walkTo(-8, -23); bot.walkTo(-4, -17); bot.walkTo(5.5, -17); }
  bot.walkTo(5.5, -17);
  bot.walkTo(5.5, -28);
  bot.walkTo(0, -29.5);
  bot.walkTo(0, -32);
  w.stop(0);

  // --- B: three recordings, each started on a beat, 800 ticks apart
  bot.walkTo(0, -36);
  const vol = bot.vol(0, -2, -49, 4, 6, 11);
  let start = null;
  for (let k = 0; k < 3; k++) {
    if (start === null) while (w.tick % 200 !== 0) bot.step(1);
    else while (w.tick !== start + 800) bot.step(1);
    start = w.tick;
    w.startRecording(k, vol, `beat ${k}`);
    bot.step(600);
    if (w.recorder) w.stopRecording();
  }
  while (w.tick !== start + 800) bot.step(1);
  w.playAll({ mode: 'loop' });
  bot.step(3);
  bot.walkTo(0, -40.2);
  bot.walkTo(0, -60);
  bot.walkTo(0, -66);
  w.stop(0); w.stop(1); w.stop(2);

  // --- C: shutter, flywheel and voice, each latched by a recording
  bot.walkTo(-4, -74.5);
  w.startRecording(0, bot.vol(-3, 1.5, -78, 5, 3, 5), 'shutter');
  press('btn5s'); bot.seconds(2.1); w.stopRecording();
  w.play(0, { mode: 'hold' });
  bot.walkTo(-4, -89.5);
  w.startRecording(1, bot.vol(-5, 1.5, -91, 5, 3, 4), 'flywheel');
  press('btn5f'); bot.seconds(2.7); w.stopRecording();
  w.play(1, { mode: 'hold' });
  bot.walkTo(-2, -95);
  bot.walkTo(-1.8, -100);
  w.startRecording(2, bot.vol(-1.8, 2.2, -100, 3, 2, 3), 'voice');
  bot.sing(4, 2.0); w.stopRecording();
  bot.walkTo(1.8, -100);
  w.play(2, { mode: 'loop' });
  bot.step(15 * 60);
  bot.walkTo(1.8, -106);
  w.stop(0); w.stop(1); w.stop(2);
  // --- D: prism hall — one recording, offset by half a cycle
  bot.walkTo(-4, -120);
  while (w.tick % 600 !== 0) bot.step(1);
  const t0 = w.tick;
  w.startRecording(0, bot.vol(4, Y + 1, -125, 5.5, 3, 9.5), 'cycle');
  bot.step(600);
  if (w.recorder) w.stopRecording();
  if (opts.variant?.prism === 'wait') { while (w.tick !== t0 + 900) bot.step(1); w.play(0, { mode: 'loop' }); }
  else { w.setHead(0, 300); w.play(0, { mode: 'loop' }); }
  for (let i = 0; i < 1500 && bot.signal('allHold') < 0.5; i++) bot.step(1);
  if (bot.signal('allHold') < 0.5) throw new Error('the three colours never coincided');
  bot.walkTo(0, -138);
  bot.walkTo(0, -141);
  bot.step(60);
  bot.walkTo(0, -150);
  bot.walkTo(0, -156);
}
const Y = 18;
