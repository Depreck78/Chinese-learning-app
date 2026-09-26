import { ArrowLeft, ArrowRight, Check, Mic, Star, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { lessonCharacters, pinyinMatches, TRACES_TO_COMPLETE, type ActiveLesson, type Lesson } from './study-plan';
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
type Answer = { character: string; pinyin: string };

function ReadingExercise({ lessons, dayNumber, onBack, onFinish }: { lessons: Lesson[]; dayNumber: number; onBack: () => void; onFinish: () => void }) {
  const blanks = useMemo(() => {
    const found = new Map<string, Blank>();
    lessons.forEach((lesson, lessonIndex) => lesson.paragraphs.forEach(([text, pinyin, positions], paragraphIndex) => {
      const characters = Array.from(text);
      const readings = pinyin.split(' ');
      for (const position of positions) {
        const id = `${lessonIndex}-${paragraphIndex}-${position}`;
        found.set(id, { id, character: characters[position], pinyin: readings[position], number: found.size + 1 });
      }
    }));
    return found;
  }, [lessons]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [checked, setChecked] = useState(false);
  const [reading, setReading] = useState(false);

  const characterRight = (blank: Blank) => (answers[blank.id]?.character ?? '').trim() === blank.character;
  const pinyinRight = (blank: Blank) => pinyinMatches(blank.character, answers[blank.id]?.pinyin ?? '', blank.pinyin);
  const rightCount = [...blanks.values()].filter((blank) => characterRight(blank) && pinyinRight(blank)).length;
  const allRight = rightCount === blanks.size;

  function update(id: string, field: keyof Answer, value: string) {
    setAnswers((current) => ({ ...current, [id]: { ...(current[id] ?? { character: '', pinyin: '' }), [field]: value } }));
  }

  function check() {
    setChecked(true);
    if (allRight) setReading(true);
  }

  function revealAnswers() {
    setAnswers(Object.fromEntries([...blanks.values()].map((blank) => [blank.id, { character: blank.character, pinyin: blank.pinyin }])));
    setChecked(true);
    setReading(true);
  }

  return (
    <section className="reading-exercise" aria-labelledby="reading-title">
      <header className="reading-heading">
        <span className="label">DAY {dayNumber} · FINAL EXERCISE</span>
        <h1 id="reading-title">{reading ? 'Read it aloud' : 'Fill in the gaps'}</h1>
        <p>{reading
          ? 'Every gap is filled. Now read the whole text out loud from start to finish. Tap any character to hear it.'
          : 'Type the missing character and its pinyin in each gap. Pinyin can use tone marks (nǐ) or tone numbers (ni3).'}</p>
      </header>

      {lessons.map((lesson, lessonIndex) => (
        <article className="reading-text" key={lesson.number}>
          <h2>{lessons.length > 1 && <span className="label">PART {lessonIndex + 1}</span>}{lesson.title}</h2>
          {lesson.paragraphs.map(([text, pinyin], paragraphIndex) => {
            const readings = pinyin.split(' ');
            return (
              <p className="reading-paragraph" key={paragraphIndex}>
                {Array.from(text, (character, position) => {
                  const blank = blanks.get(`${lessonIndex}-${paragraphIndex}-${position}`);
                  const reading = readings[position];
                  if (blank && !(checked && characterRight(blank) && pinyinRight(blank))) {
                    return (
                      <span className="reading-blank" key={position}>
                        <input className={checked ? (pinyinRight(blank) ? 'right' : 'wrong') : ''} value={answers[blank.id]?.pinyin ?? ''} onChange={(event) => update(blank.id, 'pinyin', event.target.value)} aria-label={`Gap ${blank.number}: pinyin`} placeholder="pīnyīn" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false} />
                        <input className={checked ? (characterRight(blank) ? 'right' : 'wrong') : ''} value={answers[blank.id]?.character ?? ''} onChange={(event) => update(blank.id, 'character', event.target.value)} aria-label={`Gap ${blank.number}: character`} placeholder="字" lang="zh-CN" autoComplete="off" />
                      </span>
                    );
                  }
                  if (!reading) return <span className="reading-token punctuation" key={position}><span className="token-pinyin" /><span className="token-character">{character}</span></span>;
                  return <button type="button" key={position} className={`reading-token ${blank ? 'filled' : ''}`} onClick={() => pronounce(character)} aria-label={`${character}, ${reading}. Tap to hear it.`}><span className="token-pinyin">{reading}</span><span className="token-character">{character}</span></button>;
                })}
              </p>
            );
          })}
        </article>
      ))}

      {reading ? (
        <footer className="reading-footer read-aloud">
          <Mic size={26} aria-hidden="true" />
          <p><strong>Read the text aloud.</strong> Go slowly and say every tone clearly, then finish the day to add these characters to Review.</p>
          <button className="complete-day-button" onClick={onFinish}><Check size={19} />I read it aloud — finish Day {dayNumber}</button>
        </footer>
      ) : (
        <footer className="reading-footer">
          <button className="reading-back" onClick={onBack}><ArrowLeft size={17} />Back to characters</button>
          <p aria-live="polite">{checked ? `${rightCount} of ${blanks.size} gaps correct` : `${blanks.size} gaps to fill`}</p>
          {checked && !allRight && <button className="reading-reveal" onClick={revealAnswers}>Show answers</button>}
          <button className="complete-day-button" onClick={check}><Check size={19} />Check answers</button>
        </footer>
      )}
    </section>
  );
}
