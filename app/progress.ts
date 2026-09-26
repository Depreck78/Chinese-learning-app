// A learner's progress, kept on the device and merged with the account's copy when syncing.
// Used by both the app and the /api/sync route, so it must not import browser-only or heavy modules.
import type { ActiveLesson, StudyMode } from './study-plan';

export type StudyHistoryEntry = {
  day: number;
  mode: StudyMode;
  title: string;
  characters: string[];
};

type Stamped<T> = { value: T; at: number };
type MarkKind = 'completed' | 'saved';

/**
 * Each part remembers when it last changed (`at`, in ms), so two devices merge cleanly:
 * the newer change wins, including un-marking a character. Day and lesson counts only grow.
 */
export type Progress = {
  version: 1;
  /** "completed:你" or "saved:你" → whether it is on. */
  marks: Record<string, Stamped<boolean>>;
  studyMode: Stamped<StudyMode>;
  activeLesson: Stamped<ActiveLesson | null>;
  lessonsDone: number;
  studyDays: number;
  /** Finished days, keyed by day number. */
  history: Record<string, Stamped<StudyHistoryEntry>>;
};

export function emptyProgress(): Progress {
  return { version: 1, marks: {}, studyMode: { value: 'normal', at: 0 }, activeLesson: { value: null, at: 0 }, lessonsDone: 0, studyDays: 0, history: {} };
}

export function mergeProgress(local: Progress, remote: Progress): Progress {
  const newer = <T>(first: Stamped<T>, second: Stamped<T>) => (second.at > first.at ? second : first);
  const mergeRecords = <T>(first: Record<string, Stamped<T>>, second: Record<string, Stamped<T>>) => {
    const merged = { ...first };
    for (const [key, value] of Object.entries(second)) merged[key] = merged[key] ? newer(merged[key], value) : value;
    return merged;
  };
  return {
    version: 1,
    marks: mergeRecords(local.marks, remote.marks),
    studyMode: newer(local.studyMode, remote.studyMode),
    activeLesson: newer(local.activeLesson, remote.activeLesson),
    lessonsDone: Math.max(local.lessonsDone, remote.lessonsDone),
    studyDays: Math.max(local.studyDays, remote.studyDays),
    history: mergeRecords(local.history, remote.history),
  };
}

export function markedCharacters(progress: Progress, kind: MarkKind) {
  return Object.entries(progress.marks)
    .filter(([key, mark]) => mark.value && key.startsWith(`${kind}:`))
    .sort(([, first], [, second]) => first.at - second.at)
    .map(([key]) => key.slice(kind.length + 1));
}

export function setMarks(progress: Progress, kind: MarkKind, characters: string[], on: boolean): Progress {
  const at = Date.now();
  const marks = { ...progress.marks };
  for (const character of characters) {
    if (Boolean(marks[`${kind}:${character}`]?.value) !== on) marks[`${kind}:${character}`] = { value: on, at };
  }
  return { ...progress, marks };
}

export function setStudyMode(progress: Progress, mode: StudyMode): Progress {
  return { ...progress, studyMode: { value: mode, at: Date.now() } };
}

export function setActiveLesson(progress: Progress, lesson: ActiveLesson | null): Progress {
  return { ...progress, activeLesson: { value: lesson, at: Date.now() } };
}

export function finishDay(progress: Progress, entry: StudyHistoryEntry, lessonsDone: number): Progress {
  const at = Date.now();
  return {
    ...setMarks(progress, 'completed', entry.characters, true),
    history: { ...progress.history, [entry.day]: { value: entry, at } },
    studyDays: Math.max(progress.studyDays, entry.day),
    lessonsDone: Math.max(progress.lessonsDone, lessonsDone),
    activeLesson: { value: null, at },
  };
}

export function historyEntries(progress: Progress) {
  return Object.values(progress.history).map(({ value }) => value).sort((first, second) => first.day - second.day);
}

// --- Checking untrusted data (from the network or old storage) ---

const LIMIT = 20000;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const stamp = (value: unknown) => (isObject(value) && typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : null);
const count = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100000 ? value : 0);
const shortString = (value: unknown, max = 200) => (typeof value === 'string' && value.length <= max ? value : null);

function readActiveLesson(value: unknown): ActiveLesson | null {
  if (!isObject(value) || (value.mode !== 'normal' && value.mode !== 'intensive') || !Array.isArray(value.lessons) || !isObject(value.traces)) return null;
  const lessons = value.lessons.filter((lesson): lesson is number => typeof lesson === 'number' && Number.isInteger(lesson)).slice(0, 4);
  const traces = Object.fromEntries(Object.entries(value.traces).filter(([key, traced]) => key.length <= 4 && typeof traced === 'number').slice(0, 200)) as Record<string, number>;
  return { mode: value.mode, lessons, step: count(value.step), traces };
}

