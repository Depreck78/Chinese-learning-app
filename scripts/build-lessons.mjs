// Builds app/lessons.json from scripts/lessons.md, the hand-written study plan.
// Run after editing lessons.md: `node scripts/build-lessons.mjs`, then rebuild the multiple-choice
// options for the reading gaps with scripts/build-reading-choices.py.
//
// lessons.md has one section per daily lesson (30 characters):
//   ## Lesson 12
//   chars: 还部其些…            the characters taught, in order
//   title: …                    short name shown on the Study Plan
//   summary: …                  what the characters are about
//   text: …                     reading text; must contain every lesson character.
//                               Several `text:` lines become separate paragraphs.
// Pinyin comes from pinyin-pro. Where it picks the wrong reading, write the
// correct one after the character: 还{huán}. The script lists every
// multi-reading character so the choices can be reviewed.
import { readFileSync, writeFileSync } from 'node:fs';
import { pinyin } from 'pinyin-pro';
import { annotate, isHanzi } from './pinyin.mjs';

const BLANKS_PER_LESSON = 10;
const verbose = process.argv.includes('--review');

const archive = new Map([...readFileSync('app/characters.ts', 'utf8').matchAll(/"character":"([^"]+)","pinyin":"([^"]+)"/g)].map(([, character, reading]) => [character, reading]));

const lessons = [];
for (const section of readFileSync('scripts/lessons.md', 'utf8').split(/^## /m).slice(1)) {
  const [heading, ...lines] = section.split('\n');
  const field = (name) => lines.filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).trim());
  lessons.push({ heading: heading.trim(), chars: [...(field('chars')[0] ?? '')], title: field('title')[0] ?? '', summary: field('summary')[0] ?? '', paragraphs: field('text') });
}

const problems = [];
const seen = new Map();
const plain = (reading) => reading.normalize('NFC').toLowerCase();

const output = lessons.map((lesson, index) => {
  const where = `${lesson.heading}`;
  if (!lesson.title || !lesson.summary) problems.push(`${where}: missing title or summary`);
  for (const character of lesson.chars) {
    if (!archive.has(character)) problems.push(`${where}: ${character} is not in the archive`);
    if (seen.has(character)) problems.push(`${where}: ${character} is already taught in ${seen.get(character)}`);
    seen.set(character, where);
  }

  // Parse overrides like 还{huán}, then fill in pinyin for everything else in context.
  const paragraphs = lesson.paragraphs.map((source) => {
    const annotated = annotate(source);
    if (!annotated) problems.push(`${where}: pinyin alignment failed`);
    return annotated ?? [];
  });

  const allText = paragraphs.flat().map(([character]) => character).join('');
  const missing = lesson.chars.filter((character) => !allText.includes(character));
  if (missing.length) problems.push(`${where}: text is missing ${missing.join('')}`);
  if (verbose) {
    const multi = paragraphs.flat().filter(([character]) => isHanzi(character) && pinyin(character, { multiple: true, type: 'array' }).length > 1);
    console.log(`${where}: ${[...new Map(multi.map(([character, reading]) => [`${character}${reading}`, `${character}(${reading})`])).values()].join(' ')}`);
  }

  // Blank out one occurrence of up to 10 lesson characters, spread across the text, using only
  // characters whose reading here matches the lesson's pinyin so the answer is unambiguous.
  const tokens = paragraphs.flatMap((paragraph, paragraphIndex) => paragraph.map((token, position) => ({ paragraphIndex, position, token })));
  const candidates = lesson.chars
    .map((character) => tokens.find(({ token: [text, reading] }) => text === character && plain(reading) === plain(archive.get(character) ?? '')))
    .filter(Boolean)
    .sort((first, second) => first.paragraphIndex - second.paragraphIndex || first.position - second.position);
  const step = candidates.length / Math.min(BLANKS_PER_LESSON, candidates.length);
  const blanks = Array.from({ length: Math.min(BLANKS_PER_LESSON, candidates.length) }, (_, blank) => candidates[Math.floor(blank * step)]);
  if (blanks.length < Math.min(BLANKS_PER_LESSON, lesson.chars.length)) problems.push(`${where}: only ${blanks.length} characters can be blanked`);

  return {
    number: index + 1,
    title: lesson.title,
    summary: lesson.summary,
    characters: lesson.chars.join(''),
    // Each paragraph is [text, pinyin per character joined by spaces ('' for punctuation), blank positions].
    paragraphs: paragraphs.map((paragraph, paragraphIndex) => [
      paragraph.map(([character]) => character).join(''),
      paragraph.map(([, reading]) => reading).join(' '),
      blanks.filter((blank) => blank.paragraphIndex === paragraphIndex).map((blank) => blank.position),
    ]),
  };
});

const untaught = [...archive.keys()].filter((character) => !seen.has(character));
if (untaught.length) problems.push(`${untaught.length} archive characters are not in any lesson: ${untaught.slice(0, 40).join('')}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
}
writeFileSync('app/lessons.json', `${JSON.stringify(output)}\n`);
console.log(`${output.length} lessons written to app/lessons.json${problems.length ? ` with ${problems.length} problems` : ''}`);
