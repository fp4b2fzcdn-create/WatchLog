import { useState } from 'react';
import { BookmarkPlus, Check, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { Title, State, Viewing, Season, Entry } from '../shared/model';
import { api, displayDate, today, uid, progress, year } from './lib';
import { Modal, Poster, Busy, ErrorMessage, Field } from './components';

export function Detail({
  title,
  state,
  onClose,
  onEdit,
  onChanged,
  onSimilar,
  onError,
}: {
  title: Title;
  state: State;
  onClose: () => void;
  onEdit: (mode: 'record' | 'metadata' | 'watch', event?: Viewing) => void;
  onChanged: () => Promise<void>;
  onSimilar: (title: Title, mode: 'similar' | 'recommendations') => void;
  onError: (message: string) => void;
}) {
  const entry = state.entries.find((e) => e.titleId === title.id),
    watch = state.watchlist.find((e) => e.titleId === title.id);
  const events = state.events
    .filter((e) => e.titleId === title.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const [tab, setTab] = useState('Overview'),
    [seasonNumber, setSeasonNumber] = useState(
      title.seasons.find((s) => s.number > 0)?.number ?? 1,
    ),
    [season, setSeason] = useState<Season | undefined>(
      state.seasons.find((s) => s.titleId === title.id && s.number === seasonNumber),
    ),
    [selected, setSelected] = useState<number[]>([]),
    [date, setDate] = useState(today()),
    [rewatch, setRewatch] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [deleteEvent, setDeleteEvent] = useState<string | null>(null);
  async function load(number = seasonNumber, refresh = false) {
    setSeasonNumber(number);
    setSelected([]);
    setBusy(true);
    setError('');
    try {
      const s = await api.season({ titleId: title.id, number, refresh });
      setSeason(s);
      await onChanged();
    } catch (e) {
      setSeason(undefined);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function mark(numbers: number[]) {
    setBusy(true);
    setError('');
    try {
      const watched = new Set(
        events.filter((e) => e.season === seasonNumber && e.episode !== null).map((e) => e.episode),
      );
      const list = numbers.filter((n) => rewatch || !watched.has(n));
      if (!list.length) {
        setError('These episodes are already watched. Enable Rewatch to log another viewing.');
        return;
      }
      await api.episodes({
        events: list.map((n) => ({
          id: uid(),
          titleId: title.id,
          date,
          approximate: false,
          rating: null,
          notes: '',
          platform: '',
          rewatch: rewatch && watched.has(n),
          season: seasonNumber,
          episode: n,
        })),
      });
      if (!entry || entry.status === 'Planning to Watch')
        await api.save({
          title,
          entry: {
            titleId: title.id,
            status: 'Watching',
            rating: entry?.rating ?? null,
            notes: entry?.notes || '',
          },
        });
      setSelected([]);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeEvent(id: string) {
    try {
      await api.remove({ kind: 'event', id });
      setDeleteEvent(null);
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  async function setStatus(status: Entry['status']) {
    try {
      await api.save({
        title,
        entry: {
          titleId: title.id,
          status,
          rating: entry?.rating ?? null,
          notes: entry?.notes || '',
        },
      });
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <Modal
      title={title.title}
      subtitle={title.originalTitle !== title.title ? title.originalTitle : undefined}
      onClose={onClose}
      wide
    >
      <div className="detail-intro">
        <Poster title={title} />
        <div>
          <span className="eyebrow">
            {title.type === 'movie' ? 'MOVIE' : 'TV SERIES'} · {year(title)}
          </span>
          <h2>{title.title}</h2>
          <p className="muted">
            {[
              title.genres.join(' / '),
              title.runtime ? `${title.runtime} min` : '',
              title.language.toUpperCase(),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="detail-ratings">
            {entry?.rating != null && (
              <div>
                <strong>
                  {entry.rating}
                  <small>/10</small>
                </strong>
                <span>My rating</span>
              </div>
            )}
            {title.tmdbRating > 0 && (
              <div>
                <strong>
                  {title.tmdbRating.toFixed(1)}
                  <small>/10</small>
                </strong>
                <span>TMDB · {title.votes.toLocaleString()} votes</span>
              </div>
            )}
          </div>
          <div className="button-row">
            <button className="primary" onClick={() => onEdit('record')}>
              <Plus size={15} />
              Log viewing
            </button>
            <button onClick={() => onEdit('watch')} aria-label="Edit watchlist">
              <BookmarkPlus size={16} />
            </button>
            <button onClick={() => onEdit('metadata')} aria-label="Edit title">
              <Pencil size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="detail-status">
        <span>Status</span>
        <select
          aria-label="Tracking status"
          value={entry?.status || 'Planning to Watch'}
          onChange={(e) => void setStatus(e.target.value as Entry['status'])}
        >
          {['Planning to Watch', 'Watching', 'Completed', 'On Hold', 'Dropped'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {title.type === 'tv' && (
          <span>
            {progress(state, title)}
            {title.totalEpisodes ? ` / ${title.totalEpisodes}` : ''} episodes recorded
          </span>
        )}
      </div>
      <div className="tabs" role="tablist">
        {['Overview', 'Viewing history', ...(title.type === 'tv' ? ['Episodes'] : [])].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => {
              setTab(t);
              if (t === 'Episodes' && !season) void load();
            }}
          >
            {t}
            {t === 'Viewing history' && <span>{events.length}</span>}
          </button>
        ))}
      </div>
      <div className="detail-content">
        {tab === 'Overview' && (
          <>
            <p className="overview">
              {title.overview ||
                'No synopsis saved. Add one through Edit title, or refresh the metadata from TMDB.'}
            </p>
            <dl className="metadata-list">
              <div>
                <dt>Release date</dt>
                <dd>{displayDate(title.releaseDate, state.preferences.dateFormat)}</dd>
              </div>
              <div>
                <dt>Countries</dt>
                <dd>{title.countries.join(', ') || 'Unknown'}</dd>
              </div>
              <div>
                <dt>{title.type === 'movie' ? 'Director' : 'Creators'}</dt>
                <dd>{title.creators.join(', ') || 'Not available'}</dd>
              </div>
              <div>
                <dt>Cast</dt>
                <dd>{title.cast.join(', ') || 'Not available'}</dd>
              </div>
              {title.aliases.length > 0 && (
                <div>
                  <dt>Also known as</dt>
                  <dd>{Array.from(new Set(title.aliases)).slice(0, 12).join(' · ')}</dd>
                </div>
              )}
            </dl>
            {entry?.notes && (
              <div className="note-block">
                <span className="eyebrow">MY NOTES</span>
                <p>{entry.notes}</p>
              </div>
            )}
            {watch && (
              <div className="note-block">
                <span className="eyebrow">
                  {watch.archived ? 'ORIGINAL WATCHLIST NOTES' : 'WATCHLIST'} ·{' '}
                  {['', 'HIGH', 'MEDIUM', 'LOW'][watch.priority]} PRIORITY
                </span>
                <p>{watch.notes || 'No watchlist notes.'}</p>
                <small>Added {displayDate(watch.added, state.preferences.dateFormat)}</small>
              </div>
            )}
            <div className="button-row">
              {title.imdbId && (
                <button
                  onClick={() =>
                    void api
                      .external({ url: `https://www.imdb.com/title/${title.imdbId}/` })
                      .catch((e) => onError(e.message))
                  }
                >
                  IMDb <ExternalLink size={13} />
                </button>
              )}
              {title.tmdbId && (
                <>
                  <button onClick={() => onSimilar(title, 'similar')}>Similar titles</button>
                  <button onClick={() => onSimilar(title, 'recommendations')}>
                    Recommendations
                  </button>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const updated = await api.details({
                          id: title.tmdbId!,
                          type: title.type,
                          language: state.preferences.language,
                        });
                        await api.save({ title: { ...updated, id: title.id } });
                        await onChanged();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <RefreshCw size={14} />
                    Refresh metadata
                  </button>
                </>
              )}
            </div>
            <div className="danger-zone">
              {confirm ? (
                <>
                  <span>Delete this title, its viewings and watchlist entry?</span>
                  <button
                    className="danger"
                    onClick={async () => {
                      try {
                        await api.remove({ kind: 'title', id: title.id });
                        await onChanged();
                        onClose();
                      } catch (e) {
                        onError((e as Error).message);
                      }
                    }}
                  >
                    Delete permanently
                  </button>
                  <button onClick={() => setConfirm(false)}>Cancel</button>
                </>
              ) : (
                <button className="text-button danger" onClick={() => setConfirm(true)}>
                  <Trash2 size={14} />
                  Delete title
                </button>
              )}
            </div>
          </>
        )}
        {tab === 'Viewing history' && (
          <>
            {!events.length ? (
              <div className="quiet-empty">
                No viewing events yet. Log a viewing to add a date and notes.
              </div>
            ) : (
              events.map((e) => (
                <div className="history-row" key={e.id}>
                  <div className="history-mark">
                    <Check size={16} />
                  </div>
                  <div className="history-main">
                    <strong>
                      {e.approximate ? 'Around ' : ''}
                      {displayDate(e.date, state.preferences.dateFormat)}
                    </strong>
                    <span>
                      {[
                        e.season !== null
                          ? `Season ${e.season}${e.episode !== null ? ` · Episode ${e.episode}` : ''}`
                          : 'Full title',
                        e.rewatch ? 'Rewatch' : '',
                        e.platform,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {e.notes && <p>{e.notes}</p>}
                  </div>
                  {e.rating !== null && <span className="badge">{e.rating} / 10</span>}
                  <button
                    className="icon-button"
                    aria-label="Edit viewing"
                    onClick={() => onEdit('record', e)}
                  >
                    <Pencil size={14} />
                  </button>
                  {deleteEvent === e.id ? (
                    <>
                      <button className="danger" onClick={() => void removeEvent(e.id)}>
                        Delete
                      </button>
                      <button onClick={() => setDeleteEvent(null)}>Cancel</button>
                    </>
                  ) : (
                    <button
                      className="icon-button"
                      aria-label="Delete viewing"
                      onClick={() => setDeleteEvent(e.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </>
        )}
        {tab === 'Episodes' && (
          <>
            <div className="episode-toolbar">
              <select
                aria-label="Season"
                value={seasonNumber}
                onChange={(e) => void load(Number(e.target.value))}
              >
                {(title.seasons.length
                  ? title.seasons
                  : [{ number: 1, name: 'Season 1', count: 0 }]
                ).map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.name} {s.count ? `(${s.count})` : ''}
                  </option>
                ))}
              </select>
              <button disabled={busy} onClick={() => void load(seasonNumber, true)}>
                <RefreshCw size={14} />
                Refresh episodes
              </button>
              <button onClick={() => onEdit('record')}>Log season manually</button>
            </div>
            <div className="episode-log-options">
              <Field label="Date watched">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </Field>
              <label>
                <input
                  type="checkbox"
                  checked={rewatch}
                  onChange={(e) => setRewatch(e.target.checked)}
                />
                Rewatch
              </label>
            </div>
            {busy && <Busy />}
            {season && !busy && (
              <>
                <div className="episode-actions">
                  <button onClick={() => setSelected(season.episodes.map((e) => e.number))}>
                    Select all
                  </button>
                  <button
                    disabled={!selected.length || !date}
                    className="primary"
                    onClick={() => void mark(selected)}
                  >
                    Mark selected ({selected.length})
                  </button>
                  <button
                    disabled={!date}
                    onClick={() => void mark(season.episodes.map((e) => e.number))}
                  >
                    Mark season watched
                  </button>
                </div>
                {season.episodes.map((e) => {
                  const views = events.filter(
                    (v) => v.season === seasonNumber && v.episode === e.number,
                  );
                  return (
                    <label className="episode-row" key={e.number}>
                      <input
                        type="checkbox"
                        checked={selected.includes(e.number)}
                        onChange={(ev) =>
                          setSelected(
                            ev.target.checked
                              ? [...selected, e.number]
                              : selected.filter((n) => n !== e.number),
                          )
                        }
                      />
                      <span className="episode-number">{String(e.number).padStart(2, '0')}</span>
                      <div>
                        <strong>{e.name}</strong>
                        <small>
                          Aired {displayDate(e.airDate, state.preferences.dateFormat)}
                          {views.length
                            ? ` · Watched ${displayDate(views[0].date, state.preferences.dateFormat)}${views.length > 1 ? ` · ${views.length} viewings` : ''}`
                            : ''}
                        </small>
                      </div>
                      {views.length > 0 && <Check size={17} className="success" />}
                    </label>
                  );
                })}
              </>
            )}
            {!title.tmdbId && (
              <p className="callout">
                For manually added series, use Log viewing to record a series, season or episode.
                Link a TMDB title for episode names and air dates.
              </p>
            )}
          </>
        )}
        <ErrorMessage error={error} />
      </div>
    </Modal>
  );
}
