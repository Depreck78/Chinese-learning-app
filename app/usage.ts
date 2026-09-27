import { useEffect, useRef } from 'react';

// Usage counting for the owner's stats page (app/admin). Each install gets a random id, and for
// every day it records how long the app was actively used and how many characters had been
// learned, linked to the account when signed in. Nothing else is sent: no answers or other content.

const DEVICE_KEY = 'hanzi-device';
const USAGE_KEY = 'hanzi-usage';
const TICK_MS = 15_000;
// Time counts while the app is on screen and was touched in the last two minutes, or while a
// lesson video is playing (the video frame has focus).
const IDLE_AFTER_MS = 120_000;
const SEND_EVERY_MS = 10 * 60_000;
const DAYS_TO_SEND = 14;

type DayUsage = { seconds: number; learned: number };
type Usage = { days: Record<string, DayUsage>; sent: Record<string, string> };

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function loadUsage(): Usage {
  try {
    const usage = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null') as Usage | null;
    if (usage && typeof usage.days === 'object' && typeof usage.sent === 'object') return usage;
  } catch {
    // Start over.
  }
  return { days: {}, sent: {} };
}

function saveUsage(usage: Usage) {
  // Keep only the days that can still be sent.
  const oldest = dayKey(new Date(Date.now() - DAYS_TO_SEND * 86_400_000));
  for (const day of Object.keys(usage.days)) if (day < oldest) { delete usage.days[day]; delete usage.sent[day]; }
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // Storage full or blocked: usage is simply not counted.
  }
}

function platform() {
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(agent)) return 'android';
  return 'desktop';
}

const installed = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Counts active study time on this device and reports it, with the number of characters learned. */
export function useUsageTracking(learned: number, token: string | undefined) {
  const latest = useRef({ learned, token });
  useEffect(() => { latest.current = { learned, token }; }, [learned, token]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    let lastInput = Date.now();
    let sending = false;
    const onInput = () => { lastInput = Date.now(); };

    const record = (seconds: number) => {
      const usage = loadUsage();
      const today = dayKey(new Date());
      const day = usage.days[today] ?? { seconds: 0, learned: 0 };
      usage.days[today] = { seconds: Math.min(86_400, day.seconds + seconds), learned: Math.max(day.learned, latest.current.learned) };
      saveUsage(usage);
    };

    const send = async (keepalive = false) => {
      if (sending || !navigator.onLine) return;
      const usage = loadUsage();
      const changed = Object.entries(usage.days).filter(([day, value]) => usage.sent[day] !== JSON.stringify(value));
      if (!changed.length) return;
      sending = true;
      try {
        const { token } = latest.current;
        const response = await fetch('/api/usage', {
          method: 'POST',
          keepalive,
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ device: deviceId(), platform: platform(), installed: installed(), days: changed.map(([day, value]) => ({ day, ...value })) }),
        });
        if (response.ok) {
          const saved = loadUsage();
          for (const [day, value] of changed) saved.sent[day] = JSON.stringify(value);
          saveUsage(saved);
        }
      } catch {
        // Offline or blocked: the days are sent next time.
      } finally {
        sending = false;
      }
    };

    const tick = () => {
      const active = document.visibilityState === 'visible'
        && (Date.now() - lastInput < IDLE_AFTER_MS || document.activeElement?.tagName === 'IFRAME');
      if (active) record(TICK_MS / 1000);
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') void send(true); };

    try {
      deviceId();
      record(0);
    } catch {
      return;
    }
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    for (const event of events) window.addEventListener(event, onInput, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    const ticker = window.setInterval(tick, TICK_MS);
    const sender = window.setInterval(() => void send(), SEND_EVERY_MS);
    const first = window.setTimeout(() => void send(), 5_000);
    return () => {
      for (const event of events) window.removeEventListener(event, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(ticker);
      window.clearInterval(sender);
      window.clearTimeout(first);
    };
  }, []);

  // Keep today's learned count current even when no time is being counted.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    try {
      const usage = loadUsage();
      const today = dayKey(new Date());
      const day = usage.days[today] ?? { seconds: 0, learned: 0 };
      if (learned > day.learned) {
        usage.days[today] = { ...day, learned };
        saveUsage(usage);
      }
    } catch {
      // Ignore.
    }
  }, [learned]);
}
