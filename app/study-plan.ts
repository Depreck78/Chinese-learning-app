import { CHARACTERS, type CharacterEntry } from './characters';
import lessonsData from './lessons.json';

export type StudyMode = 'normal' | 'intensive';

/** A daily lesson from scripts/lessons.md, built by scripts/build-lessons.mjs. */
export type Lesson = {
  number: number;
  title: string;
  summary: string;
  characters: string;
  /** [text, pinyin per character separated by spaces ('' for punctuation), blanked positions] */
  paragraphs: [string, string, number[]][];
};

export const LESSONS = lessonsData as Lesson[];

export const STUDY_PLANS: Record<StudyMode, { label: string; time: string; lessonsPerDay: number; description: string }> = {
  normal: {
    label: 'Normal',
    time: '1 hour per day',
    lessonsPerDay: 1,
    description: 'One lesson of 30 characters a day: trace each character ten times, then finish with a short reading.',
  },
  intensive: {
    label: 'Intensive',
    time: '2–3 hours per day',
    lessonsPerDay: 2,
    description: 'Two lessons back to back, 60 characters a day, each finishing with a short reading.',
  },
};

export const TRACES_TO_COMPLETE = 10;

/** A lesson in progress, saved so it can be resumed. `step` counts characters; the last step is the reading. */
export type ActiveLesson = { mode: StudyMode; lessons: number[]; step: number; traces: Record<string, number> };

export function lessonsForDay(mode: StudyMode, lessonsDone: number) {
  return LESSONS.slice(lessonsDone, lessonsDone + STUDY_PLANS[mode].lessonsPerDay);
}

const CHARACTER_BY_ID = new Map(CHARACTERS.map((entry) => [entry.character, entry]));

export function lessonCharacters(lessons: Lesson[]): CharacterEntry[] {
  return lessons.flatMap((lesson) => Array.from(lesson.characters)).map((character) => CHARACTER_BY_ID.get(character)).filter((entry): entry is CharacterEntry => Boolean(entry));
}

const TONE_MARKS = ['āēīōūǖ', 'áéíóúǘ', 'ǎěǐǒǔǚ', 'àèìòùǜ'];

/** Normalises a single pinyin syllable so "nǐ", "ni3" and "NI3" compare equal; no tone means neutral. */
export function normalizePinyin(value: string) {
  let tone = 0;
  let letters = '';
  for (const character of value.trim().toLowerCase().normalize('NFC')) {
    const toneIndex = TONE_MARKS.findIndex((marks) => marks.includes(character));
    if (toneIndex >= 0) {
      tone = toneIndex + 1;
      letters += 'aeiouü'[TONE_MARKS[toneIndex].indexOf(character)];
    } else if (/[1-5]/.test(character)) {
      tone = Number(character);
    } else if (/[a-zü]/.test(character)) {
      letters += character;
    }
  }
  return `${letters.replace(/v/g, 'ü')}${tone || 5}`;
}

// Everyday alternatives to the dictionary reading that should also count as right.
const ALSO_ACCEPTED: Record<string, string[]> = { 谁: ['shéi', 'shuí'] };

export function pinyinMatches(character: string, answer: string, expected: string) {
  const given = normalizePinyin(answer);
  return [expected, ...(ALSO_ACCEPTED[character] ?? [])].some((reading) => normalizePinyin(reading) === given);
}
