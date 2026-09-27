'use client';

import { BookOpen, Check, Play } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { CharacterEntry } from './characters';
import type { StudyHistoryEntry } from './progress';
import { LESSONS, STUDY_PLANS, lessonCharacters, type Lesson, type StudyMode } from './study-plan';

type PlanDay = {
  day: number;
  status: 'done' | 'today' | 'upcoming';
  title: string;
  lessons: Lesson[];
  characters: CharacterEntry[] | string[];
  /** Expected study date; only known from today onwards. */
  date: Date | null;
};

const DAYS_PER_WEEK = 7;

/** A finished day's lessons: the ones whose characters that day covered (history keeps the characters). */
function lessonsStudied(entry: StudyHistoryEntry | undefined) {
  if (!entry) return [];
  const studied = new Set(entry.characters);
  return LESSONS.filter((lesson) => Array.from(lesson.characters).every((character) => studied.has(character)));
}
const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString(undefined, options);

/** Finished days come from history; the rest are laid out from the next unfinished lesson at the chosen pace, one day at a time from today. */
function buildPlan(mode: StudyMode, lessonsDone: number, studyDays: number, history: StudyHistoryEntry[]): PlanDay[] {
  const finished = new Map(history.map((entry) => [entry.day, entry]));
  const days: PlanDay[] = [];
  for (let day = 1; day <= studyDays; day++) {
    const entry = finished.get(day);
    days.push({ day, status: 'done', title: entry?.title ?? 'Completed', lessons: lessonsStudied(entry), characters: entry?.characters ?? [], date: null });
  }
  const perDay = STUDY_PLANS[mode].lessonsPerDay;
  const today = new Date();
  for (let offset = 0, next = lessonsDone; next < LESSONS.length; offset++, next += perDay) {
    const lessons = LESSONS.slice(next, next + perDay);
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    days.push({ day: studyDays + 1 + offset, status: offset ? 'upcoming' : 'today', title: lessons.map((lesson) => lesson.title).join(' + '), lessons, characters: lessonCharacters(lessons), date });
  }
  return days;
}

export function PlanCalendar({ mode, lessonsDone, studyDays, history, completed, resuming, onStart, onRead, initialDay }: {
  mode: StudyMode;
  lessonsDone: number;
  studyDays: number;
  history: StudyHistoryEntry[];
  completed: Set<string>;
  resuming: boolean;
  onStart: () => void;
  /** Opens a finished day's reading text with the answers filled in. */
  onRead: (day: number, lessons: Lesson[]) => void;
  /** The day to show first, e.g. the one whose reading was just opened. */
  initialDay?: number;
}) {
  const days = useMemo(() => buildPlan(mode, lessonsDone, studyDays, history), [mode, lessonsDone, studyDays, history]);
  const todayDay = days.find((day) => day.status === 'today')?.day ?? null;
  const [selectedDay, setSelectedDay] = useState(initialDay ?? todayDay ?? days.at(-1)?.day ?? 1);
  const selected = days.find((day) => day.day === selectedDay) ?? days[0];
  const detailPanel = useRef<HTMLElement>(null);
  const weeks = useMemo(() => {
    const grouped: PlanDay[][] = [];
    for (let index = 0; index < days.length; index += DAYS_PER_WEEK) grouped.push(days.slice(index, index + DAYS_PER_WEEK));
    return grouped;
  }, [days]);
  const lastDate = days.at(-1)?.date;
  const doneCount = days.filter((day) => day.status === 'done').length;

  if (!selected) return null;

  function selectDay(day: number) {
    setSelectedDay(day);
    // The details sit above the calendar, so bring them into view after picking a day further down.
    window.requestAnimationFrame(() => detailPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  return (
    <section className="plan-calendar" aria-label={`Full ${STUDY_PLANS[mode].label.toLowerCase()} study plan`}>
      <header className="plan-calendar-heading">
        <div><span className="label">FULL PLAN</span><h2>{days.length} study days</h2></div>
        <p>
          {doneCount ? `${doneCount} done · ` : ''}
          {lastDate ? `Studying daily, you finish around ${formatDate(lastDate, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Every lesson is complete.'}
        </p>
      </header>
      <article ref={detailPanel} className="plan-day-detail" aria-live="polite">
        <header>
          <div>
            <span className="label">{selected.status === 'done' ? 'COMPLETED' : selected.status === 'today' ? 'TODAY' : 'UPCOMING'}</span>
            <h3>Day {selected.day}{selected.date ? ` · ${formatDate(selected.date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</h3>
          </div>
          {selected.status === 'today' && <button className="complete-day-button" onClick={onStart}><Play size={18} fill="currentColor" />{resuming ? 'Continue lesson' : 'Start lesson'}</button>}
          {selected.status === 'done' && selected.lessons.length > 0 && <button className="plan-read-button" onClick={() => onRead(selected.day, selected.lessons)}><BookOpen size={18} />Read the text</button>}
        </header>
        {selected.lessons.length ? selected.lessons.map((lesson, index) => (
          <div className="lesson-summary" key={lesson.number}><p className="lesson-theme">{selected.lessons.length > 1 ? `Part ${index + 1} · ` : ''}{lesson.title}</p><small className="lesson-focus">{lesson.summary}</small></div>
        )) : <p className="lesson-theme">{selected.title}</p>}
        {selected.characters.length > 0 && (
          <div className="lesson-preview" aria-label={`Characters on day ${selected.day}`}>
            {selected.characters.map((entry) => {
              const character = typeof entry === 'string' ? entry : entry.character;
              return <span key={character} title={typeof entry === 'string' ? undefined : `${entry.pinyin} — ${entry.definition}`} data-learned={completed.has(character) || undefined}>{character}</span>;
            })}
          </div>
        )}
      </article>
      <div className="plan-calendar-legend" aria-hidden="true">
        <span className="legend-done">Done</span><span className="legend-today">Today</span><span className="legend-upcoming">Upcoming</span>
      </div>
      <div className="plan-weeks">
        {weeks.map((week, weekIndex) => (
          <div className="plan-week" key={weekIndex}>
            <span className="plan-week-label">WEEK {weekIndex + 1}</span>
            <div className="plan-week-days">
              {week.map((day) => (
                <button
                  key={day.day}
                  className="plan-day"
                  data-status={day.status}
                  aria-pressed={day.day === selected.day}
                  aria-label={`Day ${day.day}${day.date ? `, ${formatDate(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}, ${day.title}, ${day.status}`}
                  onClick={() => selectDay(day.day)}
                >
                  <span className="plan-day-top">
                    <b>{day.day}</b>
                    {day.status === 'done' ? <Check size={14} aria-hidden="true" /> : day.date && <small>{formatDate(day.date, { day: 'numeric', month: 'short' })}</small>}
                  </span>
                  <span className="plan-day-title">{day.title}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
