import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import {
  titleSchema,
  entrySchema,
  eventSchema,
  watchSchema,
  seasonSchema,
  prefsSchema,
  snapshotSchema,
  saveSchema,
  type Snapshot,
  type Save,
  type Title,
  type Viewing,
  type Season,
} from '../shared/model';

export class Store {
  db: DatabaseSync;
  constructor(public path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    const version = Number((this.db.prepare('PRAGMA user_version').get() as any).user_version);
    if (version > 1) {
      this.db.close();
      throw new Error('This database requires a newer version of WatchLog.');
    }
    if (version === 0)
      this.transaction(() => {
        this.db
          .exec(`CREATE TABLE titles (id TEXT PRIMARY KEY, tmdb_id INTEGER, type TEXT NOT NULL, imdb_id TEXT, metadata TEXT NOT NULL, UNIQUE(tmdb_id,type));
        CREATE UNIQUE INDEX unique_imdb ON titles(imdb_id) WHERE imdb_id IS NOT NULL AND imdb_id != '';
        CREATE TABLE entries (title_id TEXT PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE, data TEXT NOT NULL);
        CREATE TABLE events (id TEXT PRIMARY KEY, title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE, date TEXT NOT NULL, data TEXT NOT NULL);
        CREATE INDEX events_by_title ON events(title_id,date);
        CREATE TABLE watchlist (title_id TEXT PRIMARY KEY REFERENCES titles(id) ON DELETE CASCADE, data TEXT NOT NULL);
        CREATE TABLE seasons (title_id TEXT NOT NULL REFERENCES titles(id) ON DELETE CASCADE, number INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(title_id,number));
        CREATE TABLE preferences (key TEXT PRIMARY KEY, data TEXT NOT NULL);
        PRAGMA user_version=1;`);
      });
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  all(table: string): any[] {
    return this.db
      .prepare(`SELECT ${table === 'titles' ? 'metadata' : 'data'} AS data FROM ${table}`)
      .all()
      .map((r: any) => JSON.parse(r.data));
  }
  snapshot(): Snapshot {
    return snapshotSchema.parse({
      format: 'watchlog',
      version: 1,
      titles: this.all('titles'),
      entries: this.all('entries'),
      events: this.all('events'),
      watchlist: this.all('watchlist'),
      seasons: this.all('seasons'),
      preferences: this.preferences(),
    });
  }
  preferences() {
    const row = this.db.prepare("SELECT data FROM preferences WHERE key='app'").get() as any;
    return prefsSchema.parse(row ? JSON.parse(row.data) : {});
  }
  setPreferences(data: unknown) {
    this.db
      .prepare(
        "INSERT INTO preferences VALUES ('app',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
      )
      .run(JSON.stringify(prefsSchema.parse(data)));
  }
  title(id: string): Title {
    const row = this.db.prepare('SELECT metadata FROM titles WHERE id=?').get(id) as any;
    if (!row) throw new Error('Title no longer exists.');
    return titleSchema.parse(JSON.parse(row.metadata));
  }
  save(input: Save): string {
    const data = saveSchema.parse(input);
    return this.transaction(() => {
      let title = data.title;
      const existing = this.db
        .prepare(
          "SELECT id FROM titles WHERE (tmdb_id=? AND type=?) OR (imdb_id=? AND imdb_id!='') OR id=?",
        )
        .all(title.tmdbId, title.type, title.imdbId, title.id) as any[];
      if (!existing.length && !title.tmdbId && !title.imdbId) {
        const manual = this.all('titles').find(
          (t: Title) =>
            !t.tmdbId &&
            !t.imdbId &&
            t.type === title.type &&
            t.title.normalize('NFKC').trim().toLocaleLowerCase() ===
              title.title.normalize('NFKC').trim().toLocaleLowerCase() &&
            t.releaseDate.slice(0, 4) === title.releaseDate.slice(0, 4),
        );
        if (manual) existing.push({ id: manual.id });
      }
      if (new Set(existing.map((r) => r.id)).size > 1)
        throw new Error(
          'These identifiers belong to different saved titles. Correct them before saving.',
        );
      if (existing.length) title = { ...title, id: existing[0].id };
      this.db
        .prepare(
          'INSERT INTO titles VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tmdb_id=excluded.tmdb_id,type=excluded.type,imdb_id=excluded.imdb_id,metadata=excluded.metadata',
        )
        .run(title.id, title.tmdbId, title.type, title.imdbId, JSON.stringify(title));
      if (data.entry) {
        const entry = entrySchema.parse({ ...data.entry, titleId: title.id });
        this.db
          .prepare(
            'INSERT INTO entries VALUES (?,?) ON CONFLICT(title_id) DO UPDATE SET data=excluded.data',
          )
          .run(title.id, JSON.stringify(entry));
      }
      if (data.event) this.putEvent({ ...data.event, titleId: title.id });
      if (data.watch) {
        const watch = watchSchema.parse({ ...data.watch, titleId: title.id });
        this.db
          .prepare(
            'INSERT INTO watchlist VALUES (?,?) ON CONFLICT(title_id) DO UPDATE SET data=excluded.data',
          )
          .run(title.id, JSON.stringify(watch));
      } else if (data.entry && data.entry.status !== 'Planning to Watch') {
        const row = this.db
          .prepare('SELECT data FROM watchlist WHERE title_id=?')
          .get(title.id) as any;
        if (row)
          this.db
            .prepare('UPDATE watchlist SET data=? WHERE title_id=?')
            .run(JSON.stringify({ ...JSON.parse(row.data), archived: true }), title.id);
      }
      return title.id;
    });
  }
  putEvent(input: Viewing) {
    const event = eventSchema.parse(input);
    const existing = this.db.prepare('SELECT title_id FROM events WHERE id=?').get(event.id) as any;
    if (existing && existing.title_id !== event.titleId)
      throw new Error('Cannot move a viewing to another title.');
    this.db
      .prepare(
        'INSERT INTO events VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,data=excluded.data',
      )
      .run(event.id, event.titleId, event.date, JSON.stringify(event));
  }
  episodes(events: Viewing[]) {
    this.transaction(() => {
      for (const event of events) this.putEvent(event);
    });
  }
  cachedSeason(titleId: string, number: number): Season | undefined {
    const row = this.db
      .prepare('SELECT data FROM seasons WHERE title_id=? AND number=?')
      .get(titleId, number) as any;
    return row ? seasonSchema.parse(JSON.parse(row.data)) : undefined;
  }
  cacheSeason(input: Season) {
    const data = seasonSchema.parse(input);
    this.db
      .prepare(
        'INSERT INTO seasons VALUES (?,?,?) ON CONFLICT(title_id,number) DO UPDATE SET data=excluded.data',
      )
      .run(data.titleId, data.number, JSON.stringify(data));
  }
  remove(kind: 'title' | 'event' | 'watch', id: string) {
    const table = { title: 'titles', event: 'events', watch: 'watchlist' }[kind];
    this.db.prepare(`DELETE FROM ${table} WHERE ${kind === 'watch' ? 'title_id' : 'id'}=?`).run(id);
  }
  validateSnapshot(input: unknown) {
    const data = snapshotSchema.parse(input);
    const ids = new Set(data.titles.map((t) => t.id));
    if (ids.size !== data.titles.length) throw new Error('Duplicate title IDs in backup.');
    for (const [name, rows, key] of [
      ['viewings', data.events, 'id'],
      ['entries', data.entries, 'titleId'],
      ['watchlist', data.watchlist, 'titleId'],
      ['seasons', data.seasons, 'seasonKey'],
    ] as const) {
      const keys = new Set<string>();
      for (const row of rows) {
        if (!ids.has(row.titleId)) throw new Error('Backup contains an orphaned record.');
        const k =
          key === 'seasonKey' ? `${row.titleId}:${(row as Season).number}` : (row as any)[key];
        if (keys.has(k)) throw new Error(`Duplicate ${name} record.`);
        keys.add(k);
      }
    }
    const external = new Set<string>();
    for (const t of data.titles)
      for (const key of [t.tmdbId ? `${t.type}:${t.tmdbId}` : '', t.imdbId])
        if (key) {
          if (external.has(key)) throw new Error('Duplicate external identifier.');
          external.add(key);
        }
    return data;
  }
  replace(input: unknown) {
    const data = this.validateSnapshot(input);
    this.transaction(() => {
      this.db.exec(
        'DELETE FROM events; DELETE FROM entries; DELETE FROM watchlist; DELETE FROM seasons; DELETE FROM titles; DELETE FROM preferences;',
      );
      for (const title of data.titles)
        this.db
          .prepare('INSERT INTO titles VALUES (?,?,?,?,?)')
          .run(title.id, title.tmdbId, title.type, title.imdbId, JSON.stringify(title));
      for (const e of data.entries)
        this.db.prepare('INSERT INTO entries VALUES (?,?)').run(e.titleId, JSON.stringify(e));
      for (const e of data.events) this.putEvent(e);
      for (const w of data.watchlist)
        this.db.prepare('INSERT INTO watchlist VALUES (?,?)').run(w.titleId, JSON.stringify(w));
      for (const s of data.seasons) this.cacheSeason(s);
      this.setPreferences(data.preferences);
    });
  }
  merge(input: unknown) {
    const data = this.validateSnapshot(input);
    this.transaction(() => {
      const map = new Map<string, string>();
      for (const title of data.titles) {
        const row = this.db
          .prepare(
            "SELECT id FROM titles WHERE id=? OR (tmdb_id=? AND type=?) OR (imdb_id=? AND imdb_id!='')",
          )
          .get(title.id, title.tmdbId, title.type, title.imdbId) as any;
        if (row) map.set(title.id, row.id);
        else {
          this.db
            .prepare('INSERT INTO titles VALUES (?,?,?,?,?)')
            .run(title.id, title.tmdbId, title.type, title.imdbId, JSON.stringify(title));
          map.set(title.id, title.id);
        }
      }
      for (const e of data.entries) {
        const id = map.get(e.titleId)!;
        this.db
          .prepare('INSERT OR IGNORE INTO entries VALUES (?,?)')
          .run(id, JSON.stringify({ ...e, titleId: id }));
      }
      for (const e of data.events) {
        if (!this.db.prepare('SELECT id FROM events WHERE id=?').get(e.id))
          this.putEvent({ ...e, titleId: map.get(e.titleId)! });
      }
      for (const w of data.watchlist) {
        const id = map.get(w.titleId)!;
        this.db
          .prepare('INSERT OR IGNORE INTO watchlist VALUES (?,?)')
          .run(id, JSON.stringify({ ...w, titleId: id }));
      }
      for (const s of data.seasons) {
        const id = map.get(s.titleId)!;
        if (!this.cachedSeason(id, s.number)) this.cacheSeason({ ...s, titleId: id });
      }
    });
  }
  backup(path: string) {
    this.db.prepare('VACUUM INTO ?').run(path);
  }
  close() {
    this.db.close();
  }
}

export function toCSV(snapshot: Snapshot): string {
  const rows: string[][] = [
    ['record_type', 'title', 'viewing_date', 'personal_rating', 'notes', 'json'],
  ];
  for (const key of ['titles', 'entries', 'events', 'watchlist', 'seasons'] as const)
    for (const value of snapshot[key]) {
      const title =
        'title' in value
          ? value.title
          : (snapshot.titles.find((t) => t.id === (value as any).titleId)?.title ?? '');
      rows.push([
        key,
        title,
        'date' in value ? value.date : '',
        'rating' in value ? String(value.rating ?? '') : '',
        'notes' in value ? value.notes : '',
        JSON.stringify(value),
      ]);
    }
  rows.push(['preferences', '', '', '', '', JSON.stringify(snapshot.preferences)]);
  return (
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((value, index) => {
            const v = index > 0 && index < 5 && /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
            return '"' + v.replaceAll('"', '""') + '"';
          })
          .join(','),
      )
      .join('\r\n')
  );
}
export function fromCSV(input: string): Snapshot {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quote = false;
  const s = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (quote && s[i + 1] === '"') {
        field += '"';
        i++;
      } else quote = !quote;
    } else if (c === ',' && !quote) {
      row.push(field);
      field = '';
    } else if (c === '\n' && !quote) {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (quote) throw new Error('CSV contains an unfinished quoted field.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (rows.shift()?.join(',') !== 'record_type,title,viewing_date,personal_rating,notes,json')
    throw new Error('Select a CSV exported by WatchLog.');
  const data: any = {
    format: 'watchlog',
    version: 1,
    titles: [],
    entries: [],
    events: [],
    watchlist: [],
    seasons: [],
    preferences: {},
  };
  for (const r of rows) {
    if (
      r.length !== 6 ||
      !['titles', 'entries', 'events', 'watchlist', 'seasons', 'preferences'].includes(r[0])
    )
      throw new Error('Invalid WatchLog CSV row.');
    const value = JSON.parse(r[5]);
    if (r[0] === 'preferences') data.preferences = value;
    else data[r[0]].push(value);
  }
  return snapshotSchema.parse(data);
}
