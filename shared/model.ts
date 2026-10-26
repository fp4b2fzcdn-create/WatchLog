import { z } from 'zod';

export const statuses = [
  'Planning to Watch',
  'Watching',
  'Completed',
  'On Hold',
  'Dropped',
] as const;
const text = z.string().max(20000);
const short = z.string().max(500);
export const idSchema = z.string().min(1).max(150);
export const dateSchema = z.string().refine((value) => {
  if (value === '') return true;
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1800 || y > 2200 || (m !== undefined && (m < 1 || m > 12))) return false;
  return d === undefined || (d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate());
}, 'Use a valid YYYY, YYYY-MM or YYYY-MM-DD date (or leave blank).');
export const titleSchema = z.object({
  id: idSchema,
  tmdbId: z.number().int().positive().nullable().default(null),
  imdbId: z
    .string()
    .regex(/^(tt\d{5,12})?$/)
    .default(''),
  type: z.enum(['movie', 'tv']),
  title: short.trim().min(1),
  originalTitle: short.default(''),
  releaseDate: dateSchema.default(''),
  overview: text.default(''),
  genres: z.array(short).max(100).default([]),
  countries: z.array(short).max(100).default([]),
  language: short.default(''),
  poster: z
    .string()
    .regex(/^(\/[a-zA-Z0-9_.-]+)?$/)
    .default(''),
  backdrop: z
    .string()
    .regex(/^(\/[a-zA-Z0-9_.-]+)?$/)
    .default(''),
  runtime: z.number().int().nonnegative().max(100000).default(0),
  tmdbRating: z.number().min(0).max(10).default(0),
  votes: z.number().int().nonnegative().default(0),
  cast: z.array(short).max(100).default([]),
  creators: z.array(short).max(100).default([]),
  aliases: z.array(short).max(500).default([]),
  totalEpisodes: z.number().int().nonnegative().max(100000).default(0),
  seasons: z
    .array(
      z.object({
        number: z.number().int().nonnegative(),
        name: short,
        count: z.number().int().nonnegative(),
      }),
    )
    .max(1000)
    .default([]),
});
export const eventSchema = z
  .object({
    id: idSchema,
    titleId: idSchema,
    date: dateSchema,
    approximate: z.boolean().default(false),
    rating: z.number().min(0).max(10).nullable().default(null),
    notes: text.default(''),
    platform: short.default(''),
    rewatch: z.boolean().default(false),
    season: z.number().int().nonnegative().nullable().default(null),
    episode: z.number().int().positive().nullable().default(null),
  })
  .refine((e) => e.episode === null || e.season !== null, 'An episode requires a season.');
export const entrySchema = z.object({
  titleId: idSchema,
  status: z.enum(statuses),
  rating: z.number().min(0).max(10).nullable().default(null),
  notes: text.default(''),
});
export const watchSchema = z.object({
  titleId: idSchema,
  priority: z.number().int().min(1).max(3),
  notes: text,
  added: dateSchema,
  archived: z.boolean().default(false),
});
export const episodeSchema = z.object({
  number: z.number().int().positive(),
  name: short,
  airDate: dateSchema,
  overview: text,
});
export const seasonSchema = z.object({
  titleId: idSchema,
  number: z.number().int().nonnegative(),
  episodes: z.array(episodeSchema).max(1000),
});
export const prefsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  language: z.enum(['en-US', 'zh-TW', 'zh-CN', 'ja-JP', 'ko-KR']).default('en-US'),
  titleDisplay: z.enum(['localized', 'original']).default('localized'),
  dateFormat: z.enum(['local', 'iso']).default('local'),
  view: z.enum(['grid', 'list']).default('grid'),
});
export const snapshotSchema = z.object({
  format: z.literal('watchlog'),
  version: z.literal(1),
  titles: z.array(titleSchema).max(100000),
  entries: z.array(entrySchema).max(100000),
  events: z.array(eventSchema).max(1000000),
  watchlist: z.array(watchSchema).max(100000),
  seasons: z.array(seasonSchema).max(100000),
  preferences: prefsSchema,
});
export const discoverSchema = z.object({
  query: z.string().max(300).default(''),
  type: z.enum(['movie', 'tv']).default('movie'),
  mode: z
    .enum([
      'trending',
      'popular',
      'top_rated',
      'upcoming',
      'discover',
      'recommendations',
      'similar',
    ])
    .default('trending'),
  language: prefsSchema.shape.language,
  page: z.number().int().min(1).max(500).default(1),
  genre: z.string().regex(/^\d*$/).default(''),
  country: z
    .string()
    .regex(/^([A-Z]{2})?$/)
    .default(''),
  originalLanguage: z
    .string()
    .regex(/^([a-z]{2})?$/)
    .default(''),
  yearFrom: z
    .string()
    .regex(/^(\d{4})?$/)
    .default(''),
  yearTo: z
    .string()
    .regex(/^(\d{4})?$/)
    .default(''),
  minimumRating: z.number().min(0).max(10).default(0),
  sort: z
    .enum([
      'popularity.desc',
      'vote_average.desc',
      'primary_release_date.desc',
      'first_air_date.desc',
    ])
    .default('popularity.desc'),
  seed: z.number().int().positive().optional(),
});
export type Title = z.infer<typeof titleSchema>;
export type Viewing = z.infer<typeof eventSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Watch = z.infer<typeof watchSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type Preferences = z.infer<typeof prefsSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Discover = z.infer<typeof discoverSchema>;
export type State = Snapshot & { configured: boolean; dataPath: string; versionName: string };
export type SearchResults = { titles: Title[]; page: number; pages: number };
export type Save = { title: Title; entry?: Entry; event?: Viewing; watch?: Watch };
export const saveSchema = z.object({
  title: titleSchema,
  entry: entrySchema.optional(),
  event: eventSchema.optional(),
  watch: watchSchema.optional(),
});
export interface Bridge {
  state(): Promise<State>;
  save(data: Save): Promise<string>;
  remove(data: { kind: 'title' | 'event' | 'watch'; id: string }): Promise<void>;
  discover(data: Discover): Promise<SearchResults>;
  details(data: { id: number; type: 'movie' | 'tv'; language: string }): Promise<Title>;
  season(data: { titleId: string; number: number; refresh: boolean }): Promise<Season>;
  episodes(data: { events: Viewing[] }): Promise<void>;
  preferences(data: Preferences): Promise<void>;
  credentials(data: { value: string }): Promise<void>;
  transfer(data: {
    action: 'export-json' | 'export-csv' | 'import' | 'backup' | 'restore';
  }): Promise<string>;
  external(data: { url: string }): Promise<void>;
}
