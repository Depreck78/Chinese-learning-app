// Builds public/sentences/<lesson>.json: three example sentences for every character, each
// with pinyin and an English translation. Run after changing lessons or extra sentences:
//   node scripts/build-sentences.mjs
//
// Sentences come from Tatoeba (tatoeba.org, CC BY 2.0 FR), downloaded into .cache/tatoeba.
// For each character the script prefers short sentences made of characters taught early in the
// study plan, and picks three that use the character in different words (学习 / 大学 / 学生).
// Where Tatoeba has too few, hand-written sentences from scripts/extra-sentences.md fill in; the ones
// marked "preferred" replace Tatoeba sentences that a review found wrong or unsuitable.
// scripts/sentence-fixes.json holds that review: the sentences it kept for each character (pinned,
// so a rebuild keeps them), the Tatoeba sentences it left out, and its corrected translations.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as OpenCC from 'opencc-js';
import { normalizeSentence } from './normalize-sentence.mjs';
import { annotate, isHanzi } from './pinyin.mjs';

const CACHE = '.cache/tatoeba';
const OUT = 'public/sentences';
const PER_CHARACTER = 3;
const TATOEBA = 'https://downloads.tatoeba.org/exports/per_language';
const fixes = JSON.parse(readFileSync('scripts/sentence-fixes.json', 'utf8'));
// Tatoeba sentences with typos, mistranslations or unsuitable content, left out.
const EXCLUDED = new Set(['429456', ...fixes.excluded]);

async function download(file, path) {
  if (existsSync(`${CACHE}/${file}`)) return;
  mkdirSync(CACHE, { recursive: true });
  console.log(`Downloading ${file}…`);
  const response = await fetch(`${TATOEBA}/${path}/${file}.bz2`);
  if (!response.ok) throw new Error(`Could not download ${file}: ${response.status}`);
  writeFileSync(`${CACHE}/${file}.bz2`, Buffer.from(await response.arrayBuffer()));
  execFileSync('bunzip2', ['-f', `${CACHE}/${file}.bz2`]);
}
await download('cmn_sentences.tsv', 'cmn');
await download('cmn-eng_links.tsv', 'cmn');
await download('eng_sentences.tsv', 'eng');

const rows = (file) => readFileSync(`${CACHE}/${file}`, 'utf8').trim().split('\n').map((line) => line.split('\t'));
const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });

// Lesson order doubles as a difficulty scale: characters taught earlier are easier.
const lessons = JSON.parse(readFileSync('app/lessons.json', 'utf8'));
const taughtAt = new Map();
lessons.forEach((lesson, index) => { for (const character of lesson.characters) taughtAt.set(character, index); });

// English translations: keep the shortest one linked to each Chinese sentence.
const englishIds = new Map();
for (const [chineseId, englishId] of rows('cmn-eng_links.tsv')) {
  if (!englishIds.has(chineseId)) englishIds.set(chineseId, []);
  englishIds.get(chineseId).push(englishId);
}
const wanted = new Set([...englishIds.values()].flat());
const english = new Map(rows('eng_sentences.tsv').filter(([id]) => wanted.has(id)).map(([id, , text]) => [id, text]));

const candidates = [];
const seenText = new Set();
for (const [id, , original] of rows('cmn_sentences.tsv')) {
  const translations = (englishIds.get(id) ?? []).map((englishId) => english.get(englishId)).filter(Boolean);
  if (!translations.length || EXCLUDED.has(id)) continue;
  const text = toSimplified(original.trim());
  const hanzi = Array.from(text).filter(isHanzi);
  if (seenText.has(text) || hanzi.length < 4 || hanzi.length > 22 || /[A-Za-z0-9０-９Ａ-Ｚａ-ｚ]/.test(text)) continue;
  const translation = fixes.translations[id] ?? translations.sort((first, second) => first.length - second.length)[0];
  if (translation.length > 100) continue;
  seenText.add(text);
  const difficulty = Math.max(...hanzi.map((character) => taughtAt.get(character) ?? 200));
  candidates.push({ text, translation, source: `tatoeba:${id}`, difficulty });
}

// Hand-written sentences: one per line, "字 | 中文句子 | English translation", optionally "| preferred".
const extras = new Map();
const preferred = new Map();
for (const line of readFileSync('scripts/extra-sentences.md', 'utf8').split('\n')) {
  const parts = line.split('|').map((part) => part.trim());
  if ((parts.length !== 3 && parts[3] !== 'preferred') || !isHanzi(parts[0])) continue;
  const [character, text, translation] = parts;
  const target = parts[3] === 'preferred' ? preferred : extras;
  if (!target.has(character)) target.set(character, []);
  target.get(character).push({ text, translation, source: 'hanzi-desk' });
}

