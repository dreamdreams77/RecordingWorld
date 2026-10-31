// Renders every instrument cue offline through the real AudioEngine (tape bus included) and measures the result.
// This is signal analysis — peak, loudness, dominant pitch, length — NOT a listening test.
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:4173/?audio=0&quality=low');
await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
const rows = await p.evaluate(async () => {
  const AE = window.__game.audio.constructor, names = ['rec-start', 'rec-stop', 'play', 'stop', 'select', 'pin', 'tape', 'rewind', 'end', 'reverse', 'forward', 'slow', 'fast', 'loop', 'freeze', 'thaw', 'omit', 'unomit', 'solo', 'preview', 'marker', 'scrub'];
  const SR = 44100, out = [];
  const SCALE = [146.83, 174.61, 196, 220, 261.63, 293.66, 349.23, 392, 440, 523.25, 587.33, 698.46, 783.99, 880, 1046.5, 1174.66];
  for (const n of names) {
    const ctx = new OfflineAudioContext(2, SR * 3.2, SR), e = new AE(); e.init(ctx); e.settings = null; e.master.gain.value = 0.8;
    e.event(n, 0.5); const buf = await ctx.startRendering(), d = buf.getChannelData(0);
    let peak = 0, sq = 0, last = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; if (a > 0.003) last = i; }
    // loudest 0.25 s window RMS, and its dominant frequency (naive DFT over the scale degrees + neighbours)
    let best = 0, bi = 0; const W = 11025; for (let i = 0; i + W < d.length; i += 2205) { let s = 0; for (let k = i; k < i + W; k++) s += d[k] * d[k]; if (s > best) { best = s; bi = i; } }
    const seg = d.slice(bi, bi + 8192); let domF = 0, domM = 0;
    for (let f = 120; f < 2400; f *= 1.01) { let re = 0, im = 0; for (let k = 0; k < seg.length; k += 2) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / seg.length); re += seg[k] * w * Math.cos(2 * Math.PI * f * k / SR); im += seg[k] * w * Math.sin(2 * Math.PI * f * k / SR); } const m = re * re + im * im; if (m > domM) { domM = m; domF = f; } }
    const cents = Math.min(...SCALE.map((s) => Math.abs(1200 * Math.log2(domF / s))));
    out.push({ n, peak: +peak.toFixed(3), rmsDb: +(10 * Math.log10(best / W + 1e-12)).toFixed(1), len: +(last / SR).toFixed(2), dom: Math.round(domF), cents: Math.round(cents) });
  }
  return out;
});
console.log('cue         peak   loudestRMS(dB)  audible(s)  dominant Hz (cents off nearest scale degree)');
for (const r of rows) console.log(r.n.padEnd(11), String(r.peak).padStart(6), String(r.rmsDb).padStart(12), String(r.len).padStart(11), `  ${r.dom} Hz (${r.cents} c)`);
const tonal = rows.filter((r) => !['scrub', 'select', 'preview', 'marker'].includes(r.n)); // ticks are deliberately quieter
const rms = tonal.map((r) => r.rmsDb), spread = Math.max(...rms) - Math.min(...rms);
console.log(`\nloudness spread across tonal cues: ${spread.toFixed(1)} dB (min ${Math.min(...rms)}, max ${Math.max(...rms)}); max peak ${Math.max(...rows.map((r) => r.peak))}`);
console.log(errs.slice(0,3));console.log('clipping:', rows.some((r) => r.peak >= 0.99) ? 'YES' : 'none', '| silent cues:', rows.filter((r) => r.peak < 0.005).map((r) => r.n).join(',') || 'none', '| page errors:', errs.length);
if (process.argv.includes('--calibrate')) {
  const TICKS = ['select', 'preview', 'scrub', 'marker'], level = {};
  for (const r of rows) level[r.n] = TICKS.includes(r.n) ? +Math.max(0.35, Math.min(8, 0.06 / Math.max(r.peak, 1e-4))).toFixed(2) : +Math.max(0.35, Math.min(3, 10 ** ((-28 - r.rmsDb) / 20))).toFixed(2); // short ticks are judged by peak (a 30 ms burst has little RMS)
  console.log('\nLEVEL =', JSON.stringify(level));
}
await b.close();
