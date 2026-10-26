import { protocol } from 'electron';
import { join } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
export function registerPosterScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'watchlog-poster',
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}
export async function cachePosters(dataPath: string) {
  const folder = join(dataPath, 'posters');
  await mkdir(folder, { recursive: true });
  protocol.handle('watchlog-poster', async (request) => {
    const url = new URL(request.url),
      filename = url.pathname.slice(1);
    if (url.host !== 'image' || !/^\w[\w.-]*\.(jpg|jpeg|png)$/i.test(filename))
      return new Response('Invalid poster', { status: 400 });
    const file = join(folder, filename);
    const headers = {
      'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000',
    };
    try {
      return new Response(new Uint8Array(await readFile(file)), { headers });
    } catch {
      /* Cache miss. */
    }
    try {
      const response = await fetch(`https://image.tmdb.org/t/p/w342/${filename}`, {
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
        return new Response('Poster unavailable', { status: 404 });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) return new Response('Poster too large', { status: 413 });
      await writeFile(file, bytes);
      return new Response(bytes, { headers });
    } catch {
      return new Response('Poster unavailable offline', { status: 503 });
    }
  });
}
