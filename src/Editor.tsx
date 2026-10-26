import { useState } from 'react';
import { BookmarkPlus, Check, Film, Search } from 'lucide-react';
import {
  statuses,
  titleSchema,
  type Title,
  type State,
  type Entry,
  type Viewing,
  type Discover,
  type Watch,
} from '../shared/model';
import { api, today, uid, year } from './lib';
import { Modal, Field, Poster, Busy, ErrorMessage } from './components';

export const initialDiscover = (language: Discover['language']): Discover => ({
  query: '',
  type: 'movie',
  mode: 'trending',
  language,
  page: 1,
  genre: '',
  country: '',
  originalLanguage: '',
  yearFrom: '',
  yearTo: '',
  minimumRating: 0,
  sort: 'popularity.desc',
});
export function AddDialog({
  state,
  onClose,
  onSelect,
}: {
  state: State;
  onClose: () => void;
  onSelect: (title: Title) => void;
}) {
  const [query, setQuery] = useState(''),
    [type, setType] = useState<'movie' | 'tv'>('movie'),
    [titles, setTitles] = useState<Title[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.discover({
        ...initialDiscover(state.preferences.language),
        query,
        type,
      });
      setTitles(result.titles);
      if (!result.titles.length)
        setError('No matches found. Try an original or alternative title.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function select(title: Title) {
    setBusy(true);
    try {
      onSelect(
        await api.details({
          id: title.tmdbId!,
          type: title.type,
          language: state.preferences.language,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add movie or TV"
      subtitle="Find the right title. Make it part of your story."
      onClose={onClose}
      wide
    >
      <form onSubmit={search} className="search-form">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search TMDB"
            autoFocus
            placeholder="Search a title, in any language…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
          />
        </div>
        <select
          aria-label="Search media type"
          value={type}
          onChange={(e) => setType(e.target.value as 'movie' | 'tv')}
        >
          <option value="movie">Movies</option>
          <option value="tv">TV series</option>
        </select>
        <button className="primary" disabled={busy}>
          Search
        </button>
      </form>
      {!state.configured && (
        <p className="callout">
          Connect TMDB in Settings for online search. You can add a title manually now.
        </p>
      )}
      <ErrorMessage error={error} />
      {busy && <Busy label="Finding your title…" />}
      <div className="match-list">
        {titles.map((title) => (
          <button
            disabled={busy}
            className="match"
            key={title.id}
            onClick={() => void select(title)}
          >
            <Poster title={title} small />
            <div>
              <strong>{title.title}</strong>
              <span>
                {title.originalTitle !== title.title ? title.originalTitle + ' · ' : ''}
                {year(title)}
              </span>
              <p>{title.overview}</p>
            </div>
            <span className="badge">{title.type === 'movie' ? 'Movie' : 'Series'}</span>
          </button>
        ))}
      </div>
      {!titles.length && !busy && (
        <div className="search-hint">
          <Film size={36} />
          <p>
            Search English, Chinese, Japanese or Korean titles.
            <br />
            Check the year and original title to find your match.
          </p>
        </div>
      )}
      <div className="modal-footer">
        <span className="muted">Can’t find it?</span>
        <button
          onClick={() =>
            onSelect(titleSchema.parse({ id: uid(), type, title: query.trim() || 'Untitled' }))
          }
        >
          Add manually
        </button>
      </div>
    </Modal>
  );
}

export function Editor({
  title: initial,
  state,
  event: existingEvent,
  mode = 'record',
  onClose,
  onSaved,
}: {
  title: Title;
  state: State;
  event?: Viewing;
  mode?: 'record' | 'metadata' | 'watch';
  onClose: () => void;
  onSaved: (id: string) => Promise<void>;
}) {
  const existing = state.entries.find((e) => e.titleId === initial.id);
  const watch = state.watchlist.find((w) => w.titleId === initial.id);
  const [title, setTitle] = useState(initial),
    [status, setStatus] = useState<Entry['status']>(existing?.status || 'Completed'),
    [rating, setRating] = useState(existingEvent?.rating ?? existing?.rating ?? null),
    [notes, setNotes] = useState(existingEvent?.notes ?? ''),
    [personalNotes, setPersonalNotes] = useState(existing?.notes || ''),
    [date, setDate] = useState(existingEvent?.date ?? today()),
    [approximate, setApproximate] = useState(existingEvent?.approximate ?? false),
    [platform, setPlatform] = useState(existingEvent?.platform || ''),
    [rewatch, setRewatch] = useState(
      existingEvent?.rewatch ??
        state.events.some((e) => e.titleId === initial.id && e.episode === null),
    ),
    [precision, setPrecision] = useState<'day' | 'month' | 'year' | 'unknown'>(
      existingEvent
        ? existingEvent.date.length === 10
          ? 'day'
          : existingEvent.date.length === 7
            ? 'month'
            : existingEvent.date.length === 4
              ? 'year'
              : 'unknown'
        : 'day',
    ),
    [priority, setPriority] = useState(watch?.priority || 2),
    [watchNotes, setWatchNotes] = useState(watch?.notes || ''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [season, setSeason] = useState(
      existingEvent?.season === null || existingEvent?.season === undefined
        ? ''
        : String(existingEvent.season),
    ),
    [episode, setEpisode] = useState(
      existingEvent?.episode === null || existingEvent?.episode === undefined
        ? ''
        : String(existingEvent.episode),
    );
  const set = (key: keyof Title, value: unknown) => setTitle({ ...title, [key]: value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const eventDate =
        precision === 'unknown'
          ? ''
          : precision === 'year'
            ? date.slice(0, 4)
            : precision === 'month'
              ? date.slice(0, 7)
              : date;
      const id = await api.save({
        title,
        entry:
          mode === 'watch'
            ? undefined
            : {
                titleId: title.id,
                status,
                rating: existingEvent ? (existing?.rating ?? null) : rating,
                notes: personalNotes,
              },
        event:
          mode === 'record'
            ? {
                id: existingEvent?.id || uid(),
                titleId: title.id,
                date: eventDate,
                approximate,
                rating,
                notes,
                platform,
                rewatch,
                season: season === '' ? null : Number(season),
                episode: episode === '' ? null : Number(episode),
              }
            : undefined,
        watch:
          mode === 'watch'
            ? {
                titleId: title.id,
                priority,
                notes: watchNotes,
                added: watch?.added || today(),
                archived: false,
              }
            : undefined,
      });
      await onSaved(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        mode === 'watch'
          ? 'Save to watchlist'
          : mode === 'metadata'
            ? 'Edit title & tracking'
            : existingEvent
              ? 'Edit viewing'
              : 'Log a viewing'
      }
      subtitle={initial.title}
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="editor-body">
          <div className="editor-summary">
            <Poster title={title} />
            <div>
              <span className="eyebrow">
                {title.type === 'movie' ? 'MOVIE' : 'TV SERIES'} · {year(title)}
              </span>
              <h3>{title.title}</h3>
              <p>{title.originalTitle}</p>
              {title.tmdbRating > 0 && (
                <span className="badge">TMDB {title.tmdbRating.toFixed(1)} / 10</span>
              )}
            </div>
          </div>
          {mode === 'watch' ? (
            <>
              <div className="form-grid">
                <Field label="Priority">
                  <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
                    <option value="1">High · Watch next</option>
                    <option value="2">Medium · On my radar</option>
                    <option value="3">Low · Someday</option>
                  </select>
                </Field>
              </div>
              <Field label="Watchlist notes">
                <textarea
                  rows={4}
                  value={watchNotes}
                  onChange={(e) => setWatchNotes(e.target.value)}
                  placeholder="Why this caught your eye…"
                />
              </Field>
            </>
          ) : (
            <>
              <div className="form-grid">
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Entry['status'])}
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="My rating (0–10)">
                  <input
                    aria-label="My rating"
                    type="number"
                    min="0"
                    max="10"
                    step="0.5"
                    placeholder="Unrated"
                    value={rating ?? ''}
                    onChange={(e) =>
                      setRating(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </Field>
              </div>
              {mode === 'record' && (
                <>
                  <div className="form-grid">
                    <Field label="Viewing date precision">
                      <select
                        value={precision}
                        onChange={(e) => setPrecision(e.target.value as typeof precision)}
                      >
                        <option value="day">Exact day</option>
                        <option value="month">Month only</option>
                        <option value="year">Year only</option>
                        <option value="unknown">Date unknown</option>
                      </select>
                    </Field>
                    <Field label="Date watched" hint="Separate from the title’s release date.">
                      <input
                        aria-label="Date watched"
                        disabled={precision === 'unknown'}
                        type={
                          precision === 'day' ? 'date' : precision === 'month' ? 'month' : 'number'
                        }
                        min={precision === 'year' ? '1800' : undefined}
                        max={precision === 'year' ? '2200' : undefined}
                        required={precision !== 'unknown'}
                        value={
                          precision === 'year'
                            ? date.slice(0, 4)
                            : precision === 'month'
                              ? date.slice(0, 7)
                              : date
                        }
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={approximate}
                        onChange={(e) => setApproximate(e.target.checked)}
                      />
                      Approximate date
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={rewatch}
                        onChange={(e) => setRewatch(e.target.checked)}
                      />
                      Rewatch
                    </label>
                  </div>
                  {title.type === 'tv' && (
                    <div className="form-grid">
                      <Field
                        label="Season (optional)"
                        hint="Leave both empty to log the whole series."
                      >
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          value={season}
                          onChange={(e) => setSeason(e.target.value)}
                        />
                      </Field>
                      <Field label="Episode (optional)">
                        <input
                          type="number"
                          min="1"
                          max="100000"
                          value={episode}
                          onChange={(e) => setEpisode(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                  <Field label="Where I watched">
                    <input
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      placeholder="Cinema, streaming service, at home…"
                      maxLength={500}
                    />
                  </Field>
                  <Field label="Viewing notes">
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="What stayed with you?"
                    />
                  </Field>
                </>
              )}
              <Field label="Personal title notes">
                <textarea
                  rows={2}
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Your thoughts about this title…"
                />
              </Field>
            </>
          )}
          <details className="metadata-editor" open={!initial.tmdbId}>
            <summary>Edit title metadata</summary>
            <div className="form-grid">
              <Field label="Title">
                <input
                  aria-label="Title"
                  required
                  value={title.title}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={500}
                />
              </Field>
              <Field label="Original title">
                <input
                  value={title.originalTitle}
                  onChange={(e) => set('originalTitle', e.target.value)}
                  maxLength={500}
                />
              </Field>
              <Field label="Type">
                <select
                  value={title.type}
                  onChange={(e) => set('type', e.target.value)}
                  disabled={!!initial.tmdbId}
                >
                  <option value="movie">Movie</option>
                  <option value="tv">TV series</option>
                </select>
              </Field>
              <Field label="Release date" hint="YYYY, YYYY-MM or YYYY-MM-DD">
                <input
                  aria-label="Release date"
                  value={title.releaseDate}
                  onChange={(e) => set('releaseDate', e.target.value)}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
              <Field label="IMDb ID">
                <input
                  placeholder="tt1234567"
                  value={title.imdbId}
                  onChange={(e) => set('imdbId', e.target.value)}
                />
              </Field>
              <Field label="Original language">
                <input
                  value={title.language}
                  onChange={(e) => set('language', e.target.value)}
                  placeholder="en, zh, ja, ko…"
                />
              </Field>
              <Field label="Genres (comma separated)">
                <input
                  value={title.genres.join(', ')}
                  onChange={(e) =>
                    set(
                      'genres',
                      e.target.value.split(',').map((s) => s.trim()),
                    )
                  }
                />
              </Field>
              <Field label="Countries (comma separated)">
                <input
                  value={title.countries.join(', ')}
                  onChange={(e) =>
                    set(
                      'countries',
                      e.target.value.split(',').map((s) => s.trim()),
                    )
                  }
                />
              </Field>
              <Field label="Runtime in minutes">
                <input
                  type="number"
                  min="0"
                  value={title.runtime}
                  onChange={(e) => set('runtime', Number(e.target.value))}
                />
              </Field>
              {title.type === 'tv' && (
                <Field label="Total episodes">
                  <input
                    type="number"
                    min="0"
                    value={title.totalEpisodes}
                    onChange={(e) => set('totalEpisodes', Number(e.target.value))}
                  />
                </Field>
              )}
            </div>
            <Field label="Overview">
              <textarea
                rows={3}
                value={title.overview}
                onChange={(e) => set('overview', e.target.value)}
              />
            </Field>
          </details>
          <ErrorMessage error={error} />
        </div>
        <div className="modal-footer">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {mode === 'watch' ? <BookmarkPlus size={16} /> : <Check size={16} />}{' '}
            {busy
              ? 'Saving…'
              : mode === 'watch'
                ? 'Save to watchlist'
                : mode === 'metadata'
                  ? 'Save changes'
                  : 'Save viewing'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
