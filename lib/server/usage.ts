// Usage counts (sent by app/usage.ts) and the owner's stats built from them (app/stats-panel.tsx).
// A "learner" is an account, or an install that has never signed in; an account's devices count once.
import { AccountError, database, isAdmin, userFor } from './accounts';

const ACTIVE_SECONDS = 60; // a day counts as active after a minute of use
const WINDOW_DAYS = 180; // stats look this far back
const SERIES_DAYS = 90;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DEVICE = /^[0-9a-f-]{36}$/;
const PLATFORMS = new Set(['ios', 'android', 'desktop']);

let schemaReady: Promise<unknown> | null = null;

function ready() {
  schemaReady ??= database().batch([
    database().prepare(`CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      first_day TEXT NOT NULL,
      last_day TEXT NOT NULL,
      platform TEXT NOT NULL,
      installed INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )`),
    database().prepare(`CREATE TABLE IF NOT EXISTS device_days (
      device_id TEXT NOT NULL,
      day TEXT NOT NULL,
      seconds INTEGER NOT NULL,
      learned INTEGER NOT NULL,
      PRIMARY KEY (device_id, day)
    )`),
    database().prepare('CREATE INDEX IF NOT EXISTS device_days_day ON device_days (day)'),
  ]).catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

const toDay = (time: number) => new Date(time).toISOString().slice(0, 10);
function addDays(day: string, days: number) {
  const [year, month, date] = day.split('-').map(Number);
  return toDay(Date.UTC(year, month - 1, date + days));
}
const count = (value: unknown, max: number) => (Number.isInteger(value) && (value as number) >= 0 ? Math.min(value as number, max) : null);

/** Stores one device's daily usage. Each value only ever grows, so resending a day is harmless. */
export async function recordUsage(request: Request, body: unknown) {
  const data = body as { device?: unknown; platform?: unknown; installed?: unknown; days?: unknown } | null;
  if (typeof data?.device !== 'string' || !DEVICE.test(data.device) || !Array.isArray(data.days)) throw new AccountError('Invalid usage report.');
  const now = Date.now();
  // Days are the device's local dates, so allow a day either side of the server's.
  const earliest = toDay(now - 30 * 86_400_000);
  const latest = toDay(now + 86_400_000);
  const days = data.days.slice(0, 31).flatMap((entry: unknown) => {
    const { day, seconds, learned } = (entry ?? {}) as { day?: unknown; seconds?: unknown; learned?: unknown };
    const time = count(seconds, 86_400);
    const known = count(learned, 10_000);
    return typeof day === 'string' && DAY.test(day) && day >= earliest && day <= latest && time !== null && known !== null ? [{ day, seconds: time, learned: known }] : [];
  });
  if (!days.length) return;
  const userId = request.headers.has('Authorization') ? await userFor(request).then(({ userId: id }) => id, () => null) : null;
  const platform = typeof data.platform === 'string' && PLATFORMS.has(data.platform) ? data.platform : 'desktop';
  const sorted = days.map(({ day }) => day).sort();
  await ready();
  const db = database();
  await db.batch([
    db.prepare(`INSERT INTO devices (id, first_day, last_day, platform, installed, user_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET first_day = MIN(first_day, excluded.first_day), last_day = MAX(last_day, excluded.last_day),
        platform = excluded.platform, installed = MAX(installed, excluded.installed), user_id = COALESCE(excluded.user_id, user_id), last_seen_at = excluded.last_seen_at`)
      .bind(data.device, sorted[0], sorted.at(-1), platform, data.installed === true ? 1 : 0, userId, now, now),
    ...days.map(({ day, seconds, learned }) => db.prepare(`INSERT INTO device_days (device_id, day, seconds, learned) VALUES (?, ?, ?, ?)
      ON CONFLICT (device_id, day) DO UPDATE SET seconds = MAX(seconds, excluded.seconds), learned = MAX(learned, excluded.learned)`)
      .bind(data.device, day, seconds, learned)),
  ]);
}

/** Only the owner accounts (see isAdmin) may read the stats. */
export async function requireAdmin(request: Request) {
  const { userId } = await userFor(request);
  if (!isAdmin(userId)) throw new AccountError('This page is only for the app’s owners.', 403);
}

function streaks(days: string[], today: string) {
  let longest = 0;
  let run = 0;
  days.forEach((day, index) => {
    run = index && addDays(days[index - 1], 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const last = days.at(-1);
  // A streak is still going if the learner studied today or yesterday.
  const current = last && (last === today || last === addDays(today, -1)) ? run : 0;
  return { current, longest };
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const share = (part: number, whole: number) => (whole ? part / whole : 0);

function buckets(values: number[], edges: number[], unit: string) {
  return edges.map((low, index) => {
    const high = edges[index + 1];
    const label = high === undefined ? `${low}+ ${unit}` : high - 1 === low ? `${low} ${low === 1 ? unit.replace(/s$/, '') : unit}` : `${low}–${high - 1} ${unit}`;
    return { label, count: values.filter((value) => value >= low && (high === undefined || value < high)).length };
  });
}

export async function usageStats() {
  await ready();
  const db = database();
  const today = toDay(Date.now());
  const since = addDays(today, -WINDOW_DAYS);
  const learnerKey = "CASE WHEN user_id IS NULL THEN 'd:' || id ELSE 'u:' || user_id END";
  const [learners, devices, accounts, rows] = await Promise.all([
    db.prepare(`SELECT ${learnerKey} AS learner, MIN(first_day) AS first_day, MAX(last_day) AS last_day, MAX(user_id) AS user_id, MIN(id) AS device FROM devices GROUP BY learner`)
      .all<{ learner: string; first_day: string; last_day: string; user_id: number | null; device: string }>(),
    db.prepare('SELECT platform, installed, COUNT(*) AS total FROM devices GROUP BY platform, installed').all<{ platform: string; installed: number; total: number }>(),
    db.prepare("SELECT id, username, date(created_at / 1000, 'unixepoch') AS day FROM users").all<{ id: number; username: string; day: string }>(),
    db.prepare(`SELECT ${learnerKey} AS learner, day, SUM(seconds) AS seconds, MAX(learned) AS learned
      FROM device_days JOIN devices ON devices.id = device_days.device_id WHERE day >= ? GROUP BY learner, day ORDER BY learner, day`)
      .bind(since).all<{ learner: string; day: string; seconds: number; learned: number }>(),
  ]);

  // Per learner: active days, time, and characters learned each day.
  const firstDay = new Map(learners.results.map((row) => [row.learner, row.first_day]));
  type Learner = { days: { day: string; seconds: number; gained: number; active: boolean }[]; learned: number };
  const byLearner = new Map<string, Learner>();
  for (const row of rows.results) {
    const learner = byLearner.get(row.learner) ?? { days: [], learned: 0 };
    // Characters learned before the first report count on the learner's first day only.
    const before = learner.days.length || row.day !== firstDay.get(row.learner) ? learner.learned : 0;
    learner.days.push({ day: row.day, seconds: row.seconds, gained: Math.max(0, row.learned - before), active: row.seconds >= ACTIVE_SECONDS });
    learner.learned = Math.max(learner.learned, row.learned);
    byLearner.set(row.learner, learner);
  }

  // Daily series for charts and the CSV export.
  const seriesStart = addDays(today, -(SERIES_DAYS - 1));
  const series = new Map<string, { day: string; newLearners: number; newAccounts: number; activeLearners: number; minutes: number; charactersLearned: number }>();
  for (let day = seriesStart; day <= today; day = addDays(day, 1)) series.set(day, { day, newLearners: 0, newAccounts: 0, activeLearners: 0, minutes: 0, charactersLearned: 0 });
  for (const { first_day } of learners.results) { const point = series.get(first_day); if (point) point.newLearners++; }
  for (const { day } of accounts.results) { const point = series.get(day); if (point) point.newAccounts++; }
  for (const learner of byLearner.values()) {
    for (const { day, seconds, gained, active } of learner.days) {
      const point = series.get(day);
      if (!point) continue;
      if (active) point.activeLearners++;
      point.minutes += seconds / 60;
      point.charactersLearned += gained;
    }
  }

  const activeSince = (from: string) => [...byLearner.values()].filter((learner) => learner.days.some(({ day, active }) => active && day >= from)).length;
  const recentDays = [...byLearner.values()].flatMap((learner) => learner.days.filter(({ day, active }) => active && day >= addDays(today, -29)));
  const dailyActive = [...series.values()].slice(-8, -1).map((point) => point.activeLearners); // the last 7 full days

  // Retention: of learners who started at least N days ago, how many were active on day N.
  const retention = [1, 7, 30].map((offset) => {
    const cohort = learners.results.filter(({ first_day }) => first_day >= since && addDays(first_day, offset) <= today);
    const returned = cohort.filter(({ learner, first_day }) => byLearner.get(learner)?.days.some(({ day, active }) => active && day === addDays(first_day, offset))).length;
    return { day: offset, cohort: cohort.length, returned, rate: share(returned, cohort.length) };
  });

  const usernames = new Map(accounts.results.map(({ id, username }) => [id, username]));
  const people = learners.results.map((row) => {
    const learner = byLearner.get(row.learner) ?? { days: [], learned: 0 };
    const activeDays = learner.days.filter(({ active }) => active);
    const { current, longest } = streaks(activeDays.map(({ day }) => day), today);
    const seconds = learner.days.reduce((sum, { seconds: time }) => sum + time, 0);
    return {
      name: row.user_id !== null ? usernames.get(row.user_id) ?? `Account ${row.user_id}` : `Guest ${row.device.slice(0, 6)}`,
      account: row.user_id !== null,
      learned: learner.learned,
      hours: seconds / 3600,
      activeDays: activeDays.length,
      minutesPerActiveDay: activeDays.length ? activeDays.reduce((sum, { seconds: time }) => sum + time, 0) / 60 / activeDays.length : 0,
      charactersPerActiveDay: activeDays.length ? activeDays.reduce((sum, { gained }) => sum + gained, 0) / activeDays.length : 0,
      currentStreak: current,
      longestStreak: longest,
      firstDay: row.first_day,
      lastDay: row.last_day,
    };
  });

  const totalDevices = devices.results.reduce((sum, { total }) => sum + total, 0);
  const platforms = ['ios', 'android', 'desktop'].map((name) => ({ name, devices: devices.results.filter(({ platform }) => platform === name).reduce((sum, { total }) => sum + total, 0) }));
  const withTime = people.filter(({ activeDays }) => activeDays > 0);

  return {
    generatedAt: new Date().toISOString(),
    today,
    windowDays: WINDOW_DAYS,
    totals: {
      learners: learners.results.length,
      accounts: accounts.results.length,
      devices: totalDevices,
      installedDevices: devices.results.filter(({ installed }) => installed).reduce((sum, { total }) => sum + total, 0),
      newLearners7: learners.results.filter(({ first_day }) => first_day >= addDays(today, -6)).length,
      newLearners30: learners.results.filter(({ first_day }) => first_day >= addDays(today, -29)).length,
      newAccounts30: accounts.results.filter(({ day }) => day >= addDays(today, -29)).length,
      activeToday: activeSince(today),
      weeklyActive: activeSince(addDays(today, -6)),
      monthlyActive: activeSince(addDays(today, -29)),
      averageDailyActive: average(dailyActive),
      averageMinutesPerActiveDay: average(recentDays.map(({ seconds }) => seconds / 60)),
      medianMinutesPerActiveDay: median(recentDays.map(({ seconds }) => seconds / 60)),
      averageCharactersPerActiveDay: average(recentDays.map(({ gained }) => gained)),
      totalStudyHours: people.reduce((sum, { hours }) => sum + hours, 0),
      totalCharactersLearned: people.reduce((sum, { learned }) => sum + learned, 0),
      longestStreak: Math.max(0, ...people.map(({ longestStreak }) => longestStreak)),
      averageLongestStreak: average(withTime.map(({ longestStreak }) => longestStreak)),
      learnersOnStreak: people.filter(({ currentStreak }) => currentStreak >= 2).length,
    },
    platforms,
    retention,
    series: [...series.values()].map((point) => ({ ...point, minutes: Math.round(point.minutes) })),
    streakDistribution: buckets(withTime.map(({ longestStreak }) => longestStreak), [1, 2, 4, 7, 14, 30], 'days'),
    learnedDistribution: buckets(people.map(({ learned }) => learned), [0, 1, 30, 100, 300, 1000], 'characters'),
    topLearners: people.sort((first, second) => second.learned - first.learned || second.hours - first.hours).slice(0, 50),
  };
}

export type UsageStats = Awaited<ReturnType<typeof usageStats>>;
