import { Game } from './game/game.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);

async function boot() {
  const game = new Game(root);
  window.__game = game; // handle for tests and developer tools
  if (params.get('quality')) { game.settings.quality = params.get('quality'); game.renderer.applyQuality(params.get('quality')); }
  if (params.get('level')) await game.startLevel(params.get('level'));
}
boot().catch((e) => { console.error(e); document.title = 'ERROR ' + e.message; });
