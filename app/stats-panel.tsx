import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { UsageStats } from '@/lib/server/usage';

type Metric = 'activeLearners' | 'newLearners' | 'minutes' | 'charactersLearned' | 'newAccounts';
const METRICS: { id: Metric; label: string }[] = [
  { id: 'activeLearners', label: 'Daily active learners' },
  { id: 'newLearners', label: 'New learners' },
  { id: 'newAccounts', label: 'New accounts' },
  { id: 'minutes', label: 'Minutes studied' },
  { id: 'charactersLearned', label: 'Characters learned' },
];

const whole = (value: number) => Math.round(value).toLocaleString();
const one = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const percent = (value: number) => `${Math.round(value * 100)}%`;

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; stats: UsageStats };

async function fetchStats(token: string): Promise<State> {
  try {
    const response = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const body = (await response.json()) as UsageStats & { error?: string };
    return response.ok ? { status: 'ready', stats: body } : { status: 'error', message: body.error ?? 'Could not load the stats.' };
  } catch {
    return { status: 'error', message: 'Could not reach the server. Check your connection.' };
  }
}

function downloadCsv(stats: UsageStats) {
  const header = 'date,new learners,new accounts,daily active learners,minutes studied,characters learned';
  const lines = stats.series.map((point) => [point.day, point.newLearners, point.newAccounts, point.activeLearners, point.minutes, point.charactersLearned].join(','));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([[header, ...lines].join('\n')], { type: 'text/csv' }));
  link.download = `hanzi-desk-daily-${stats.today}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function DailyChart({ stats, metric }: { stats: UsageStats; metric: Metric }) {
  const values = stats.series.map((point) => point[metric]);
  const max = Math.max(1, ...values);
  const width = 900;
  const height = 220;
  const bar = width / values.length;
  return (
    <figure className="admin-figure">
      <figcaption className="sr-only">{`${METRICS.find(({ id }) => id === metric)?.label} per day for the last ${values.length} days. The daily CSV has the exact numbers.`}</figcaption>
      <svg className="admin-chart" viewBox={`0 0 ${width} ${height + 24}`} aria-hidden="true">
        <line x1="0" x2={width} y1={height} y2={height} className="admin-axis" />
        {values.map((value, index) => {
          const barHeight = (value / max) * (height - 16);
          return (
            <rect key={stats.series[index].day} x={index * bar + 1} y={height - barHeight} width={Math.max(1, bar - 2)} height={barHeight} className="admin-bar">
              <title>{`${stats.series[index].day}: ${value.toLocaleString()}`}</title>
            </rect>
          );
        })}
        <text x="0" y="12" className="admin-chart-label">{max.toLocaleString()}</text>
        <text x="0" y={height + 18} className="admin-chart-label">{stats.series[0]?.day}</text>
        <text x={width} y={height + 18} textAnchor="end" className="admin-chart-label">{stats.today}</text>
      </svg>
    </figure>
  );
}

function Distribution({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map(({ count }) => count));
  return (
    <section className="admin-panel">
      <h2 className="label">{title}</h2>
      <dl className="admin-distribution">
        {rows.map(({ label, count }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><span style={{ width: `${(count / max) * 100}%` }} /><b>{count.toLocaleString()}</b></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Usage and learning stats for the app's owner. Shown only to admin accounts; the server checks too. */
export function StatsPanel({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [metric, setMetric] = useState<Metric>('activeLearners');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await fetchStats(token));
  }, [token]);

  useEffect(() => {
    let current = true;
    void fetchStats(token).then((next) => { if (current) setState(next); });
    return () => { current = false; };
  }, [token]);

  return (
    <section className="page-main admin-page">
      <header className="page-heading admin-heading">
        <div>
          <span className="label">OWNER ONLY</span>
          <h1>Stats</h1>
          <p>A learner is an account, or an install that never signed in; one account on several devices counts once. A day is active after a minute of study.</p>
        </div>
        {state.status === 'ready' && (
          <div className="admin-actions">
            <button type="button" onClick={() => void load()}><RefreshCw size={16} />Refresh</button>
            <button type="button" onClick={() => downloadCsv(state.stats)}><Download size={16} />Daily CSV</button>
          </div>
        )}
      </header>

      {state.status === 'loading' && <p className="admin-message">Loading stats…</p>}
      {state.status === 'error' && <p className="admin-message admin-error" role="alert">{state.message}</p>}
      {state.status === 'ready' && <Dashboard stats={state.stats} metric={metric} onMetric={setMetric} />}
    </section>
  );
}

function Dashboard({ stats, metric, onMetric }: { stats: UsageStats; metric: Metric; onMetric: (metric: Metric) => void }) {
  const { totals } = stats;
  const cards = [
    { label: 'Learners', value: whole(totals.learners), note: `${whole(totals.accounts)} with accounts · ${whole(totals.devices)} installs` },
    { label: 'New learners', value: whole(totals.newLearners30), note: `last 30 days · ${whole(totals.newLearners7)} in the last 7` },
    { label: 'Monthly active', value: whole(totals.monthlyActive), note: `${whole(totals.weeklyActive)} weekly · ${whole(totals.activeToday)} today` },
    { label: 'Stickiness', value: percent(totals.monthlyActive ? totals.averageDailyActive / totals.monthlyActive : 0), note: `average daily ÷ monthly active (${one(totals.averageDailyActive)} a day)` },
    { label: 'Minutes a day', value: one(totals.averageMinutesPerActiveDay), note: `average per active day · median ${one(totals.medianMinutesPerActiveDay)}` },
    { label: 'Characters a day', value: one(totals.averageCharactersPerActiveDay), note: 'learned per active day, last 30 days' },
    { label: 'Longest streak', value: `${whole(totals.longestStreak)} d`, note: `average best ${one(totals.averageLongestStreak)} d · ${whole(totals.learnersOnStreak)} on a streak now` },
    { label: 'Total study', value: `${whole(totals.totalStudyHours)} h`, note: `${whole(totals.totalCharactersLearned)} characters learned in all` },
  ];

  return (
    <>
      <section className="admin-cards" aria-label="Key numbers">
        {cards.map(({ label, value, note }) => (
          <div key={label} className="admin-card"><span className="label">{label}</span><strong>{value}</strong><small>{note}</small></div>
        ))}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2 className="label">Last {stats.series.length} days</h2>
          <fieldset className="admin-metrics">
            <legend className="sr-only">Chart</legend>
            {METRICS.map(({ id, label }) => <button key={id} type="button" aria-pressed={metric === id} onClick={() => onMetric(id)}>{label}</button>)}
          </fieldset>
        </div>
        <DailyChart stats={stats} metric={metric} />
      </section>

      <div className="admin-columns">
        <section className="admin-panel">
          <h2 className="label">Retention</h2>
          <table className="admin-table">
            <thead><tr><th>Came back on</th><th>Learners</th><th>Rate</th></tr></thead>
            <tbody>
              {stats.retention.map(({ day, cohort, returned, rate }) => (
                <tr key={day}><td>Day {day}</td><td>{whole(returned)} of {whole(cohort)}</td><td>{cohort ? percent(rate) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
          <h2 className="label admin-subheading">Devices</h2>
          <table className="admin-table">
            <tbody>
              {stats.platforms.map(({ name, devices }) => <tr key={name}><td>{name === 'ios' ? 'iPhone & iPad' : name === 'android' ? 'Android' : 'Computer'}</td><td>{whole(devices)}</td><td>{percent(totals.devices ? devices / totals.devices : 0)}</td></tr>)}
              <tr><td>Installed as an app</td><td>{whole(totals.installedDevices)}</td><td>{percent(totals.devices ? totals.installedDevices / totals.devices : 0)}</td></tr>
            </tbody>
          </table>
        </section>
        <Distribution title="Longest streak" rows={stats.streakDistribution} />
        <Distribution title="Characters learned" rows={stats.learnedDistribution} />
      </div>

      <section className="admin-panel">
        <h2 className="label">Top learners</h2>
        <div className="admin-table-scroll">
          <table className="admin-table admin-learners">
            <thead>
              <tr><th>Learner</th><th>Learned</th><th>Study time</th><th>Active days</th><th>Min / day</th><th>Chars / day</th><th>Streak</th><th>Best</th><th>First seen</th><th>Last seen</th></tr>
            </thead>
            <tbody>
              {stats.topLearners.map((learner) => (
                <tr key={`${learner.name}-${learner.firstDay}`}>
                  <td>{learner.name}{learner.account ? '' : <small> (no account)</small>}</td>
                  <td>{whole(learner.learned)}</td>
                  <td>{one(learner.hours)} h</td>
                  <td>{whole(learner.activeDays)}</td>
                  <td>{one(learner.minutesPerActiveDay)}</td>
                  <td>{one(learner.charactersPerActiveDay)}</td>
                  <td>{whole(learner.currentStreak)}</td>
                  <td>{whole(learner.longestStreak)}</td>
                  <td>{learner.firstDay}</td>
                  <td>{learner.lastDay}</td>
                </tr>
              ))}
              {!stats.topLearners.length && <tr><td colSpan={10}>No learners yet. Numbers appear once people use the updated app.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <p className="admin-footnote">Updated {new Date(stats.generatedAt).toLocaleString()}. Days are counted by each learner’s local date; activity, streaks and learning speed cover the last {stats.windowDays} days.</p>
    </>
  );
}
