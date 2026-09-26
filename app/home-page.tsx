'use client';

import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Flame, Play, Star, Target, Trophy, Tv } from 'lucide-react';
import { useMemo, useSyncExternalStore } from 'react';
import { CHARACTERS, type CharacterEntry } from './characters';
import { DICTIONARY_FILTERS, matchesFilter } from './dictionary-filters';
import type { Progress } from './progress';
import { LESSONS, STUDY_PLANS, type Lesson, type StudyMode } from './study-plan';

type HomeView = 'study-plan' | 'review' | 'fun';

const DAY_MS = 24 * 60 * 60 * 1000;
const MILESTONES = [10, 30, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, CHARACTERS.length];
// Progress saved by older versions carries this placeholder time, which says nothing about when it happened.
const isRealTime = (at: number) => at > 1;
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const TONE_PATTERNS = [/[āēīōūǖ]/, /[áéíóúǘ]/, /[ǎěǐǒǔǚ]/, /[àèìòùǜ]/];
function tone(pinyin: string) {
  const syllable = pinyin.split(/[,\s/]/)[0] ?? '';
  return TONE_PATTERNS.findIndex((pattern) => pattern.test(syllable)) + 1; // 0 = neutral
}

// Today's date as the browser sees it; empty while rendering on the server, where the viewer's clock is unknown.
const subscribeToNothing = () => () => {};
const todayKey = () => dayKey(new Date());
function useToday() {
  const key = useSyncExternalStore(subscribeToNothing, todayKey, () => '');
  return useMemo(() => {
    if (!key) return null;
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, new Date().getHours());
  }, [key]);
}

const QUOTES = [
  { chinese: '学而时习之，不亦说乎？', pinyin: 'Xué ér shí xí zhī, bù yì yuè hū?', english: 'Isn’t it a joy to learn something and practise it often? (Confucius)' },
  { chinese: '坚持就是胜利。', pinyin: 'Jiānchí jiù shì shènglì.', english: 'Keeping at it is how you win.' },
  { chinese: '活到老，学到老。', pinyin: 'Huó dào lǎo, xué dào lǎo.', english: 'Keep learning as long as you live.' },
  { chinese: '功夫不负有心人。', pinyin: 'Gōngfu bù fù yǒuxīnrén.', english: 'Hard work pays off for those who stick with it.' },
  { chinese: '一步一个脚印。', pinyin: 'Yí bù yí gè jiǎoyìn.', english: 'One step, one footprint: steady progress.' },
  { chinese: '熟能生巧。', pinyin: 'Shú néng shēng qiǎo.', english: 'Practice makes perfect.' },
];

/** Every calendar day (local time) with study activity: learned characters, traced lesson steps and finished days. */
function activityDays(progress: Progress) {
  const days = new Set<string>();
  for (const [key, mark] of Object.entries(progress.marks)) {
    if (key.startsWith('completed:') && mark.value && isRealTime(mark.at)) days.add(dayKey(new Date(mark.at)));
  }
  for (const { at } of Object.values(progress.history)) if (isRealTime(at)) days.add(dayKey(new Date(at)));
  if (progress.activeLesson.value && isRealTime(progress.activeLesson.at)) days.add(dayKey(new Date(progress.activeLesson.at)));
  return days;
}

