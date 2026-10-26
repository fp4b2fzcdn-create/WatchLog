import type { Bridge, Title, Snapshot } from '../shared/model';
declare global {
  interface Window {
    watchlog: Bridge;
  }
}
export const api = window.watchlog;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const uid = () => crypto.randomUUID();
export const year = (title: Title) => title.releaseDate.slice(0, 4) || 'Year unknown';
export function displayDate(date: string, format = 'local') {
  if (!date) return 'Date unknown';
  if (format === 'iso') return date;
  if (date.length === 4) return date;
  if (date.length === 7)
    return new Date(date + '-01T12:00:00').toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
export const name = (title: Title, original = false) =>
  original && title.originalTitle ? title.originalTitle : title.title;
export function metrics(data: Snapshot) {
  const watchedIds = new Set([
    ...data.events.map((e) => e.titleId),
    ...data.entries.filter((e) => e.status === 'Completed').map((e) => e.titleId),
  ]);
  const watched = data.titles.filter((t) => watchedIds.has(t.id));
  return {
    watched,
    movies: watched.filter((t) => t.type === 'movie').length,
    series: watched.filter((t) => t.type === 'tv').length,
    episodes: data.events.filter((e) => e.episode !== null).length,
    events: data.events.length,
    rewatches: data.events.filter((e) => e.rewatch).length,
    watching: data.entries.filter((e) => e.status === 'Watching').length,
  };
}
export function progress(data: Snapshot, title: Title) {
  const events = data.events.filter((e) => e.titleId === title.id && e.episode !== null);
  return new Set(events.map((e) => `${e.season}:${e.episode}`)).size;
}
