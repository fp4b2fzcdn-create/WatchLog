const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TMDB } = require('../dist-electron/electron/providers/tmdb.js');
const { discoverSchema } = require('../dist-electron/shared/model.js');
const input = (extra = {}) => discoverSchema.parse({ language: 'zh-TW', ...extra });
test('TMDB bearer token stays in the request header, and Unicode queries are encoded', async () => {
  let seen;
  const p = new TMDB(
    async () => 'private.token',
    async (url, options) => {
      seen = { url: new URL(url), options };
      return new Response(
        JSON.stringify({
          results: [{ id: 1, title: '花樣年華', release_date: '2000-09-29' }],
          page: 1,
          total_pages: 1,
        }),
      );
    },
  );
  const r = await p.discover(input({ query: '花樣年華' }));
  assert.equal(seen.options.headers.Authorization, 'Bearer private.token');
  assert.equal(seen.url.searchParams.get('query'), '花樣年華');
  assert.equal(seen.url.href.includes('private.token'), false);
  assert.equal(r.titles[0].title, '花樣年華');
  assert.equal(r.titles[0].tmdbRating, 0);
});
test('supports v3 key authentication and correct TV discover dates', async () => {
  let seen;
  const p = new TMDB(
    async () => 'a'.repeat(32),
    async (url) => {
      seen = new URL(url);
      return new Response(JSON.stringify({ results: [], page: 1, total_pages: 0 }));
    },
  );
  await p.discover(
    input({ type: 'tv', mode: 'discover', yearFrom: '2000', yearTo: '2005', country: 'HK' }),
  );
  assert.equal(seen.searchParams.get('api_key'), 'a'.repeat(32));
  assert.equal(seen.searchParams.get('first_air_date.gte'), '2000-01-01');
  assert.equal(seen.searchParams.get('with_origin_country'), 'HK');
});
test('does not make network requests without a credential', async () => {
  const p = new TMDB(
    async () => '',
    () => {
      throw new Error('should never run');
    },
  );
  await assert.rejects(p.discover(input()), /Connect TMDB/);
});
test('reports authentication and rate limit errors without leaking credentials', async () => {
  for (const code of [401, 429]) {
    const p = new TMDB(
      async () => 'secret.token',
      async () => new Response('', { status: code }),
    );
    await assert.rejects(
      p.discover(input()),
      (e) => !e.message.includes('secret.token') && /credential|too many/.test(e.message),
    );
  }
});
test('rejects malformed remote metadata', async () => {
  const p = new TMDB(
    async () => 'x',
    async () => new Response(JSON.stringify({ results: [{ id: 'bad' }], page: 1, total_pages: 1 })),
  );
  await assert.rejects(p.discover(input()));
});
