// One palette for everything that belongs to a recording: the echo shader, the ghost, trails, the reel, the deck and the
// frame. Silver and amber, as on old film stock — the slots differ by warmth and value, not by neon hue, so the whole
// instrument looks like one material. (Chosen to stay distinguishable by lightness as well as colour.)
export const FILM_HEX = ['#e9a84f', '#b9c7d6', '#d98a6a', '#efd9a0', '#b8c4a8', '#c4a8b8'];
//   slot 1 amber · 2 cold silver · 3 copper · 4 pale gold · 5 sage silver · 6 faded rose
export const FILM_INT = FILM_HEX.map((h) => parseInt(h.slice(1), 16));
