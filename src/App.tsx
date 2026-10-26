import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  Film,
  Grid2X2,
  Library,
  List,
  Plus,
  Search,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import {
  statuses,
  type State,
  type Title,
  type Viewing,
  type Discover,
  type SearchResults,
} from '../shared/model';
import { api, displayDate, metrics, name, year } from './lib';
import { Card, Empty, Poster, Busy } from './components';
import { AddDialog, Editor, initialDiscover } from './Editor';
import { Detail } from './Detail';
import { Statistics } from './Statistics';
import { Settings } from './Settings';

type Section = 'Library' | 'Discover' | 'Watchlist' | 'Statistics' | 'Settings';
const sections = [
  { name: 'Library', icon: Library },
  { name: 'Discover', icon: Compass },
  { name: 'Watchlist', icon: Bookmark },
  { name: 'Statistics', icon: BarChart3 },
  { name: 'Settings', icon: SettingsIcon },
] as const;
const descriptions: Record<Section, string> = {
  Library: 'The stories you’ve lived. All in one place.',
  Discover: 'Your next great story is out there.',
  Watchlist: 'A little anticipation. A lot to look forward to.',
  Statistics: 'A different perspective on your viewing life.',
  Settings: 'Make WatchLog feel like home.',
};
export function App() {
  const [state, setState] = useState<State | null>(null),
    [section, setSection] = useState<Section>('Library'),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('All titles'),
    [type, setType] = useState('all'),
    [sort, setSort] = useState('recent'),
    [genre, setGenre] = useState(''),
    [country, setCountry] = useState(''),
    [releaseYear, setReleaseYear] = useState(''),
    [minimum, setMinimum] = useState(''),
    [add, setAdd] = useState(false),
    [selected, setSelected] = useState<Title | null>(null),
    [editor, setEditor] = useState<{
      title: Title;
      mode: 'record' | 'metadata' | 'watch';
      event?: Viewing;
    } | null>(null),
    [message, setMessage] = useState(''),
    [fatal, setFatal] = useState(''),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState(false),
    [discover, setDiscover] = useState<Discover>(initialDiscover('en-US')),
    [results, setResults] = useState<SearchResults | null>(null),
    [discoverError, setDiscoverError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null),
    request = useRef(0);
  const refresh = useCallback(async () => {
    const next = await api.state();
    setState(next);
    return next;
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setFatal(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 9000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setSelected(null);
        setEditor(null);
        setAdd(true);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!state) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        state.preferences.theme === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : state.preferences.theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [state?.preferences.theme]);
  const notify = (e: unknown) => setMessage(e instanceof Error ? e.message : String(e));
  async function searchDiscover(input = discover) {
    const id = ++request.current;
    setBusy(true);
    setDiscoverError('');
    setResults(null);
    try {
      const result = await api.discover(input);
      if (request.current === id) setResults(result);
    } catch (e) {
      if (request.current === id) setDiscoverError((e as Error).message);
    } finally {
      if (request.current === id) setBusy(false);
    }
  }
  function navigate(next: Section) {
    setSection(next);
    setQuery('');
    setFilter('All titles');
    setGenre('');
    setCountry('');
    setReleaseYear('');
    setMinimum('');
    setSelected(null);
    if (next === 'Discover' && state) {
      const input = { ...discover, language: state.preferences.language, page: 1 };
      setDiscover(input);
      void searchDiscover(input);
    }
  }
  async function open(title: Title, remote = false) {
    if (!remote) {
      setSelected(title);
      return;
    }
    setBusy(true);
    try {
      const full = await api.details({
        id: title.tmdbId!,
        type: title.type,
        language: state!.preferences.language,
      });
      const id = await api.save({ title: full });
      const next = await refresh();
      setSelected(next.titles.find((t) => t.id === id)!);
    } catch (e) {
      notify(e);
    } finally {
      setBusy(false);
    }
  }
  async function saved(id: string) {
    const next = await refresh();
    setEditor(null);
    setSelected(next.titles.find((t) => t.id === id) || null);
    setMessage('Saved to your collection.');
  }
  function similar(title: Title, mode: 'similar' | 'recommendations') {
    const input = {
      ...initialDiscover(state!.preferences.language),
      type: title.type,
      mode,
      seed: title.tmdbId!,
    };
    setDiscover(input);
    setSelected(null);
    setSection('Discover');
    setQuery('');
    void searchDiscover(input);
  }
  if (fatal)
    return (
      <div className="startup-error">
        <h1>WatchLog could not open</h1>
        <p>{fatal}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  if (!state) return <Busy label="Opening your collection…" />;
  const original = state.preferences.titleDisplay === 'original',
    m = metrics(state);
  const entryMap = new Map(state.entries.map((e) => [e.titleId, e])),
    watchMap = new Map(state.watchlist.map((e) => [e.titleId, e]));
  const library = state.titles.filter(
    (t) => entryMap.has(t.id) || state.events.some((e) => e.titleId === t.id),
  );
  const watchlist = state.titles.filter((t) => {
    const w = watchMap.get(t.id);
    return w && !w.archived;
  });
  const lastDate = (id: string) =>
    state.events
      .filter((e) => e.titleId === id)
      .map((e) => e.date)
      .sort()
      .at(-1) || '';
  const titles = (section === 'Watchlist' ? watchlist : library)
    .filter((t) => {
      const haystack = [
        t.title,
        t.originalTitle,
        ...t.aliases,
        t.imdbId,
        ...t.genres,
        ...t.countries,
        t.language,
        entryMap.get(t.id)?.notes,
        watchMap.get(t.id)?.notes,
        ...state.events
          .filter((e) => e.titleId === t.id)
          .map((e) => `${e.date} ${e.notes} ${e.platform}`),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        haystack.includes(query.toLocaleLowerCase()) &&
        (type === 'all' || t.type === type) &&
        (filter === 'All titles' || entryMap.get(t.id)?.status === filter) &&
        (!genre || t.genres.includes(genre)) &&
        (!country || t.countries.includes(country)) &&
        (!releaseYear || t.releaseDate.startsWith(releaseYear)) &&
        (!minimum || (entryMap.get(t.id)?.rating ?? -1) >= Number(minimum))
      );
    })
    .sort((a, b) =>
      sort === 'title'
        ? name(a, original).localeCompare(name(b, original))
        : sort === 'rating'
          ? (entryMap.get(b.id)?.rating ?? -1) - (entryMap.get(a.id)?.rating ?? -1)
          : sort === 'year'
            ? b.releaseDate.localeCompare(a.releaseDate)
            : sort === 'priority'
              ? (watchMap.get(a.id)?.priority ?? 2) - (watchMap.get(b.id)?.priority ?? 2)
              : lastDate(b.id).localeCompare(lastDate(a.id)) || a.title.localeCompare(b.title),
    );
  const detailTitle = selected ? state.titles.find((t) => t.id === selected.id) || selected : null;
  const actualCount = section === 'Watchlist' ? watchlist.length : library.length;
  const list = state.preferences.view === 'list';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-symbol" src="./watchlog.svg" alt="WatchLog logo" />
          <div>
            <strong>WatchLog</strong>
            <span>Your life in stories.</span>
          </div>
        </div>
        <div className="nav-label">YOUR COLLECTION</div>
        <nav>
          {sections
            .filter((s) => s.name !== 'Settings')
            .map((s) => (
              <button
                key={s.name}
                className={section === s.name ? 'selected' : ''}
                onClick={() => navigate(s.name)}
              >
                <s.icon size={18} />
                <span>{s.name}</span>
                {(s.name === 'Library' || s.name === 'Watchlist') && (
                  <small>{s.name === 'Library' ? library.length : watchlist.length}</small>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-orbit" />
          <p>
            A place for every
            <br />
            story that stays with you.
          </p>
        </div>
        <div className="sidebar-bottom">
          <button
            className={section === 'Settings' ? 'selected' : ''}
            onClick={() => navigate('Settings')}
          >
            <SettingsIcon size={18} />
            <span>Settings</span>
          </button>
          <div className="local-status">
            <span />
            Stored on this device
          </div>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <div className="breadcrumbs">
            Your collection<span>/</span>
            <strong>{section}</strong>
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (section === 'Discover') {
                const next = { ...discover, query, page: 1 };
                setDiscover(next);
                void searchDiscover(next);
              } else if (section !== 'Library' && section !== 'Watchlist') {
                setSection('Library');
              }
            }}
          >
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Search your collection"
              placeholder={section === 'Discover' ? 'Search TMDB…' : 'Search your collection…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  if (section === 'Discover') {
                    const next = { ...discover, query: '', page: 1 };
                    setDiscover(next);
                    void searchDiscover(next);
                  }
                }}
              >
                <X size={13} />
              </button>
            ) : (
              <kbd>Ctrl K</kbd>
            )}
          </form>
          <button
            className="primary add-button"
            onClick={() => {
              setSelected(null);
              setAdd(true);
            }}
          >
            <Plus size={16} />
            Add movie or TV
          </button>
        </div>
        <div className="page">
          <header className="page-header">
            <div>
              <span className="eyebrow">
                {section === 'Discover'
                  ? 'FIND YOUR NEXT FAVOURITE'
                  : section === 'Library'
                    ? 'A PERSONAL FILM & TV JOURNAL'
                    : section === 'Watchlist'
                      ? 'GOOD THINGS AHEAD'
                      : section === 'Statistics'
                        ? 'YOUR VIEWING, REFLECTED'
                        : 'A SPACE THAT’S YOURS'}
              </span>
              <h1>
                {section === 'Library'
                  ? 'Your library'
                  : section === 'Watchlist'
                    ? 'Your watchlist'
                    : section}
              </h1>
              <p>{descriptions[section]}</p>
            </div>
            {(section === 'Library' || section === 'Watchlist') && (
              <div className="collection-count">
                <strong>{actualCount}</strong>
                <span>{actualCount === 1 ? 'title' : 'titles'} collected</span>
              </div>
            )}
          </header>
          {section === 'Library' && (
            <div className="library-overview">
              <div>
                <Film size={17} />
                <strong>{m.movies}</strong>
                <span>movies watched</span>
              </div>
              <div>
                <Library size={17} />
                <strong>{m.series}</strong>
                <span>series watched</span>
              </div>
              <div>
                <span className="status-dot s-Watching" />
                <strong>{m.watching}</strong>
                <span>in progress</span>
              </div>
              <span className="overview-trailing">One story at a time.</span>
            </div>
          )}
          {(section === 'Library' || section === 'Watchlist') && (
            <>
              <div className="collection-toolbar">
                <div className="collection-tabs">
                  {(section === 'Library'
                    ? ['All titles', 'Watching', 'Completed', 'On Hold', 'Dropped']
                    : ['All titles']
                  ).map((f) => (
                    <button
                      className={filter === f ? 'active' : ''}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f === 'All titles' ? 'All titles' : f}
                    </button>
                  ))}
                </div>
                <div className="toolbar-controls">
                  <select
                    aria-label="Filter media type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="all">All types</option>
                    <option value="movie">Movies</option>
                    <option value="tv">TV series</option>
                  </select>
                  <select
                    aria-label="Sort titles"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="recent">Last watched</option>
                    <option value="title">Title A–Z</option>
                    <option value="year">Release year</option>
                    <option value="rating">My rating</option>
                    {section === 'Watchlist' && <option value="priority">Priority</option>}
                  </select>
                  <button
                    className={`icon-button ${filters ? 'active' : ''}`}
                    aria-label="Toggle library filters"
                    onClick={() => setFilters(!filters)}
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                  <div className="segmented view-toggle">
                    <button
                      aria-label="Poster grid view"
                      className={!list ? 'active' : ''}
                      onClick={() =>
                        void api
                          .preferences({ ...state.preferences, view: 'grid' })
                          .then(refresh)
                          .catch(notify)
                      }
                    >
                      <Grid2X2 size={16} />
                    </button>
                    <button
                      aria-label="Compact list view"
                      className={list ? 'active' : ''}
                      onClick={() =>
                        void api
                          .preferences({ ...state.preferences, view: 'list' })
                          .then(refresh)
                          .catch(notify)
                      }
                    >
                      <List size={17} />
                    </button>
                  </div>
                </div>
              </div>
              {filters && (
                <div className="filter-panel">
                  <FieldSelect
                    label="Genre"
                    value={genre}
                    onChange={setGenre}
                    options={[...new Set(library.flatMap((t) => t.genres))]
                      .sort()
                      .map((v) => [v, v])}
                  />
                  <FieldSelect
                    label="Country"
                    value={country}
                    onChange={setCountry}
                    options={[...new Set(library.flatMap((t) => t.countries))]
                      .sort()
                      .map((v) => [v, v])}
                  />
                  <FieldSelect
                    label="Release year"
                    value={releaseYear}
                    onChange={setReleaseYear}
                    options={[
                      ...new Set(library.map((t) => t.releaseDate.slice(0, 4)).filter(Boolean)),
                    ]
                      .sort()
                      .reverse()
                      .map((v) => [v, v])}
                  />
                  <FieldSelect
                    label="Minimum personal rating"
                    value={minimum}
                    onChange={setMinimum}
                    options={['5', '6', '7', '8', '9'].map((v) => [v, `${v}+`])}
                  />
                  <button
                    onClick={() => {
                      setGenre('');
                      setCountry('');
                      setReleaseYear('');
                      setMinimum('');
                      setFilter('All titles');
                      setType('all');
                      setQuery('');
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
              {actualCount === 0 ? (
                <Empty
                  icon={section === 'Library' ? <Film size={38} /> : <Bookmark size={34} />}
                  heading={
                    section === 'Library'
                      ? 'A home for your viewing life'
                      : 'Keep a little something for later'
                  }
                  description={
                    section === 'Library'
                      ? 'The unforgettable films. The series you couldn’t put down. Start your collection with something you’ve watched.'
                      : 'Save the films and series that catch your eye. They’ll be right here when you’re ready.'
                  }
                >
                  <button
                    className="primary"
                    onClick={() => (section === 'Library' ? setAdd(true) : navigate('Discover'))}
                  >
                    <Plus size={16} />
                    {section === 'Library' ? 'Add your first title' : 'Find something to watch'}
                  </button>
                  {section === 'Library' && (
                    <button className="text-button" onClick={() => navigate('Discover')}>
                      Explore Discover
                      <ChevronRight size={14} />
                    </button>
                  )}
                </Empty>
              ) : !titles.length ? (
                <Empty
                  icon={<Search size={30} />}
                  heading="No titles found"
                  description="Try a different search or adjust your filters."
                />
              ) : list ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Year</th>
                        <th>Type</th>
                        <th>{section === 'Watchlist' ? 'Priority' : 'Status'}</th>
                        <th>My rating</th>
                        <th>{section === 'Watchlist' ? 'Added' : 'Last watched'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {titles.map((title) => (
                        <tr
                          key={title.id}
                          onClick={() => void open(title)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void open(title);
                          }}
                          aria-label={`Open ${title.title}`}
                        >
                          <td>
                            <div className="table-title">
                              <Poster title={title} small />
                              <div>
                                <strong>{name(title, original)}</strong>
                                {title.originalTitle !== title.title && (
                                  <small>{title.originalTitle}</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>{year(title)}</td>
                          <td>{title.type === 'movie' ? 'Movie' : 'TV series'}</td>
                          <td>
                            <span className="badge">
                              {section === 'Watchlist'
                                ? ['', 'High', 'Medium', 'Low'][
                                    watchMap.get(title.id)?.priority ?? 2
                                  ]
                                : entryMap.get(title.id)?.status || 'Watching'}
                            </span>
                          </td>
                          <td>{entryMap.get(title.id)?.rating ?? '—'}</td>
                          <td>
                            {displayDate(
                              section === 'Watchlist'
                                ? watchMap.get(title.id)?.added || ''
                                : lastDate(title.id),
                              state.preferences.dateFormat,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="poster-grid">
                  {titles.map((title) => (
                    <Card
                      key={title.id}
                      title={title}
                      original={original}
                      rating={entryMap.get(title.id)?.rating}
                      status={section === 'Library' ? entryMap.get(title.id)?.status : undefined}
                      caption={
                        section === 'Library'
                          ? lastDate(title.id)
                            ? `Last watched ${displayDate(lastDate(title.id), state.preferences.dateFormat)}`
                            : undefined
                          : `${['', 'High', 'Medium', 'Low'][watchMap.get(title.id)?.priority ?? 2]} priority`
                      }
                      onClick={() => void open(title)}
                    >
                      {section === 'Watchlist' && (
                        <div className="watch-card-actions">
                          <button
                            className="text-button"
                            onClick={() => setEditor({ title, mode: 'record' })}
                          >
                            Log viewing
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${title.title} from watchlist`}
                            onClick={() =>
                              void api
                                .remove({ kind: 'watch', id: title.id })
                                .then(refresh)
                                .catch(notify)
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
          {section === 'Discover' && (
            <>
              <div className="discover-modes">
                {[
                  ['trending', 'Trending'],
                  ['popular', 'Popular'],
                  ['top_rated', 'Highly rated'],
                  ['upcoming', 'Upcoming'],
                  ['recommendations', 'For you'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={discover.mode === value ? 'active' : ''}
                    onClick={() => {
                      let next: Discover = {
                        ...initialDiscover(state.preferences.language),
                        type: discover.type,
                        mode: value as Discover['mode'],
                      };
                      if (value === 'recommendations') {
                        const seed = state.entries
                          .filter((e) => e.rating !== null && e.rating >= 7)
                          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
                          .map((e) => state.titles.find((t) => t.id === e.titleId))
                          .find((t) => t?.tmdbId);
                        if (seed) next = { ...next, seed: seed.tmdbId!, type: seed.type };
                      }
                      setDiscover(next);
                      setQuery('');
                      void searchDiscover(next);
                    }}
                  >
                    {value === 'recommendations' && <Sparkles size={14} />} {label}
                  </button>
                ))}
              </div>
              <form
                className="discover-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next: Discover = {
                    ...discover,
                    query,
                    page: 1,
                    language: state.preferences.language,
                    mode:
                      discover.mode === 'upcoming' ||
                      discover.mode === 'recommendations' ||
                      discover.mode === 'similar'
                        ? discover.mode
                        : 'discover',
                  };
                  setDiscover(next);
                  void searchDiscover(next);
                }}
              >
                <FieldSelect
                  label="Type"
                  value={discover.type}
                  onChange={(v) =>
                    setDiscover({
                      ...discover,
                      type: v as Discover['type'],
                      genre: '',
                      seed: undefined,
                      mode:
                        discover.mode === 'recommendations' || discover.mode === 'similar'
                          ? 'trending'
                          : discover.mode,
                    })
                  }
                  options={[
                    ['movie', 'Movies'],
                    ['tv', 'TV series'],
                  ]}
                  all={false}
                />
                <FieldSelect
                  label="Genre"
                  value={discover.genre}
                  onChange={(v) => setDiscover({ ...discover, genre: v })}
                  options={
                    discover.type === 'movie'
                      ? [
                          ['28', 'Action'],
                          ['12', 'Adventure'],
                          ['16', 'Animation'],
                          ['35', 'Comedy'],
                          ['80', 'Crime'],
                          ['99', 'Documentary'],
                          ['18', 'Drama'],
                          ['14', 'Fantasy'],
                          ['27', 'Horror'],
                          ['9648', 'Mystery'],
                          ['10749', 'Romance'],
                          ['878', 'Science fiction'],
                          ['53', 'Thriller'],
                        ]
                      : [
                          ['10759', 'Action & Adventure'],
                          ['16', 'Animation'],
                          ['35', 'Comedy'],
                          ['80', 'Crime'],
                          ['99', 'Documentary'],
                          ['18', 'Drama'],
                          ['9648', 'Mystery'],
                          ['10765', 'Sci-Fi & Fantasy'],
                        ]
                  }
                />
                <FieldSelect
                  label="Country"
                  value={discover.country}
                  onChange={(v) => setDiscover({ ...discover, country: v })}
                  options={countries}
                />
                <FieldSelect
                  label="Original language"
                  value={discover.originalLanguage}
                  onChange={(v) => setDiscover({ ...discover, originalLanguage: v })}
                  options={languages}
                />
                <label className="field">
                  <span>Year from</span>
                  <input
                    aria-label="Year from"
                    type="number"
                    min="1800"
                    max="2200"
                    placeholder="Any"
                    value={discover.yearFrom}
                    onChange={(e) => setDiscover({ ...discover, yearFrom: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Year to</span>
                  <input
                    aria-label="Year to"
                    type="number"
                    min="1800"
                    max="2200"
                    placeholder="Any"
                    value={discover.yearTo}
                    onChange={(e) => setDiscover({ ...discover, yearTo: e.target.value })}
                  />
                </label>
                <FieldSelect
                  label="TMDB score"
                  value={String(discover.minimumRating)}
                  onChange={(v) => setDiscover({ ...discover, minimumRating: Number(v) })}
                  options={['0', '5', '6', '7', '8', '9'].map((v) => [
                    v,
                    v === '0' ? 'Any' : v + '+',
                  ])}
                  all={false}
                />
                <FieldSelect
                  label="Sort by"
                  value={discover.sort}
                  onChange={(v) => setDiscover({ ...discover, sort: v as Discover['sort'] })}
                  options={[
                    ['popularity.desc', 'Popularity'],
                    ['vote_average.desc', 'TMDB rating'],
                    [
                      discover.type === 'movie'
                        ? 'primary_release_date.desc'
                        : 'first_air_date.desc',
                      'Newest first',
                    ],
                  ]}
                  all={false}
                />
                <button className="primary" disabled={busy}>
                  Apply
                </button>
              </form>
              {discover.query && (
                <p className="callout">
                  Searching for “{discover.query}”. TMDB title search does not apply discovery
                  filters. Clear the search to browse with filters.
                </p>
              )}
              {discover.mode === 'recommendations' && discover.seed && (
                <p className="callout">
                  TMDB recommendations based on{' '}
                  {state.titles.find((t) => t.tmdbId === discover.seed && t.type === discover.type)
                    ?.title || 'your selected title'}
                  . Your personal viewing history is never uploaded.
                </p>
              )}
              {busy ? (
                <Busy label="Exploring TMDB…" />
              ) : discoverError ? (
                <Empty
                  icon={<Compass size={34} />}
                  heading={
                    state.configured ? 'Discovery is unavailable' : 'A world of stories awaits'
                  }
                  description={discoverError}
                >
                  <button
                    className="primary"
                    onClick={() =>
                      state.configured ? void searchDiscover() : navigate('Settings')
                    }
                  >
                    {state.configured ? 'Try again' : 'Connect TMDB'}
                  </button>
                </Empty>
              ) : results?.titles.length ? (
                <>
                  <div className="section-heading">
                    <h3>
                      {discover.query
                        ? 'Search results'
                        : discover.mode === 'similar'
                          ? 'Similar titles'
                          : discover.mode === 'recommendations'
                            ? 'Picked from your favourites'
                            : discover.mode === 'trending'
                              ? 'In the conversation'
                              : 'Worth a closer look'}
                    </h3>
                    <span className="muted">Metadata by TMDB</span>
                  </div>
                  <div className="poster-grid">
                    {results.titles.map((title) => (
                      <Card
                        key={title.id}
                        title={title}
                        original={original}
                        caption={
                          title.tmdbRating > 0
                            ? `TMDB ${title.tmdbRating.toFixed(1)} · ${title.votes.toLocaleString()} votes`
                            : undefined
                        }
                        onClick={() => void open(title, true)}
                      />
                    ))}
                  </div>
                  <div className="pagination">
                    <button
                      disabled={results.page <= 1}
                      onClick={() => {
                        const next = { ...discover, page: discover.page - 1 };
                        setDiscover(next);
                        void searchDiscover(next);
                      }}
                    >
                      <ChevronLeft size={15} />
                      Previous
                    </button>
                    <span>
                      Page {results.page} of {results.pages}
                    </span>
                    <button
                      disabled={results.page >= results.pages}
                      onClick={() => {
                        const next = { ...discover, page: discover.page + 1 };
                        setDiscover(next);
                        void searchDiscover(next);
                      }}
                    >
                      Next
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </>
              ) : (
                <Empty
                  icon={<Search size={30} />}
                  heading="No matches this time"
                  description="Try another title, language or combination of filters."
                />
              )}
            </>
          )}
          {section === 'Statistics' && <Statistics state={state} />}
          {section === 'Settings' && (
            <Settings
              state={state}
              onChanged={async () => {
                await refresh();
              }}
              onMessage={setMessage}
            />
          )}
          <footer className="page-footer">
            <span>WATCHLOG</span>
            <p>A little less scrolling. A little more cinema.</p>
          </footer>
        </div>
      </main>
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setMessage('')}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {add && (
        <AddDialog
          state={state}
          onClose={() => setAdd(false)}
          onSelect={(title) => {
            setAdd(false);
            setEditor({ title, mode: 'record' });
          }}
        />
      )}
      {detailTitle && !editor && (
        <Detail
          key={detailTitle.id}
          title={detailTitle}
          state={state}
          onClose={() => setSelected(null)}
          onEdit={(mode, event) => setEditor({ title: detailTitle, mode, event })}
          onChanged={async () => {
            await refresh();
          }}
          onSimilar={similar}
          onError={setMessage}
        />
      )}
      {editor && (
        <Editor
          key={`${editor.title.id}-${editor.event?.id || editor.mode}`}
          {...editor}
          state={state}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}
function FieldSelect({
  label,
  value,
  onChange,
  options,
  all = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
  all?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="">Any</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
const countries = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['HK', 'Hong Kong'],
  ['CN', 'Mainland China'],
  ['TW', 'Taiwan'],
  ['JP', 'Japan'],
  ['KR', 'South Korea'],
  ['AU', 'Australia'],
  ['FR', 'France'],
  ['IN', 'India'],
];
const languages = [
  ['en', 'English'],
  ['zh', 'Mandarin'],
  ['cn', 'Cantonese'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['fr', 'French'],
  ['hi', 'Hindi'],
];
