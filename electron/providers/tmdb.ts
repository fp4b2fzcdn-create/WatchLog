import { z } from 'zod';
import {
  titleSchema,
  type Title,
  type Discover,
  type SearchResults,
  type Season,
} from '../../shared/model';

const itemSchema = z.object({
  id: z.number().int().positive(),
  media_type: z.string().optional(),
  title: z.string().optional(),
  name: z.string().optional(),
  original_title: z.string().optional(),
  original_name: z.string().optional(),
  release_date: z.string().nullish(),
  first_air_date: z.string().nullish(),
  overview: z.string().nullish(),
  poster_path: z.string().nullish(),
  backdrop_path: z.string().nullish(),
  original_language: z.string().optional(),
  vote_average: z.number().optional(),
  vote_count: z.number().optional(),
  genre_ids: z.array(z.number()).optional(),
  genres: z.array(z.object({ id: z.number(), name: z.string() })).optional(),
  origin_country: z.array(z.string()).optional(),
  production_countries: z.array(z.object({ iso_3166_1: z.string() })).optional(),
  runtime: z.number().nullish(),
  episode_run_time: z.array(z.number()).optional(),
  number_of_episodes: z.number().optional(),
  seasons: z
    .array(z.object({ season_number: z.number(), name: z.string(), episode_count: z.number() }))
    .optional(),
  external_ids: z.object({ imdb_id: z.string().nullish() }).optional(),
  credits: z
    .object({
      cast: z.array(z.object({ name: z.string() })).optional(),
      crew: z.array(z.object({ name: z.string(), job: z.string() })).optional(),
    })
    .optional(),
  created_by: z.array(z.object({ name: z.string() })).optional(),
  alternative_titles: z
    .object({
      titles: z.array(z.object({ title: z.string() })).optional(),
      results: z.array(z.object({ title: z.string() })).optional(),
    })
    .optional(),
});
export interface MetadataProvider {
  discover(input: Discover): Promise<SearchResults>;
  details(id: number, type: 'movie' | 'tv', language: string): Promise<Title>;
  season(title: Title, number: number, language: string): Promise<Season>;
}
export class TMDB implements MetadataProvider {
  constructor(
    private credential: () => Promise<string>,
    private request: typeof fetch = fetch,
  ) {}
  async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const secret = await this.credential();
    if (!secret)
      throw new Error(
        'Connect TMDB in Settings to search and discover titles. Your saved library works offline.',
      );
    const url = new URL('https://api.themoviedb.org/3/' + path);
    for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (/^[a-f0-9]{32}$/i.test(secret)) url.searchParams.set('api_key', secret);
    else headers.Authorization = 'Bearer ' + secret;
    let response: Response;
    try {
      response = await this.request(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch {
      throw new Error(
        'TMDB could not be reached. Check your connection and try again. Saved records remain available.',
      );
    }
    if (!response.ok)
      throw new Error(
        response.status === 401
          ? 'TMDB rejected this credential. Replace it in Settings.'
          : response.status === 429
            ? 'TMDB is receiving too many requests. Try again shortly.'
            : `TMDB request failed (${response.status}). Try again later.`,
      );
    const body = await response.text();
    if (body.length > 10000000) throw new Error('TMDB response was unexpectedly large.');
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('TMDB returned an invalid response.');
    }
  }
  normalize(input: unknown, type: 'movie' | 'tv'): Title {
    const x = itemSchema.parse(input);
    return titleSchema.parse({
      id: `tmdb-${type}-${x.id}`,
      tmdbId: x.id,
      type,
      title: x.title || x.name || 'Untitled',
      originalTitle: x.original_title || x.original_name || '',
      releaseDate: x.release_date || x.first_air_date || '',
      overview: x.overview || '',
      poster: x.poster_path || '',
      backdrop: x.backdrop_path || '',
      language: x.original_language || '',
      genres: x.genres?.map((g) => g.name) || [],
      countries: x.production_countries?.map((c) => c.iso_3166_1) || x.origin_country || [],
      runtime: x.runtime || x.episode_run_time?.[0] || 0,
      tmdbRating: x.vote_average || 0,
      votes: x.vote_count || 0,
      totalEpisodes: x.number_of_episodes || 0,
      seasons:
        x.seasons?.map((s) => ({
          number: s.season_number,
          name: s.name,
          count: s.episode_count,
        })) || [],
      imdbId: x.external_ids?.imdb_id || '',
      cast: x.credits?.cast?.slice(0, 20).map((c) => c.name) || [],
      creators: [
        ...(x.created_by?.map((c) => c.name) || []),
        ...(x.credits?.crew?.filter((c) => c.job === 'Director').map((c) => c.name) || []),
      ],
      aliases: (x.alternative_titles?.titles || x.alternative_titles?.results || []).map(
        (t) => t.title,
      ),
    });
  }
  async discover(input: Discover): Promise<SearchResults> {
    let path: string;
    const p: Record<string, string> = {
      language: input.language,
      page: String(input.page),
      include_adult: 'false',
    };
    if (input.query.trim()) {
      path = `search/${input.type}`;
      p.query = input.query.trim();
    } else if (input.mode === 'recommendations' || input.mode === 'similar') {
      if (!input.seed)
        throw new Error('Rate and save a TMDB title first, or choose Similar from a title.');
      path = `${input.type}/${input.seed}/${input.mode}`;
    } else if (
      input.mode === 'discover' ||
      input.mode === 'upcoming' ||
      input.genre ||
      input.country ||
      input.originalLanguage ||
      input.yearFrom ||
      input.yearTo ||
      input.minimumRating
    ) {
      path = `discover/${input.type}`;
      p.sort_by = input.sort;
      p.with_genres = input.genre;
      p.with_origin_country = input.country;
      p.with_original_language = input.originalLanguage;
      p['vote_average.gte'] = String(input.minimumRating);
      if (input.minimumRating) p['vote_count.gte'] = '50';
      const prefix = input.type === 'movie' ? 'primary_release_date' : 'first_air_date';
      if (input.yearFrom) p[prefix + '.gte'] = input.yearFrom + '-01-01';
      if (input.yearTo) p[prefix + '.lte'] = input.yearTo + '-12-31';
      if (input.mode === 'upcoming') {
        p[prefix + '.gte'] = new Date().toISOString().slice(0, 10);
        p.sort_by = prefix + '.asc';
      }
    } else
      path =
        input.mode === 'trending' ? `trending/${input.type}/week` : `${input.type}/${input.mode}`;
    const result = z
      .object({ results: z.array(itemSchema).max(100), page: z.number(), total_pages: z.number() })
      .parse(await this.get(path, p));
    return {
      titles: result.results.map((x) => this.normalize(x, input.type)),
      page: result.page,
      pages: Math.min(result.total_pages, 500),
    };
  }
  async details(id: number, type: 'movie' | 'tv', language: string) {
    return this.normalize(
      await this.get(`${type}/${id}`, {
        language,
        append_to_response: 'external_ids,credits,alternative_titles',
      }),
      type,
    );
  }
  async season(title: Title, number: number, language: string): Promise<Season> {
    if (!title.tmdbId)
      throw new Error(
        'Episode metadata requires a TMDB-linked series. You can still log entire seasons manually.',
      );
    const data = z
      .object({
        episodes: z
          .array(
            z.object({
              episode_number: z.number().int().positive(),
              name: z.string(),
              air_date: z.string().nullish(),
              overview: z.string().nullish(),
            }),
          )
          .max(1000),
      })
      .parse(await this.get(`tv/${title.tmdbId}/season/${number}`, { language }));
    return {
      titleId: title.id,
      number,
      episodes: data.episodes.map((e) => ({
        number: e.episode_number,
        name: e.name,
        airDate: e.air_date || '',
        overview: e.overview || '',
      })),
    };
  }
}
