import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Mic, Star, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import readingChoices from './reading-choices.json';
import { lessonCharacters, TRACES_TO_COMPLETE, type ActiveLesson, type Lesson } from './study-plan';
import { ExampleSentences } from './example-sentences';
import { pronounce } from './pronunciation';
import { VideoPanel } from './video-panel';
import { WritingPad } from './writing-pad';

type LessonSessionProps = {
  lessons: Lesson[];
  dayNumber: number;
  progress: ActiveLesson;
  onProgress: (update: (progress: ActiveLesson) => ActiveLesson) => void;
  completed: Set<string>;
  saved: Set<string>;
  onMarkCompleted: (character: string) => void;
  onToggleSaved: (character: string) => void;
  onExit: () => void;
  onFinish: () => void;
  online: boolean;
};

/** A day's lesson: every character in turn, then the fill-in reading. */
export function LessonSession({ lessons, dayNumber, progress, onProgress, completed, saved, onMarkCompleted, onToggleSaved, onExit, onFinish, online }: LessonSessionProps) {
  const characters = useMemo(() => lessonCharacters(lessons), [lessons]);
  const step = Math.min(progress.step, characters.length);
  const entry = characters[step];
  const traced = entry ? Math.min(progress.traces[entry.character] ?? 0, TRACES_TO_COMPLETE) : 0;
  const percent = ((step + traced / TRACES_TO_COMPLETE) / (characters.length + 1)) * 100;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  function goTo(nextStep: number) {
    onProgress((current) => ({ ...current, step: Math.max(0, Math.min(nextStep, characters.length)) }));
  }

  function completeCharacter(character: string) {
    onMarkCompleted(character);
    goTo(step + 1);
  }

  function recordTrace() {
    if (!entry) return;
    const count = (progress.traces[entry.character] ?? 0) + 1;
    onProgress((current) => ({ ...current, traces: { ...current.traces, [entry.character]: count } }));
    if (count >= TRACES_TO_COMPLETE) completeCharacter(entry.character);
  }

  return (
    <div className="lesson-main lesson-session">
      <header className="session-progress">
        <button className="session-exit" onClick={onExit} aria-label="Exit lesson (your progress is saved)"><X size={18} /><span>Exit</span></button>
        <div className="session-progress-body">
          <p><strong>Day {dayNumber}</strong><span>{entry ? `Character ${step + 1} of ${characters.length}` : 'Final reading'}</span></p>
          <progress className="session-bar" value={percent} max={100} aria-label="Lesson progress" />
        </div>
      </header>

      {entry ? (
        <>
          <section className="character-header"><div className="character-identity"><span className="label">DAY {dayNumber} · CHARACTER {step + 1} OF {characters.length}</span><div className="identity-line"><h1>{entry.character}</h1><div><button className="pronounce" onClick={() => pronounce(entry.character)} aria-label={`Hear ${entry.character} pronounced`}><Volume2 size={21} /></button><p className="pinyin">{entry.pinyin}</p><p className="definition">{entry.definition}</p></div></div></div>
            <div className="character-actions">
              <button className={`save-button ${saved.has(entry.character) ? 'saved' : ''}`} onClick={() => onToggleSaved(entry.character)} aria-pressed={saved.has(entry.character)} aria-label={saved.has(entry.character) ? 'Saved' : 'Save'} title={saved.has(entry.character) ? 'Saved' : 'Save'}><Star size={18} fill={saved.has(entry.character) ? 'currentColor' : 'none'} /><span className="button-label">{saved.has(entry.character) ? 'Saved' : 'Save'}</span></button>
              <button className={`complete-button ${completed.has(entry.character) ? 'done' : ''}`} onClick={() => completeCharacter(entry.character)} aria-label="Mark completed and go to the next character" title="Mark completed"><Check size={18} strokeWidth={completed.has(entry.character) ? 3 : 2} /><span className="button-label">Mark completed</span></button>
            </div>
          </section>

          <section className="trace-goal" aria-live="polite">
            <div><span className="label">TRACE IT {TRACES_TO_COMPLETE} TIMES</span><p>Writing it in a notebook instead? Tap <Check size={14} aria-label="Mark completed" /> when you’re done.</p></div>
            <div className="trace-dots" aria-label={`${traced} of ${TRACES_TO_COMPLETE} traces done`}>
              {Array.from({ length: TRACES_TO_COMPLETE }, (_, index) => <span key={index} data-done={index < traced || undefined} />)}
              <strong>{traced}/{TRACES_TO_COMPLETE}</strong>
            </div>
          </section>

          <div className="study-grid">
            <WritingPad key={`${entry.character}-${step}`} character={entry.character} onTrace={recordTrace} />
            <VideoPanel key={entry.character} character={entry.character} videoId={entry.videoId} online={online} />
          </div>

          <ExampleSentences character={entry.character} lessonNumber={lessons.find((lesson) => lesson.characters.includes(entry.character))?.number ?? lessons[0].number} />

          <nav className="lesson-nav" aria-label="Lesson navigation">
            <button disabled={step === 0} onClick={() => goTo(step - 1)}><ArrowLeft size={18} />Previous</button>
            <span>{step + 1} of {characters.length}</span>
            <button onClick={() => goTo(step + 1)}>{step === characters.length - 1 ? 'Go to reading' : 'Skip for now'}<ArrowRight size={18} /></button>
          </nav>
        </>
      ) : (
        <ReadingExercise key={lessons.map((lesson) => lesson.number).join('-')} lessons={lessons} dayNumber={dayNumber} onBack={() => goTo(characters.length - 1)} onFinish={onFinish} />
      )}
    </div>
  );
}

