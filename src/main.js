import { Game } from './game/game.js';
import { AudioEngine } from './audio/engine.js';
import { Menus } from './ui/menus.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);

async function boot() {
  document.getElementById('boot')?.remove();
  try { sessionStorage.removeItem('twiar.reloaded'); } catch { /* ignore */ }
  const audio = new AudioEngine();
  const game = new Game(root, { audio });
  const unlock = () => { audio.init(); audio.applySettings(game.settings); };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  if (params.get('audio')) unlock();
  game.menus = new Menus(root, game);
  window.__game = game; // handle for tests and developer tools
  if (params.get('quality')) { game.settings.quality = params.get('quality'); game.renderer.applyQuality(params.get('quality')); }
  if (params.get('level')) await game.startLevel(params.get('level'));
  else await game.startAttract();
}
boot().catch((e) => { console.error(e); document.title = 'ERROR ' + e.message; const d = document.createElement('div'); d.id = 'boot'; d.innerHTML = '<b>The game failed to start.</b><br>' + String(e.message).replace(/</g, '&lt;') + '<br>Check that your browser supports WebGL2 and try reloading.'; document.body.prepend(d); });
