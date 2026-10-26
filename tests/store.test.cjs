const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Store, toCSV, fromCSV } = require('../dist-electron/electron/store.js');
const { titleSchema, dateSchema } = require('../dist-electron/shared/model.js');
const title = (id = 'movie-1', extra = {}) =>
  titleSchema.parse({ id, title: 'Test film', type: 'movie', ...extra });
const event = (id = 'event-1', extra = {}) => ({
  id,
  titleId: 'movie-1',
  date: '2020-02-29',
  approximate: false,
  rating: 8.5,
  notes: 'A note, with "quotes"\nand a new line',
  platform: 'Cinema',
  rewatch: false,
  season: null,
  episode: null,
  ...extra,
});
function temporary(t) {
  const folder = mkdtempSync(join(tmpdir(), 'watchlog-test-'));
  const store = new Store(join(folder, 'test.sqlite'));
  t.after(() => {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  });
  return { store, folder };
}
test('migrates, persists Unicode metadata and keeps release and viewing dates separate', (t) => {
  const { store, folder } = temporary(t);
  store.save({
    title: title('movie-1', { title: '花樣年華', releaseDate: '2000-09-29' }),
    event: event(),
  });
  const reopened = new Store(join(folder, 'test.sqlite'));
  assert.equal(reopened.snapshot().titles[0].title, '花樣年華');
  assert.equal(reopened.snapshot().events[0].date, '2020-02-29');
  assert.equal(reopened.snapshot().titles[0].releaseDate, '2000-09-29');
  reopened.close();
});
test('deduplicates TMDB titles while keeping multiple independent viewings', (t) => {
  const { store } = temporary(t);
  store.save({ title: title('movie-1', { tmdbId: 99 }), event: event() });
  const id = store.save({
    title: title('other', { tmdbId: 99 }),
    event: event('second', { titleId: 'other', rewatch: true }),
  });
  assert.equal(id, 'movie-1');
  assert.equal(store.snapshot().titles.length, 1);
  assert.equal(store.snapshot().events.length, 2);
});
test('prevents accidental manual duplicates but keeps remakes with different years', (t) => {
  const { store } = temporary(t);
  store.save({ title: title('movie-1', { releaseDate: '2000' }) });
  assert.equal(
    store.save({
      title: title('duplicate', { title: '  TEST FILM  ', releaseDate: '2000-01-01' }),
    }),
    'movie-1',
  );
  store.save({ title: title('remake', { releaseDate: '2020' }) });
  assert.equal(store.snapshot().titles.length, 2);
});
test('deduplicates IMDb IDs and rejects conflicting identifiers transactionally', (t) => {
  const { store } = temporary(t);
  store.save({ title: title('movie-1', { tmdbId: 1, imdbId: 'tt1234567' }) });
  store.save({ title: title('movie-2', { tmdbId: 2, imdbId: 'tt7654321' }) });
  assert.throws(() => store.save({ title: title('x', { tmdbId: 1, imdbId: 'tt7654321' }) }));
  assert.equal(store.snapshot().titles.length, 2);
});
test('rolls back metadata if an event fails its foreign key', (t) => {
  const { store } = temporary(t);
  assert.throws(() => store.episodes([event()]));
  assert.equal(store.snapshot().events.length, 0);
});
test('rejects invalid historical dates and accepts partial and unknown dates', () => {
  for (const date of ['2023-02-29', '2020-13', '2020-00-03', '2020-04-31', 'x'])
    assert.equal(dateSchema.safeParse(date).success, false, date);
  for (const date of ['2024-02-29', '1995', '2000-02', ''])
    assert.equal(dateSchema.safeParse(date).success, true, date);
});
test('archives original watchlist notes when viewing starts', (t) => {
  const { store } = temporary(t);
  store.save({
    title: title(),
    watch: {
      titleId: 'movie-1',
      priority: 1,
      notes: 'Recommended by a friend',
      added: '2020-01',
      archived: false,
    },
  });
  store.save({
    title: title(),
    entry: { titleId: 'movie-1', status: 'Watching', rating: null, notes: '' },
    event: event(),
  });
  assert.equal(store.snapshot().watchlist[0].archived, true);
  assert.equal(store.snapshot().watchlist[0].notes, 'Recommended by a friend');
});
test('JSON and multiline CSV round-trip every record and preferences', (t) => {
  const { store } = temporary(t);
  store.save({
    title: title('movie-1', { title: '日本語, "中文"' }),
    event: event(),
    entry: { titleId: 'movie-1', status: 'Completed', rating: 8.5, notes: 'Personal' },
  });
  store.setPreferences({ theme: 'dark', language: 'zh-TW' });
  const snapshot = store.snapshot();
  assert.deepEqual(fromCSV(toCSV(snapshot)), snapshot);
  store.replace(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(store.snapshot(), snapshot);
});
test('CSV neutralizes readable spreadsheet formulas without changing imported data', (t) => {
  const { store } = temporary(t);
  store.save({
    title: title('movie-1', { title: '=HYPERLINK("example")' }),
    event: event('event-1', { notes: '+SUM(1,1)' }),
  });
  const before = store.snapshot();
  const csv = toCSV(before);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+SUM"));
  assert.deepEqual(fromCSV(csv), before);
});
test('merge is idempotent and preserves existing title notes and preferences', (t) => {
  const { store } = temporary(t);
  store.save({ title: title(), event: event() });
  const data = store.snapshot();
  store.setPreferences({ theme: 'dark' });
  store.merge(data);
  store.merge(data);
  assert.equal(store.snapshot().events.length, 1);
  assert.equal(store.preferences().theme, 'dark');
});
test('invalid restore leaves all current data intact', (t) => {
  const { store } = temporary(t);
  store.save({ title: title(), event: event() });
  const before = store.snapshot();
  const broken = structuredClone(before);
  broken.events[0].titleId = 'missing';
  assert.throws(() => store.replace(broken));
  assert.deepEqual(store.snapshot(), before);
  const duplicate = structuredClone(before);
  duplicate.events.push(duplicate.events[0]);
  assert.throws(() => store.replace(duplicate));
  assert.deepEqual(store.snapshot(), before);
});
test('native SQLite backup is readable and contains full records', (t) => {
  const { store, folder } = temporary(t);
  store.save({ title: title(), event: event() });
  const path = join(folder, 'backup.sqlite');
  store.backup(path);
  const backup = new Store(path);
  assert.deepEqual(backup.snapshot(), store.snapshot());
  backup.close();
});
test('episode events retain multiple dates and cached season metadata', (t) => {
  const { store } = temporary(t);
  store.save({ title: title('movie-1', { type: 'tv', totalEpisodes: 2 }) });
  store.cacheSeason({
    titleId: 'movie-1',
    number: 1,
    episodes: [{ number: 1, name: 'Pilot', airDate: '2020-01-01', overview: '' }],
  });
  store.episodes([
    event('ep1', { season: 1, episode: 1 }),
    event('ep1-rewatch', { season: 1, episode: 1, date: '2024', rewatch: true }),
  ]);
  assert.equal(store.snapshot().events.length, 2);
  assert.equal(store.cachedSeason('movie-1', 1).episodes[0].name, 'Pilot');
});
test('title deletion cascades dependent records', (t) => {
  const { store } = temporary(t);
  store.save({
    title: title(),
    event: event(),
    entry: { titleId: 'movie-1', status: 'Completed', rating: 8, notes: '' },
  });
  store.remove('title', 'movie-1');
  assert.equal(store.snapshot().events.length, 0);
  assert.equal(store.snapshot().entries.length, 0);
});
test('unsupported future database version is rejected', (t) => {
  const { store, folder } = temporary(t);
  store.db.exec('PRAGMA user_version=999');
  assert.throws(() => new Store(join(folder, 'test.sqlite')), /newer version/);
});
