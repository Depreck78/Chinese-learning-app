// Copies stroke-order data for every character in app/characters.ts from the
// hanzi-writer-data package into public/strokes/, so the app serves it itself
// instead of relying on a CDN (jsDelivr is unreliable in mainland China).
// Files are named by code point, e.g. 你 -> 4f60.json. Output is gitignored.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('hanzi-writer-data/package.json'));
const target = 'public/strokes';

const characters = [...readFileSync('app/characters.ts', 'utf8').matchAll(/"character":"([^"]+)"/g)].map((match) => match[1]);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
copyFileSync(join(source, 'ARPHICPL.TXT'), join(target, 'ARPHICPL.TXT'));

const missing = [];
for (const character of new Set(characters)) {
  const file = join(source, `${character}.json`);
  if (existsSync(file)) copyFileSync(file, join(target, `${character.codePointAt(0).toString(16)}.json`));
  else missing.push(character);
}

console.log(`Copied stroke data for ${characters.length - missing.length} characters to ${target}/`);
if (missing.length) console.warn(`No stroke data for: ${missing.join(' ')}`);