const byCharacter = new Map();
for (const candidate of candidates) {
  for (const character of new Set(candidate.text)) {
    if (!taughtAt.has(character)) continue;
    if (!byCharacter.has(character)) byCharacter.set(character, []);
    byCharacter.get(character).push(candidate);
  }
}

/** The words a character appears in within a sentence, approximated by its neighbours. */
function contexts(text, character) {
  const characters = [...text];
  const found = new Set();
  characters.forEach((current, index) => {
    if (current !== character) return;
    if (isHanzi(characters[index - 1] ?? '')) found.add(characters[index - 1] + current);
    if (isHanzi(characters[index + 1] ?? '')) found.add(current + characters[index + 1]);
  });
  return found;
}

const overlap = (first, second) => {
  const shared = [...new Set(first)].filter((character) => isHanzi(character) && second.includes(character)).length;
  return shared / Math.min([...first].filter(isHanzi).length, [...second].filter(isHanzi).length);
};

const bySource = new Map(candidates.map((candidate) => [candidate.source, candidate]));
const handWritten = new Map([...preferred, ...extras].flatMap(([character, list]) => list
  .map((extra) => [`${character} hanzi-desk:${normalizeSentence(extra.text, extra.translation)}`, extra])));
const unpinned = [];

function choose(character) {
  const pins = (fixes.pinned[character] ?? []).map((ref) => bySource.get(ref) ?? handWritten.get(`${character} ${ref}`));
  if (pins.length && pins.every(Boolean)) return pins;
  if (pins.length) unpinned.push(character);
  const pool = (byCharacter.get(character) ?? [])
    .sort((first, second) => first.difficulty - second.difficulty || first.text.length - second.text.length);
  const chosen = (preferred.get(character) ?? []).slice(0, PER_CHARACTER);
  const usedContexts = new Set(chosen.flatMap((picked) => [...contexts(picked.text, character)]));
  // First pass insists on a new context each time; the second relaxes that if needed.
  for (const strict of [true, false]) {
    for (const candidate of pool) {
      if (chosen.length === PER_CHARACTER) break;
      if (chosen.includes(candidate) || chosen.some((picked) => overlap(picked.text, candidate.text) > 0.6)) continue;
      const found = contexts(candidate.text, character);
      if (strict && [...found].some((context) => usedContexts.has(context))) continue;
      chosen.push(candidate);
      for (const context of found) usedContexts.add(context);
    }
  }
  for (const extra of extras.get(character) ?? []) if (chosen.length < PER_CHARACTER) chosen.push(extra);
  return chosen;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const short = [];
let total = 0;
for (const lesson of lessons) {
  const output = {};
  for (const character of lesson.characters) {
    const chosen = choose(character);
    if (chosen.length < PER_CHARACTER) short.push(`${character}(${chosen.length})`);
    output[character] = chosen.map(({ text: raw, translation, source }) => {
      const text = normalizeSentence(raw, translation);
      const annotated = annotate(text) ?? [...text].map((part) => [part, '']);
      // [sentence, pinyin per character separated by spaces ('' for punctuation), English, source]
      return [annotated.map(([part]) => part).join(''), annotated.map(([, reading]) => reading).join(' '), translation, source];
    });
    total += chosen.length;
  }
  writeFileSync(`${OUT}/${lesson.number}.json`, `${JSON.stringify(output)}\n`);
}
writeFileSync(`${OUT}/CREDITS.txt`, `Example sentences mostly come from Tatoeba (https://tatoeba.org), licensed CC BY 2.0 FR
(https://creativecommons.org/licenses/by/2.0/fr/). Each Tatoeba sentence keeps its id as "tatoeba:<id>";
see https://tatoeba.org/sentences/show/<id> for its authors. Traditional characters were converted to
simplified and pinyin was added automatically. Sentences marked "hanzi-desk" were written for this app.
`);
console.log(`${total} sentences for ${taughtAt.size} characters in ${OUT}/`);
if (unpinned.length) console.log(`Reviewed sentences no longer found, picked afresh: ${unpinned.join(' ')}`);
if (short.length) console.log(`${short.length} characters have fewer than ${PER_CHARACTER}: ${short.join(' ')}`);