function streaks(days: Set<string>, today: Date) {
  const studiedToday = days.has(dayKey(today));
  let current = 0;
  for (let date = studiedToday ? today : addDays(today, -1); days.has(dayKey(date)); date = addDays(date, -1)) current++;
  const sorted = [...days].map((key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((time, index) => {
    run = index && Math.round((time - sorted[index - 1]) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return { current, best: Math.max(best, current), studiedToday };
}

function cheer({ learned, current, studiedToday, lessonsLeft }: { learned: number; current: number; studiedToday: boolean; lessonsLeft: number }) {
  if (!lessonsLeft) return { chinese: '太棒了！', pinyin: 'Tài bàng le!', message: 'You have finished every lesson. Keep your characters fresh in Review and enjoy some Chinese shows in Fun Learning.' };
  if (!learned) return { chinese: '千里之行，始于足下。', pinyin: 'Qiān lǐ zhī xíng, shǐ yú zú xià.', message: 'A journey of a thousand miles begins with a single step. Your first lesson takes about an hour. Start it today!' };
  if (studiedToday) return { chinese: '做得好！', pinyin: 'Zuò de hǎo!', message: current > 1 ? `You studied today and your streak is ${current} days. See you again tomorrow!` : 'You studied today. Come back tomorrow to start a streak!' };
  if (current) return { chinese: '加油！', pinyin: 'Jiāyóu!', message: `You're on a ${current}-day streak. Study today to make it ${current + 1}!` };
  return { chinese: '欢迎回来！', pinyin: 'Huānyíng huílai!', message: `Welcome back! You already know ${learned.toLocaleString()} characters. One lesson today starts a new streak.` };
}

export function HomePage({ progress, learned, savedCount, mode, lessons, resuming, username, onStartLesson, onNavigate, onOpenCharacter }: {
  progress: Progress;
  /** Learned characters, oldest first. */
  learned: CharacterEntry[];
  savedCount: number;
  mode: StudyMode;
  lessons: Lesson[];
  resuming: boolean;
  username: string | null;
  onStartLesson: () => void;
  onNavigate: (view: HomeView) => void;
  onOpenCharacter: (entry: CharacterEntry) => void;
}) {
  const today = useToday();

  const days = useMemo(() => activityDays(progress), [progress]);
  const topics = useMemo(() => {
    const learnedSet = new Set(learned.map((entry) => entry.character));
    return DICTIONARY_FILTERS.filter((filter) => filter.id !== 'all').map((filter) => {
      const all = CHARACTERS.filter((entry) => matchesFilter(entry, filter.id));
      return { label: filter.label, total: all.length, known: all.filter((entry) => learnedSet.has(entry.character)).length };
    }).filter((topic) => topic.known).sort((a, b) => b.known / b.total - a.known / a.total || b.known - a.known).slice(0, 4);
  }, [learned]);
  const tones = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const entry of learned) counts[tone(entry.pinyin)]++;
    return counts;
  }, [learned]);

  const plan = STUDY_PLANS[mode];
  const lessonsLeft = LESSONS.length - progress.lessonsDone;
  const percent = learned.length / CHARACTERS.length * 100;
  const nextMilestone = MILESTONES.find((milestone) => milestone > learned.length);
  const recent = [...learned].reverse().slice(0, 12);

  if (!today) return <section className="page-main home-page" aria-busy="true" />;

  const { current, best, studiedToday } = streaks(days, today);
  const weekAgo = addDays(today, -6).getTime();
  const learnedThisWeek = Object.entries(progress.marks).filter(([key, mark]) => key.startsWith('completed:') && mark.value && isRealTime(mark.at) && mark.at >= weekAgo).length;
  const lastSeven = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const finishDate = lessonsLeft ? addDays(today, Math.ceil(lessonsLeft / plan.lessonsPerDay) - 1) : null;
  const message = cheer({ learned: learned.length, current, studiedToday, lessonsLeft });
  const quote = QUOTES[Math.floor(today.getTime() / DAY_MS) % QUOTES.length];
  const maxTone = Math.max(...tones, 1);
  const hour = today.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <section className="page-main home-page">
      <header className="page-heading home-heading">
        <div><span className="label">{today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</span><h1>{greeting}{username ? `, ${username}` : ''}</h1></div>
      </header>

      <div className="home-grid">
        <section className="home-cheer" aria-live="polite">
          <p className="cheer-chinese" lang="zh-CN">{message.chinese}</p>
          <p className="cheer-pinyin">{message.pinyin}</p>
          <p className="cheer-message">{message.message}</p>
          {lessons.length > 0 && (
            <div className="cheer-lesson">
              <div><span className="label">TODAY · DAY {progress.studyDays + 1}</span><b>{lessons.map((lesson) => lesson.title).join(' + ')}</b></div>
              <button className="complete-day-button" onClick={onStartLesson}><Play size={18} fill="currentColor" />{resuming ? 'Continue lesson' : 'Start lesson'}</button>
            </div>
          )}
        </section>

        <section className="home-streak" aria-label="Study streak">
          <div className="streak-count"><Flame size={30} aria-hidden="true" /><strong>{current}</strong><span>day streak</span></div>
          <p>{studiedToday ? 'You studied today.' : current ? 'Study today to keep your streak going.' : 'Study today to start a streak.'} Best: <b>{best} {best === 1 ? 'day' : 'days'}</b></p>
          <ol className="streak-week" aria-label="The last seven days">
            {lastSeven.map((date) => {
              const active = days.has(dayKey(date));
              return (
                <li key={dayKey(date)} data-active={active || undefined} data-today={dayKey(date) === dayKey(today) || undefined}>
                  <span>{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                  <i aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long' })}: ${active ? 'studied' : 'no study'}`} />
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <dl className="home-stats">
        <div><dt><BookOpen size={17} />Characters learned</dt><dd>{learned.length.toLocaleString()}<small> / {CHARACTERS.length.toLocaleString()}</small></dd><div className="stat-bar"><span style={{ width: `${percent}%` }} /></div><p>{percent < 1 && learned.length ? '<1' : Math.round(percent)}% of the dictionary</p></div>
        <div><dt><CalendarDays size={17} />Lessons done</dt><dd>{progress.lessonsDone}<small> / {LESSONS.length}</small></dd><div className="stat-bar"><span style={{ width: `${progress.lessonsDone / LESSONS.length * 100}%` }} /></div><p>{progress.studyDays} study {progress.studyDays === 1 ? 'day' : 'days'} so far</p></div>
        <div><dt><Target size={17} />This week</dt><dd>{learnedThisWeek}<small> new</small></dd><p>characters learned in the last 7 days</p></div>
        <div><dt><Trophy size={17} />Next milestone</dt><dd>{nextMilestone ? nextMilestone.toLocaleString() : 'All done'}</dd><p>{nextMilestone ? `${(nextMilestone - learned.length).toLocaleString()} more characters to go` : 'You know every character here'}</p></div>
        <div><dt><Star size={17} />Saved</dt><dd>{savedCount}</dd><p>characters starred to revisit</p></div>
        <div><dt><ClipboardCheck size={17} />Finish line</dt><dd>{finishDate ? finishDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Finished'}</dd><p>{finishDate ? `at the ${plan.label.toLowerCase()} pace, studying daily` : 'every lesson is complete'}</p></div>
      </dl>

      <div className="home-grid home-details">
        <section className="home-panel">
          <h2>Tones you know</h2>
          {learned.length ? (
            <ul className="tone-bars">
              {[1, 2, 3, 4, 0].map((number) => (
                <li key={number}><span>{number ? `Tone ${number}` : 'Neutral'}</span><div className="stat-bar"><span style={{ width: `${tones[number] / maxTone * 100}%` }} /></div><b>{tones[number]}</b></li>
              ))}
            </ul>
          ) : <p className="home-empty">Learn a few characters to see how your tones add up.</p>}
        </section>
        <section className="home-panel">
          <h2>Strongest topics</h2>
          {topics.length ? (
            <ul className="tone-bars topic-bars">
              {topics.map((topic) => (
                <li key={topic.label}><span>{topic.label}</span><div className="stat-bar"><span style={{ width: `${topic.known / topic.total * 100}%` }} /></div><b>{topic.known}/{topic.total}</b></li>
              ))}
            </ul>
          ) : <p className="home-empty">Topics like Numbers, Family and Food fill up as you learn.</p>}
        </section>
      </div>

      {recent.length > 0 && (
        <section className="home-panel home-recent">
          <h2>Recently learned</h2>
          <div className="lesson-preview">
            {recent.map((entry) => <button key={entry.character} onClick={() => onOpenCharacter(entry)} title={`${entry.pinyin} — ${entry.definition}`} aria-label={`Open ${entry.character}, ${entry.pinyin}`}>{entry.character}</button>)}
          </div>
        </section>
      )}

      <section className="home-quote">
        <span className="label">SAYING OF THE DAY</span>
        <p lang="zh-CN">{quote.chinese}</p>
        <small>{quote.pinyin} · {quote.english}</small>
      </section>

      <nav className="home-links" aria-label="Keep going">
        <button onClick={() => onNavigate('study-plan')}><CalendarDays size={20} /><span><b>Study Plan</b><small>See today&apos;s lesson and the full plan</small></span><ArrowRight size={18} /></button>
        <button onClick={() => onNavigate('review')}><ClipboardCheck size={20} /><span><b>Review</b><small>Test yourself on what you&apos;ve learned</small></span><ArrowRight size={18} /></button>
        <button onClick={() => onNavigate('fun')}><Tv size={20} /><span><b>Fun Learning</b><small>Chinese shows, anime and films</small></span><ArrowRight size={18} /></button>
      </nav>
    </section>
  );
}
