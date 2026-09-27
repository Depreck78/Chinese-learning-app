import { Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pronounceSentence } from './pronunciation';

/** [sentence, pinyin per character separated by spaces ('' for punctuation), English, source] */
type Sentence = [string, string, string, string];
type LessonSentences = Record<string, Sentence[]>;

export const sentencesUrl = (lessonNumber: number) => `/sentences/${lessonNumber}.json`;

/** Where each sentence of a lesson is recorded: packs of MP3s, and [pack, start, duration] per sentence. */
type AudioIndex = { packs: string[]; clips: Record<string, [number, number, number]> };
export const sentenceAudioIndexUrl = (lessonNumber: number) => `/sentence-audio/${lessonNumber}.json`;

const audioIndexes = new Map<number, Promise<AudioIndex | null>>();

function loadAudioIndex(lessonNumber: number) {
  let request = audioIndexes.get(lessonNumber);
  if (!request) {
    // Without an index (offline and never loaded), sentences are read by the device voice.
    request = fetch(sentenceAudioIndexUrl(lessonNumber))
      .then((response) => (response.ok ? (response.json() as Promise<AudioIndex>) : null))
      .catch(() => null);
    void request.then((index) => { if (!index) audioIndexes.delete(lessonNumber); });
    audioIndexes.set(lessonNumber, request);
  }
  return request;
}

function sentenceClip(index: AudioIndex | null, text: string) {
  const clip = index?.clips[text];
  return clip ? { url: `/sentence-audio/${index.packs[clip[0]]}`, start: clip[1], duration: clip[2] } : null;
}

const loaded = new Map<number, Promise<LessonSentences>>();

function loadSentences(lessonNumber: number) {
  let request = loaded.get(lessonNumber);
  if (!request) {
    request = fetch(sentencesUrl(lessonNumber)).then((response) => {
      if (!response.ok) throw new Error(`Sentences request failed with ${response.status}`);
      return response.json() as Promise<LessonSentences>;
    });
    request.catch(() => loaded.delete(lessonNumber));
    loaded.set(lessonNumber, request);
  }
  return request;
}

/** Three sentences showing a character used in different situations, with pinyin and English. */
export function ExampleSentences({ character, lessonNumber }: { character: string; lessonNumber: number }) {
  const [state, setState] = useState<{ key: string; sentences: Sentence[] | null; audio: AudioIndex | null }>({ key: '', sentences: null, audio: null });
  const key = `${lessonNumber}:${character}`;

  useEffect(() => {
    let current = true;
    // The recordings index loads with the sentences: iPhones only play sound started right inside the tap.
    Promise.all([loadSentences(lessonNumber), loadAudioIndex(lessonNumber)])
      .then(([lesson, audio]) => { if (current) setState({ key, sentences: lesson[character] ?? [], audio }); })
      .catch(() => { if (current) setState({ key, sentences: [], audio: null }); });
    return () => { current = false; };
  }, [character, key, lessonNumber]);

  const sentences = state.key === key ? state.sentences : null;
  if (sentences && !sentences.length) return null;

  return (
    <section className="example-sentences" aria-labelledby="examples-title">
      <header><span className="label">IN CONTEXT</span><h2 id="examples-title">Three ways to use {character}</h2></header>
      {sentences ? (
        <ol>
          {sentences.map(([text, pinyin, english, source]) => {
            const readings = pinyin.split(' ');
            return (
              <li key={source + text}>
                <button type="button" className="example-play" onClick={() => pronounceSentence(text, sentenceClip(state.audio, text))} aria-label={`Hear “${text}”`}><Volume2 size={18} /></button>
                <p className="example-line" lang="zh-CN">
                  {Array.from(text, (part, index) => (
                    <span key={index} className={`example-token ${part === character ? 'target' : ''}`}>
                      <small>{readings[index]}</small>{part}
                    </span>
                  ))}
                </p>
                <p className="example-english">{english}</p>
              </li>
            );
          })}
        </ol>
      ) : <p className="example-loading">Loading examples…</p>}
      {sentences?.some(([, , , source]) => source.startsWith('tatoeba:')) && (
        <p className="example-credit">Sentences from <a href="https://tatoeba.org" target="_blank" rel="noreferrer">Tatoeba</a> (CC BY 2.0 FR).</p>
      )}
    </section>
  );
}