type Blank = { id: string; character: string; pinyin: string; number: number };
/** Three options per gap, the answer among them: [character, pinyin] (scripts/build-reading-choices.py). */
const CHOICES: Record<string, string[][]> = readingChoices;

/** The gaps of a day's reading, numbered in reading order. */
function readingBlanks(lessons: Lesson[]) {
  const found = new Map<string, Blank>();
  lessons.forEach((lesson) => lesson.paragraphs.forEach(([text, pinyin, positions], paragraphIndex) => {
    const characters = Array.from(text);
    const readings = pinyin.split(' ');
    for (const position of positions) {
      const id = `${lesson.number}-${paragraphIndex}-${position}`;
      found.set(id, { id, character: characters[position], pinyin: readings[position], number: found.size + 1 });
    }
  }));
  return found;
}

const PINYIN_KEY = 'hanzi-reading-pinyin';

/** Whether readings show pinyin; remembered on this device. */
function usePinyinShown() {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(PINYIN_KEY) !== 'hidden';
    } catch {
      return true;
    }
  });
  function toggle() {
    setShown(!shown);
    try {
      localStorage.setItem(PINYIN_KEY, shown ? 'hidden' : 'shown');
    } catch {
      // Not remembered, which is fine.
    }
  }
  return [shown, toggle] as const;
}

function PinyinToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="pinyin-toggle" onClick={onToggle} aria-pressed={!shown}>
      {shown ? <EyeOff size={15} /> : <Eye size={15} />}{shown ? 'Hide pinyin' : 'Show pinyin'}
    </button>
  );
}

/**
 * The day's reading text, with pinyin over every character unless hidden (tap one to hear it).
 * Gaps not yet `solved` show their number (tap to choose one); filled gaps are in green.
 */
function ReadingText({ lessons, blanks, solved, current, showPinyin, toggle, onSelectGap }: {
  lessons: Lesson[];
  blanks: Map<string, Blank>;
  solved: Set<string>;
  current?: Blank;
  showPinyin: boolean;
  /** Shown in the top-right corner of the first text, when given. */
  toggle?: React.ReactNode;
  onSelectGap?: (id: string) => void;
}) {
  return lessons.map((lesson, lessonIndex) => (
    <article className={`reading-text ${showPinyin ? '' : 'pinyin-hidden'}`} key={lesson.number}>
      {lessonIndex === 0 && toggle}
      <h2 className={lessonIndex === 0 && toggle ? 'beside-toggle' : undefined}>{lessons.length > 1 && <span className="label">PART {lessonIndex + 1}</span>}{lesson.title}</h2>
      {lesson.paragraphs.map(([text, pinyin], paragraphIndex) => {
        const readings = pinyin.split(' ');
        return (
          <p className="reading-paragraph" key={paragraphIndex}>
            {Array.from(text, (character, position) => {
              const blank = blanks.get(`${lesson.number}-${paragraphIndex}-${position}`);
              const spoken = readings[position];
              if (blank && !solved.has(blank.id)) {
                return (
                  <button type="button" key={position} className={`reading-gap ${blank.id === current?.id ? 'current' : ''}`} onClick={() => onSelectGap?.(blank.id)} aria-label={`Gap ${blank.number}`} aria-pressed={blank.id === current?.id}>
                    <span className="token-pinyin" />
                    <span className="gap-box">{blank.number}</span>
                  </button>
                );
              }
              if (!spoken) return <span className="reading-token punctuation" key={position}><span className="token-pinyin" /><span className="token-character">{character}</span></span>;
              return <button type="button" key={position} className={`reading-token ${blank ? 'filled' : ''}`} onClick={() => pronounce(character)} aria-label={`${character}, ${spoken}. Tap to hear it.`}><span className="token-pinyin">{spoken}</span><span className="token-character">{character}</span></button>;
            })}
          </p>
        );
      })}
    </article>
  ));
}