function readHistoryEntry(value: unknown): StudyHistoryEntry | null {
  if (!isObject(value) || (value.mode !== 'normal' && value.mode !== 'intensive') || !Array.isArray(value.characters)) return null;
  const title = shortString(value.title);
  if (title === null) return null;
  return { day: count(value.day), mode: value.mode, title, characters: value.characters.filter((character): character is string => typeof character === 'string' && character.length <= 4).slice(0, 200) };
}

/** Rebuilds a Progress from untrusted JSON, dropping anything malformed. */
export function readProgress(raw: unknown): Progress {
  const progress = emptyProgress();
  if (!isObject(raw)) return progress;
  if (isObject(raw.marks)) {
    for (const [key, mark] of Object.entries(raw.marks).slice(0, LIMIT)) {
      const at = stamp(mark);
      if (at !== null && /^(completed|saved):.{1,4}$/u.test(key) && isObject(mark) && typeof mark.value === 'boolean') progress.marks[key] = { value: mark.value, at };
    }
  }
  if (isObject(raw.studyMode) && (raw.studyMode.value === 'normal' || raw.studyMode.value === 'intensive')) {
    progress.studyMode = { value: raw.studyMode.value, at: stamp(raw.studyMode) ?? 0 };
  }
  if (isObject(raw.activeLesson)) progress.activeLesson = { value: readActiveLesson(raw.activeLesson.value), at: stamp(raw.activeLesson) ?? 0 };
  progress.lessonsDone = count(raw.lessonsDone);
  progress.studyDays = count(raw.studyDays);
  if (isObject(raw.history)) {
    for (const [day, stamped] of Object.entries(raw.history).slice(0, 1000)) {
      const entry = isObject(stamped) ? readHistoryEntry(stamped.value) : null;
      const at = stamp(stamped);
      if (entry && at !== null) progress.history[day] = { value: entry, at };
    }
  }
  return progress;
}

// --- On-device storage ---

// Progress made while signed out, and each account's own copy, are kept apart on the device.
const GUEST_KEY = 'hanzi-progress';
const storageKey = (userId: number | null) => (userId === null ? GUEST_KEY : `hanzi-progress-account-${userId}`);

/** Whether any study has been done: something marked, a lesson started or finished. */
export function hasProgress(progress: Progress) {
  return Object.values(progress.marks).some((mark) => mark.value) || progress.activeLesson.value !== null || progress.lessonsDone > 0 || progress.studyDays > 0;
}

/**
 * Loads the progress on this device for an account, or for signed-out use when `userId` is null.
 * Signed-out progress written by older versions (one key per setting) is converted the first time.
 */
export function loadProgress(userId: number | null = null): Progress {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (stored) return readProgress(JSON.parse(stored));
    if (userId !== null) return emptyProgress();
    const legacy = (key: string, fallback: string) => JSON.parse(localStorage.getItem(`hanzi-${key}`) ?? fallback);
    // Older data gets an ancient timestamp so any change made since, on any device, wins.
    const old = 1;
    let progress = emptyProgress();
    for (const kind of ['completed', 'saved'] as const) {
      for (const character of legacy(kind, '[]') as string[]) progress.marks[`${kind}:${character}`] = { value: true, at: old };
    }
    progress.studyMode = { value: localStorage.getItem('hanzi-study-mode') === 'intensive' ? 'intensive' : 'normal', at: old };
    progress.activeLesson = { value: readActiveLesson(legacy('active-lesson', 'null')), at: old };
    progress.lessonsDone = count(Number(localStorage.getItem('hanzi-lessons-done') ?? 0));
    progress.studyDays = count(Number(localStorage.getItem('hanzi-study-days') ?? 0));
    for (const entry of legacy('study-history', '[]') as unknown[]) {
      const read = readHistoryEntry(entry);
      if (read) progress.history[read.day] = { value: read, at: old };
    }
    progress = readProgress(progress);
    saveProgress(progress);
    return progress;
  } catch {
    return emptyProgress();
  }
}

/** Removes an account's copy from this device, after the account is deleted. */
export function forgetProgress(userId: number) {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to clean up.
  }
}

export function saveProgress(progress: Progress, userId: number | null = null) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    // Storage full or blocked: progress still lives in memory for this visit.
  }
}
