import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, SCALE, cueFor } from '../src/audio/cues.js';

const NOTES = Object.values(SCALE);
const onScale = (f) => NOTES.some((n) => Math.abs(1200 * Math.log2(f / n)) < 5); // within 5 cents of a scale degree
const all = () => Object.entries(CUES).map(([n, c]) => [n, typeof c === 'function' ? c(0.5) : c]);

test('every instrument verb has a cue', () => {
  for (const n of ['rec-start', 'rec-stop', 'play', 'stop', 'select', 'pin', 'tape', 'rewind', 'end', 'reverse', 'forward', 'slow', 'fast', 'loop', 'freeze', 'thaw', 'omit', 'unomit', 'solo', 'preview', 'marker', 'scrub']) assert.ok(cueFor(n, 0.5)?.length, `missing cue: ${n}`);
});
test('one timbre: tones are sine or triangle only, noise is only band-passed hiss', () => {
  for (const [n, c] of all()) for (const e of c) {
    if (e.k === 'tone') assert.ok(['sine', 'triangle'].includes(e.type), `${n}: ${e.type}`);
    else assert.equal(e.k, 'hiss', `${n}: unknown element`);
  }
});
test('one scale: every tone and glide target is a D-minor-pentatonic degree', () => {
  for (const [n, c] of all()) for (const e of c) if (e.k === 'tone') { assert.ok(onScale(e.f), `${n}: ${e.f} Hz is off the scale`); if (e.to) assert.ok(onScale(e.to), `${n}: glide target ${e.to} Hz is off the scale`); }
});
test('gestures mean what they say: reversing falls, slowing drops an octave, starting rises, stopping falls, freezing is an open chord', () => {
  const tone = (n) => CUES[n].filter((e) => e.k === 'tone');
  const dir = (n) => { const t = tone(n)[0]; return Math.sign((t.to ?? tone(n)[1]?.f ?? t.f) - t.f); };
  assert.ok(dir('reverse') < 0, 'reverse falls'); assert.ok(dir('forward') > 0, 'forward rises');
  const sl = tone('slow')[0]; assert.ok(Math.abs(sl.f / sl.to - 2) < 0.02, 'slow is an octave down');
  assert.ok(dir('rec-start') > 0 && dir('rec-stop') < 0 && dir('play') > 0 && dir('stop') < 0 && dir('omit') < 0 && dir('unomit') > 0);
  const fr = tone('freeze').map((e) => e.f).sort((a, b) => a - b); assert.deepEqual([fr[1] / fr[0], fr[2] / fr[1]].map((r) => +r.toFixed(2)), [1.5, 1.33], 'a fifth, then a fourth: D–A–D');
  assert.ok(tone('freeze').every((e) => e.dur >= 1.5) && tone('solo')[0].dur >= 1.1, 'freeze and solo ring on');
});
test('loudness is even across the instrument, nothing can clip, nothing is inaudible', () => {
  const peak = (c) => c.reduce((m, e) => Math.max(m, e.vol), 0);
  const sum = (c) => { let m = 0; for (let t = 0; t < 3; t += 0.01) m = Math.max(m, c.filter((e) => e.k === 'tone' && t >= e.at && t < e.at + e.dur).reduce((a, e) => a + e.vol, 0)); return m; }; // tones sounding at the same moment
  const peaks = all().filter(([n]) => n !== 'scrub' && n !== 'preview' && n !== 'select').map(([, c]) => peak(c));
  assert.ok(Math.max(...peaks) / Math.min(...peaks) <= 3.5, `peak ratio ${(Math.max(...peaks) / Math.min(...peaks)).toFixed(2)}`);
  for (const [n, c] of all()) { assert.ok(sum(c) <= 0.3, `${n}: simultaneous tone level ${sum(c).toFixed(2)}`); assert.ok(peak(c) >= 0.04, `${n} is too quiet`); }
});
test('hiss stays inside the band the tape bus passes (110 Hz – 6.2 kHz) and durations are sane', () => {
  for (const [n, c] of all()) for (const e of c) { assert.ok(e.dur > 0 && e.dur <= 2.3, `${n}: duration ${e.dur}`); if (e.k === 'hiss') assert.ok(e.f >= 250 && e.f <= 6600, `${n}: hiss at ${e.f}`); }
});
test('scrubbing pitch follows the position in the recording, and is bounded', () => {
  const f = (p) => CUES.scrub(p)[0].f; assert.ok(f(0) < f(0.5) && f(0.5) < f(1)); assert.equal(f(-5), f(0)); assert.equal(f(9), f(1));
});
import { LEVEL } from '../src/audio/cues.js';
test('every cue has a measured calibration level', () => { for (const [n] of all()) assert.ok(LEVEL[n] > 0.3 && LEVEL[n] <= 8, `no LEVEL for ${n}`); });
