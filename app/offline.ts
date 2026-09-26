import { useEffect, useState, useSyncExternalStore } from 'react';
import { CHARACTERS } from './characters';
import { sentencesUrl } from './example-sentences';
import { allRecordingUrls } from './pronunciation';
import { LESSONS } from './study-plan';

// Must match the cache names in public/sw.js.
const STROKE_CACHE = 'hanzi-strokes-v2';
const AUDIO_CACHE = 'hanzi-audio-v2';
const SENTENCE_CACHE = 'hanzi-sentences-v1';
const DOWNLOAD_CONCURRENCY = 6;

export function strokeDataUrl(character: string) {
  // Generated from the hanzi-writer-data package by scripts/copy-strokes.mjs.
  return `/strokes/${character.codePointAt(0)!.toString(16)}.json`;
}

export type OfflineState =
  | { status: 'preparing' }
  | { status: 'downloading'; done: number; total: number }
  | { status: 'ready' }
  | { status: 'incomplete'; missing: number };

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function fontFileUrls() {
  const urls: string[] = [];
  const collect = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        for (const match of rule.style.getPropertyValue('src').matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.push(new URL(match[1], location.href).href);
      } else if ('cssRules' in rule) {
        collect((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { collect(sheet.cssRules); } catch { /* Cross-origin stylesheets can't be read. */ }
  }
  return urls;
}

/** Registers the service worker and saves every character's stroke data and recording for offline use. */
export function useOfflineSupport(online: boolean) {
  const [state, setState] = useState<OfflineState>({ status: 'preparing' });

  useEffect(() => {
    // Skipped in dev so cached files never shadow hot reloads; the status badge stays hidden.
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator) || !('caches' in window)) return;
    let cancelled = false;

    // Ask the browser not to evict saved progress and downloads when storage runs low.
    navigator.storage?.persist?.().catch(() => undefined);

    navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((registration) => {
      // Everything loaded so far, plus every font file, so characters look the same offline.
      const urls = [...performance.getEntriesByType('resource').map((entry) => entry.name), ...fontFileUrls()]
        .filter((url) => new URL(url).origin === location.origin);
      registration.active?.postMessage({ type: 'cache-urls', urls: [...new Set(urls)] });
    }).catch(() => undefined);

    (async () => {
      const files = [
        ...CHARACTERS.map((entry) => ({ cacheName: STROKE_CACHE, url: strokeDataUrl(entry.character) })),
        ...allRecordingUrls().map((url) => ({ cacheName: AUDIO_CACHE, url })),
        ...LESSONS.map((lesson) => ({ cacheName: SENTENCE_CACHE, url: sentencesUrl(lesson.number) })),
      ];
      const cachesByName = new Map(await Promise.all([STROKE_CACHE, AUDIO_CACHE, SENTENCE_CACHE].map(async (name) => [name, await caches.open(name)] as const)));
      const saved = new Set((await Promise.all([...cachesByName.values()].map((cache) => cache.keys()))).flat().map((request) => request.url));
      const missing = files.filter(({ url }) => !saved.has(new URL(url, location.origin).href));
      const total = files.length;
      if (!missing.length) return setState({ status: 'ready' });
      if (!navigator.onLine) return setState({ status: 'incomplete', missing: missing.length });

      let done = total - missing.length;
      let failed = 0;
      setState({ status: 'downloading', done, total });
      const queue = [...missing];
      await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, async () => {
        for (let file = queue.shift(); file && !cancelled; file = queue.shift()) {
          try {
            const response = await fetch(file.url);
            if (!response.ok) throw new Error(`Offline file request failed with ${response.status}`);
            await cachesByName.get(file.cacheName)!.put(file.url, response);
          } catch {
            failed += 1;
          }
          done += 1;
          if (!cancelled) setState({ status: 'downloading', done, total });
        }
      }));
      if (!cancelled) setState(failed ? { status: 'incomplete', missing: failed } : { status: 'ready' });
    })().catch(() => {
      if (!cancelled) setState({ status: 'incomplete', missing: CHARACTERS.length });
    });

    return () => { cancelled = true; };
  // Retry the download whenever the device comes back online.
  }, [online]);

  return state;
}
