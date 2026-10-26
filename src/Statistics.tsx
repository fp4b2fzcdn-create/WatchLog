import { useMemo, useState } from 'react';
import { BarChart3, Film, Repeat2, Tv, Clapperboard } from 'lucide-react';
import type { State } from '../shared/model';
import { metrics, progress } from './lib';
import { Empty } from './components';

export function Statistics({ state }: { state: State }) {
  const m = metrics(state),
    [period, setPeriod] = useState<'month' | 'year'>('month');
  const buckets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of state.events)
      if (e.date && (period === 'year' || e.date.length >= 7)) {
        const key = e.date.slice(0, period === 'year' ? 4 : 7);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-18);
  }, [state.events, period]);
  const count = (values: string[]) =>
    Object.entries(
      values.filter(Boolean).reduce<Record<string, number>>((a, v) => {
        a[v] = (a[v] || 0) + 1;
        return a;
      }, {}),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  const breakdown = (label: string, values: [string, number][]) => (
    <section className="stat-panel">
      <h3>{label}</h3>
      {values.length ? (
        values.map(([key, value]) => (
          <div className="breakdown" key={key}>
            <div>
              <span>{key}</span>
              <strong>{value}</strong>
            </div>
            <div className="bar-track">
              <i style={{ width: `${(value / Math.max(...values.map((v) => v[1]))) * 100}%` }} />
            </div>
          </div>
        ))
      ) : (
        <p className="muted">No recorded data yet.</p>
      )}
    </section>
  );
  return (
    <>
      <div className="metric-grid">
        {[
          [Film, m.movies, 'Movies watched'],
          [Tv, m.series, 'Series watched'],
          [Clapperboard, m.episodes, 'Episode viewings'],
          [Repeat2, m.rewatches, 'Rewatch events'],
        ].map(([Icon, value, label]) => {
          const I = Icon as typeof Film;
          return (
            <div className="metric-card" key={String(label)}>
              <I size={18} />
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </div>
          );
        })}
      </div>
      {!m.watched.length ? (
        <Empty
          icon={<BarChart3 size={34} />}
          heading="Your story, in numbers"
          description="Log a few viewings to uncover your favourite genres, your viewing rhythm, and the places your stories come from."
        />
      ) : (
        <>
          <section className="stat-panel activity">
            <div className="section-heading">
              <div>
                <h3>Viewing activity</h3>
                <p>
                  {m.events} viewing events across {m.watched.length} unique titles
                </p>
              </div>
              <div className="segmented">
                <button
                  className={period === 'month' ? 'active' : ''}
                  onClick={() => setPeriod('month')}
                >
                  Monthly
                </button>
                <button
                  className={period === 'year' ? 'active' : ''}
                  onClick={() => setPeriod('year')}
                >
                  Yearly
                </button>
              </div>
            </div>
            <div className="activity-chart">
              {buckets.length ? (
                buckets.map(([key, value]) => (
                  <div className="chart-column" key={key}>
                    <div
                      className="chart-bar"
                      style={{
                        height: `${Math.max(3, (value / Math.max(...buckets.map((b) => b[1]))) * 150)}px`,
                      }}
                      tabIndex={0}
                      aria-label={`${key}: ${value} viewing events`}
                    >
                      <span>{value} events</span>
                    </div>
                    <small>{key}</small>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Add viewing dates to see activity. Year-only dates appear in Yearly.
                </p>
              )}
            </div>
            <small className="muted">
              Each viewing counts once, including episodes and rewatches. Unknown dates are
              excluded.
            </small>
          </section>
          <div className="stat-grid">
            {breakdown('Most watched genres', count(m.watched.flatMap((t) => t.genres)))}
            {breakdown('Countries of origin', count(m.watched.flatMap((t) => t.countries)))}
            {breakdown('Original languages', count(m.watched.map((t) => t.language)))}
            {breakdown(
              'Titles by release year',
              count(m.watched.map((t) => t.releaseDate.slice(0, 4))),
            )}
            {breakdown(
              'My rating distribution',
              count(
                state.entries
                  .filter((e) => e.rating !== null)
                  .map((e) => String(Math.floor(e.rating!)) + ' / 10'),
              ),
            )}
            <section className="stat-panel">
              <h3>In progress</h3>
              {state.entries.filter((e) => e.status === 'Watching').length ? (
                state.entries
                  .filter((e) => e.status === 'Watching')
                  .map((e) => {
                    const title = state.titles.find((t) => t.id === e.titleId)!;
                    const n = progress(state, title);
                    return (
                      <div className="breakdown" key={e.titleId}>
                        <div>
                          <span>{title.title}</span>
                          <strong>
                            {title.type === 'tv'
                              ? `${n}${title.totalEpisodes ? ' / ' + title.totalEpisodes : ''}`
                              : 'Watching'}
                          </strong>
                        </div>
                        {title.totalEpisodes > 0 && (
                          <div className="bar-track">
                            <i
                              style={{
                                width: `${Math.min(100, (n / title.totalEpisodes) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })
              ) : (
                <p className="muted">Nothing in progress.</p>
              )}
            </section>
          </div>
          <p className="fine-print">
            Title breakdowns count each title once. Multi-genre and multi-country titles appear in
            each relevant group. Episode counts are recorded episode viewings; series completion
            does not invent episode records.
          </p>
        </>
      )}
    </>
  );
}
