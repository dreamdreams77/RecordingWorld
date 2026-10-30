// tools/build.mjs
// Produces a static, self-contained build in dist/ that can be served from any
// static host or opened through any static file server. No bundler is required:
// the game is plain ES modules, so the build copies the shipped files and
// writes a manifest with content hashes so a release can be verified.
import { cp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'dist');
const shipped = ['index.html', 'src'];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...await walk(p));
    else files.push(p);
  }
  return files;
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const item of shipped) {
  await cp(join(root, item), join(out, item), { recursive: true });
}

const files = (await walk(out)).sort();
const manifest = {};
for (const f of files) {
  const rel = relative(out, f).split('\\').join('/');
  const hash = createHash('sha256').update(await readFile(f)).digest('hex');
  manifest[rel] = { bytes: (await stat(f)).size, sha256: hash };
}
await writeFile(join(out, 'manifest.json'), JSON.stringify({ name: 'the-world-is-a-recording', files: manifest }, null, 2) + '\n');

console.log(`Built ${files.length} files into dist/`);
