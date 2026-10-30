// The story is revealed gradually: each "truth" is unlocked by a bark (a spoken line from a figure in the world),
// a log, or a decision. The Archive screen shows the ledger; the ending reads it back.

export const TRUTHS = [
  { id: 'first-time', title: 'You have been here before', text: 'The Operator greeted you as someone returning. The first boot was not the first.' },
  { id: 'ticks', title: 'Everything is counted in ticks', text: 'The Registry never measured seconds. Only ticks — steps of something being played.' },
  { id: 'belt', title: 'The slow clocks were deliberate', text: 'Slow machinery holds its shape longest. The Engine was built to remember, not to compute.' },
  { id: 'field', title: 'Forgetting was meant to be safe', text: 'The Dead Field was not a trap. It was where things were put so that they could stop being true safely.' },
  { id: 'fork', title: 'Both histories were kept', text: 'The surveyors preserved two charters so that someone, one day, would be forced to choose between them.' },
  { id: 'hum', title: 'The Operator’s hum is a key', text: 'The melody the Operator hums opens the locks, backwards. It was never decoration.' },
  { id: 'stars', title: 'Nothing is looking at the sky', text: 'The stars do not move because no one is playing that part of the recording.' },
  { id: 'archivist', title: 'The Archivist is inside it', text: 'The Archivist recorded the last day so completely that they became part of the recording.' },
  { id: 'playhead', title: 'You are the playhead', text: 'The tick counter was never a clock. It counts how far you have played.' },
];

/** What each chapter says once the ending has been seen. */
export const AFTERWORDS = {
  ch1: 'The window still opens when you cross. It opens a little faster now. I think it recognises you.',
  ch2: 'Every flywheel here is still spinning down from the last time. They will never quite stop. Neither will you.',
  ch3: 'I stood on that plate for eleven days. When you pressed it the first time, I felt, for the first time, the weight lifted.',
  ch4: 'The melody is the same forwards and backwards. That was the first thing I ever understood about being recorded.',
  ch5: 'The shutters open and close on a ten second cycle. I counted two thousand cycles before I understood the count was for you.',
  ch6: 'When the cradle is finally shared between the one who stood and the one remembered, nothing ends. It simply agrees.',
};
