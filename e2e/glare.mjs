// Numeric glare probe (no images are inspected): renders a view, counts clipped pixels overall and in the floor band,
// then hides one class of scene object at a time to find which one is responsible.
// Env: CH=ch6 SEC=a YAW PITCH
import { chromium } from 'playwright';
const id = process.env.CH ?? 'ch6', sid = process.env.SEC ?? 'a';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
await p.goto(`http://localhost:4173/?quality=medium&audio=0`); await p.waitForFunction(() => window.__game?.state === 'title', null, { timeout: 90000 });
const out = await p.evaluate(async ({ id, sid, yaw, pitch }) => {
  const g = window.__game; g.testNoRender = true; await g.startLevel(id); g.menus.hide(); g.hud.layer.style.display = 'none'; document.querySelector('.titlecard')?.remove();
  const w = g.world, s = w.level.sections.find((x) => x.id === sid), c = s.checkpoint, IDLE = { mx: 0, mz: 0, jump: false, interact: false, tone: 0, yaw: 0, pitch: 0, slot: 0 };
  g.testHold = true; w.teleportPlayer(c.pos, c.yaw ?? 0); for (let k = 0; k < 6; k++) w.step(IDLE); g.yaw = yaw; g.pitch = pitch; g.cur.set(w.player.st); g.prev.set(w.player.st);
  const R = g.renderer, cv = R.renderer.domElement, tmp = document.createElement('canvas'), x2 = tmp.getContext('2d', { willReadFrequently: true });
  const measure = () => {
    g.testNoRender = false; g.playFrame(1 / 60); g.testNoRender = true; // one real frame
    tmp.width = cv.width; tmp.height = cv.height; x2.drawImage(cv, 0, 0); const d = x2.getImageData(0, 0, tmp.width, tmp.height).data, W = tmp.width, H = tmp.height;
    let clip = 0, floorClip = 0, floorN = 0, sum = 0, n = 0, maxRow = 0, rowClip = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, l = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; sum += l; n++; const hot = l > 0.93; if (hot) { clip++; rowClip[y]++; } if (y > H * 0.62) { floorN++; if (hot) floorClip++; } }
    const grid = []; for (let gy = 0; gy < 6; gy++) { let row = ''; for (let gx = 0; gx < 10; gx++) { let c = 0, t = 0; for (let y = Math.floor(gy * H / 6); y < Math.floor((gy + 1) * H / 6); y++) for (let x = Math.floor(gx * W / 10); x < Math.floor((gx + 1) * W / 10); x++) { const i = (y * W + x) * 4; t++; if ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 > 0.93) c++; } row += (c / t > 0.5 ? '#' : c / t > 0.15 ? '+' : c / t > 0.02 ? '.' : ' '); } grid.push(row); }
    return { grid: grid.join('|'), clipPct: +(100 * clip / n).toFixed(2), floorClipPct: +(100 * floorClip / floorN).toFixed(2), meanLuma: +(sum / n).toFixed(3) };
  };
  const rows = [], base = measure(); rows.push(['all on', base]);
  const hide = (name, test) => { const hid = []; R.scene.traverse((o) => { if (o.visible && test(o)) { o.visible = false; hid.push(o); } }); const m = measure(); hid.forEach((o) => { o.visible = true; }); rows.push([`${name} (${hid.length})`, m]); };
  const mat = (o) => o.material, isBasicUntoned = (o) => o.isMesh && mat(o)?.isMeshBasicMaterial && mat(o).toneMapped === false;
  hide('untoned basic meshes (ruler, frames, timecode)', isBasicUntoned);
  hide('ruler-like: basic untoned with map & rotated flat', (o) => isBasicUntoned(o) && o.rotation.x === -Math.PI / 2);
  hide('shader meshes (light shafts)', (o) => o.isMesh && mat(o)?.isShaderMaterial && mat(o).transparent);
  hide('points (dust/motes)', (o) => o.isPoints);
  hide('emissive standard meshes', (o) => o.isMesh && mat(o)?.emissiveIntensity > 0.5 && mat(o).emissive?.getHex() > 0);
  hide('point/spot lights', (o) => o.isPointLight || o.isSpotLight);
  hide('beam fx (light puzzle rays)', (o) => o === R.beams.group);
  hide('sky', (o) => o === R.sky);
  const lt = (name, f, r) => { const old = f(); r(0); const m = measure(); r(old); rows.push([name, m]); };
  lt('key light 0', () => R.key.intensity, (v) => { R.key.intensity = v; }); lt('hemisphere 0', () => R.hemi.intensity, (v) => { R.hemi.intensity = v; }); lt('environment 0', () => R.scene.environmentIntensity, (v) => { R.scene.environmentIntensity = v; });
  hide('dressing group', (o) => o === R.dress);
  const bloom = R.post?.bloom; if (bloom) { const s = bloom.strength; bloom.strength = 0; R.post.params = null; const m = measure(); bloom.strength = s; rows.push(['bloom strength forced 0 (may be re-applied per frame)', m]); }
  return rows;
}, { id, sid, yaw: +(process.env.YAW ?? 0), pitch: +(process.env.PITCH ?? -0.12) });
console.log(`${id}/${sid}`); for (const [n, m] of out) console.log(n.padEnd(58), JSON.stringify(m));
await b.close();
