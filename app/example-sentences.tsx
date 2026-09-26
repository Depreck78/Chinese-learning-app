import { useEffect, useState } from 'react';

/** [sentence, pinyin per character separated by spaces ('' for punctuation), English, source] */
type Sentence = [string, string, string, string];
type LessonSentences = Record<string, Sentence[]>;

export const sentencesUrl = (lessonNumber: number) => `/sentences/${lessonNumber}.json`;

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
  const [state, setState] = useState<{ key: string; sentences: Sentence[] | null }>({ key: '', sentences: null });
  const key = `${lessonNumber}:${character}`;

  useEffect(() => {
    let current = true;
    loadSentences(lessonNumber)
      .then((lesson) => { if (current) setState({ key, sentences: lesson[character] ?? [] }); })
      .catch(() => { if (current) setState({ key, sentences: [] }); });
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