/** A finished day's reading, with every gap filled in: opened from the full plan. */
export function CompletedReading({ lessons, dayNumber, onBack }: { lessons: Lesson[]; dayNumber: number; onBack: () => void }) {
  const blanks = useMemo(() => readingBlanks(lessons), [lessons]);
  const solved = useMemo(() => new Set(blanks.keys()), [blanks]);
  const [showPinyin, togglePinyin] = usePinyinShown();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [dayNumber]);
  return (
    <div className="lesson-main">
      <section className="reading-exercise" aria-labelledby="reading-title">
        <button className="reading-back reading-return" onClick={onBack}><ArrowLeft size={17} />Back to the plan</button>
        <header className="reading-heading">
          <span className="label">DAY {dayNumber} · COMPLETED</span>
          <h1 id="reading-title">Day {dayNumber} reading</h1>
          <p>The text from this day with every gap filled in; the answers are in green. Tap any character to hear it, and read it aloud again for practice.</p>
        </header>
        <ReadingText lessons={lessons} blanks={blanks} solved={solved} showPinyin={showPinyin} toggle={<PinyinToggle shown={showPinyin} onToggle={togglePinyin} />} />
      </section>
    </div>
  );
}

function ReadingExercise({ lessons, dayNumber, onBack, onFinish }: { lessons: Lesson[]; dayNumber: number; onBack: () => void; onFinish: () => void }) {
  const blanks = useMemo(() => readingBlanks(lessons), [lessons]);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [missed, setMissed] = useState<Record<string, string[]>>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [showPinyin, togglePinyin] = usePinyinShown();

  const unsolved = [...blanks.values()].filter((blank) => !solved.has(blank.id));
  // The gap being answered: the one tapped, or else the first gap still empty.
  const current = (currentId && !solved.has(currentId) ? blanks.get(currentId) : undefined) ?? unsolved[0];
  const options = current ? CHOICES[current.id] ?? [[current.character, current.pinyin]] : [];

  function choose(blank: Blank, option: string) {
    if (option !== blank.character) {
      setMissed((tries) => ({ ...tries, [blank.id]: [...(tries[blank.id] ?? []), option] }));
      return;
    }
    pronounce(option);
    const next = new Set(solved).add(blank.id);
    setSolved(next);
    setCurrentId([...blanks.values()].find((other) => !next.has(other.id) && other.number > blank.number)?.id ?? null);
    if (next.size === blanks.size) setReading(true);
  }

  return (
    <section className="reading-exercise" aria-labelledby="reading-title">
      <header className="reading-heading">
        <span className="label">DAY {dayNumber} · FINAL EXERCISE</span>
        <h1 id="reading-title">{reading ? 'Read it aloud' : 'Fill in the gaps'}</h1>
        <p>{reading
          ? 'Every gap is filled. Now read the whole text out loud from start to finish. Tap any character to hear it.'
          : 'Pick the character that belongs in each numbered gap. Tap a gap to answer it out of order.'}</p>
      </header>

      <ReadingText lessons={lessons} blanks={blanks} solved={solved} current={current} showPinyin={showPinyin} toggle={reading ? <PinyinToggle shown={showPinyin} onToggle={togglePinyin} /> : undefined} onSelectGap={setCurrentId} />

      {reading ? (
        <footer className="reading-footer read-aloud">
          <Mic size={26} aria-hidden="true" />
          <p><strong>Read the text aloud.</strong> Go slowly and say every tone clearly, then finish the day to add these characters to Review.</p>
          <button className="complete-day-button" onClick={onFinish}><Check size={19} />I read it aloud — finish Day {dayNumber}</button>
        </footer>
      ) : (
        <>
          {current && (
            <fieldset className="reading-choices">
              <PinyinToggle shown={showPinyin} onToggle={togglePinyin} />
              <legend><span className="label">GAP {current.number} OF {blanks.size}</span>Which character goes here?</legend>
              <div className="choice-grid">
                {options.map(([option, optionPinyin]) => {
                  const wrong = missed[current.id]?.includes(option);
                  return (
                    <button type="button" key={option} className={`reading-choice ${wrong ? 'wrong' : ''}`} onClick={() => choose(current, option)} disabled={wrong} lang="zh-CN">
                      <span className="choice-character">{option}</span>
                      <span className="choice-pinyin">{optionPinyin}</span>
                      {wrong && <X className="choice-mark" size={16} aria-label="Not this one" />}
                    </button>
                  );
                })}
              </div>
              <p className="choice-hint" aria-live="polite">{missed[current.id]?.length ? 'Not quite. Read the words around the gap and try another one.' : '\u00a0'}</p>
            </fieldset>
          )}
          <footer className="reading-footer">
            <button className="reading-back" onClick={onBack}><ArrowLeft size={17} />Back to characters</button>
            <p aria-live="polite">{solved.size} of {blanks.size} gaps filled</p>
          </footer>
        </>
      )}
    </section>
  );
}
