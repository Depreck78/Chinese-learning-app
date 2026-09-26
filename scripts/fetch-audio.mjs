// Downloads the pronunciation recordings listed in scripts/audio-sources.json
// into public/audio/ and writes app/recordings.json (text -> file) for the app.
// Run after editing audio-sources.json: `node scripts/fetch-audio.mjs`.
// Needs ffmpeg to convert Wikimedia Commons .ogg/.wav files to .mp3.
//
// audio-sources.json picks one recording per character. Sources, best first:
// - hsk:       audio-cmn HSK recordings by Yue Tan (CC BY-SA). `item` is the
//              recorded character. Every character of the same syllable and
//              tone sounds the same, so rare characters borrow a common one's
//              recording (俱 uses 句). Recordings were pitch-checked against
//              the app's tone, which also rejects the other reading of
//              characters with two pronunciations.
// - commons:   Wikimedia Commons: Yue Tan's pinyin syllables (Zh-*.ogg, CC BY-SA)
//              and Lingua Libre words by Luilui6666 (LL-*.wav, CC BY-SA 4.0).
// - syllable:  audio-cmn pinyin syllables by Chen Wang (CC BY-SA). Some have a
//              rough, creaky sound, so they are only used when nothing else exists.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const AUDIO_CMN = 'https://raw.githubusercontent.com/hugolpz/audio-cmn/master/64k';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia throttles requests without a descriptive User-Agent.
const USER_AGENT = 'HanziDesk/1.0 (https://github.com/Depreck78/Chinese-learning-app)';
const OUT = 'public/audio';

const sources = JSON.parse(readFileSync('scripts/audio-sources.json', 'utf8'));
const hex = (text) => Array.from(text, (character) => character.codePointAt(0).toString(16)).join('-');

function plan({ source, item, title, name }, text) {
  if (source === 'hsk') return { file: `hsk-${hex(item)}.mp3`, url: `${AUDIO_CMN}/hsk/cmn-${encodeURIComponent(item)}.mp3` };
  if (source === 'syllable') return { file: `syl-${item}.mp3`, url: `${AUDIO_CMN}/syllabs/cmn-${item}.mp3` };
  if (source === 'commons') return { file: title.startsWith('Zh-') ? `zh-${name}.mp3` : `ll-${hex(text)}.mp3`, title, convert: true };
  throw new Error(`Unknown audio source for ${text}: ${source}`);
}

const recordings = { characters: {}, words: {} };
const downloads = new Map();
for (const kind of ['characters', 'words']) {
  for (const [text, source] of Object.entries(sources[kind])) {
    const { file, ...download } = plan(source, text);
    recordings[kind][text] = file;
    downloads.set(file, download);
  }
}

mkdirSync(OUT, { recursive: true });
const pending = [...downloads].filter(([file]) => !existsSync(`${OUT}/${file}`));
let failed = 0;

// Look up direct file URLs for Commons titles, 50 per API request.
const titles = pending.filter(([, { title }]) => title).map(([, { title }]) => `File:${title}`);
const commonsUrls = new Map();
for (let index = 0; index < titles.length; index += 50) {
  const query = new URLSearchParams({ action: 'query', prop: 'imageinfo', iiprop: 'url', format: 'json', titles: titles.slice(index, index + 50).join('|') });
  const { query: result } = await (await fetch(`${COMMONS_API}?${query}`, { headers: { 'User-Agent': USER_AGENT } })).json();
  const original = new Map((result.normalized ?? []).map(({ from, to }) => [to, from]));
  for (const page of Object.values(result.pages)) {
    if (page.imageinfo) commonsUrls.set((original.get(page.title) ?? page.title).slice('File:'.length), page.imageinfo[0].url);
  }
}
for (const [, download] of pending) {
  if (download.title) download.url = commonsUrls.get(download.title) ?? `missing:${download.title}`;
}

async function download(file, { url, convert }) {
  if (url.startsWith('missing:')) { failed += 1; console.warn(`Not found on Wikimedia Commons: ${url.slice(8)}`); return; }
  // Wikimedia rate-limits bursts (HTTP 429), so back off and retry.
  let response;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.status !== 429) break;
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
  if (!response.ok) { failed += 1; console.warn(`Failed to download ${url}: ${response.status}`); return; }
  const data = Buffer.from(await response.arrayBuffer());
  if (!convert) return writeFileSync(`${OUT}/${file}`, data);
  const temp = `${OUT}/.${file}.src`;
  writeFileSync(temp, data);
  // Match the audio-cmn files: mono 22 kHz MP3 (Safari can't decode Ogg on older iPhones).
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', temp, '-ac', '1', '-ar', '22050', '-b:a', '64k', `${OUT}/${file}`]);
  rmSync(temp);
}

// GitHub files download in parallel; Wikimedia Commons files one at a time.
const github = pending.filter(([, { convert }]) => !convert);
const commons = pending.filter(([, { convert }]) => convert);
await Promise.all([
  ...Array.from({ length: 8 }, async () => {
    for (let next = github.shift(); next; next = github.shift()) await download(...next);
  }),
  (async () => {
    for (const next of commons) {
      await download(...next);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })(),
]);
if (failed) throw new Error(`${failed} recordings failed to download; run the script again.`);

writeFileSync('app/recordings.json', `${JSON.stringify(recordings)}\n`);
const characters = [...readFileSync('app/characters.ts', 'utf8').matchAll(/"character":"([^"]+)"/g)].map((match) => match[1]);
console.log(`${downloads.size} recordings in ${OUT}/`);
console.log(`Characters using the device voice: ${characters.filter((character) => !recordings.characters[character]).join(' ') || 'none'}`);
