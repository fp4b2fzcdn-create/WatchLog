import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session, Menu } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { z, ZodError } from 'zod';
import { Store, toCSV, fromCSV } from './store';
import { TMDB } from './providers/tmdb';
import { registerPosterScheme, cachePosters } from './posters';
import { idSchema, saveSchema, discoverSchema, prefsSchema, eventSchema } from '../shared/model';

app.setName('WatchLog');
registerPosterScheme();
// This utility does not need GPU rendering. Software rendering also avoids
// driver and remote-desktop GPU startup failures on Windows.
app.disableHardwareAcceleration();
if (process.env.WATCHLOG_TEST_DATA) app.setPath('userData', process.env.WATCHLOG_TEST_DATA);
let store: Store;
let win: BrowserWindow | null = null;
const dataPath = () => app.getPath('userData');
const secretPath = () => join(dataPath(), 'tmdb.enc');
async function credential() {
  let buffer: Buffer;
  try {
    buffer = await readFile(secretPath());
  } catch (e: any) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
  try {
    const value = await safeStorage.decryptStringAsync(buffer);
    if (value.shouldReEncrypt) await saveCredential(value.result);
    return value.result;
  } catch {
    throw new Error('Your saved TMDB credential could not be unlocked. Replace it in Settings.');
  }
}
async function saveCredential(value: string) {
  if (!(await safeStorage.isAsyncEncryptionAvailable()))
    throw new Error('Operating-system credential protection is unavailable. Nothing was saved.');
  const encrypted = await safeStorage.encryptStringAsync(value);
  await writeFile(secretPath() + '.tmp', encrypted, { mode: 0o600 });
  await rename(secretPath() + '.tmp', secretPath());
}
const provider = new TMDB(credential);
const trusted = (event: Electron.IpcMainInvokeEvent) => {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Untrusted application frame.');
};
function handle<T>(name: string, schema: z.ZodType<T>, action: (data: T) => unknown) {
  ipcMain.handle('watchlog:' + name, async (event, arg) => {
    try {
      trusted(event);
      return { ok: true, value: await action(schema.parse(arg)) };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof ZodError
            ? e.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .slice(0, 4)
                .join('\n')
            : e instanceof Error
              ? e.message
              : 'The operation could not be completed.',
      };
    }
  });
}
async function automaticBackup() {
  const folder = join(dataPath(), 'backups');
  await mkdir(folder, { recursive: true });
  const path = join(folder, `before-change-${Date.now()}.sqlite`);
  store.backup(path);
  return path;
}
async function transfer(action: string) {
  if (!win) throw new Error('Application window unavailable.');
  if (action === 'import' || action === 'restore') {
    const result = await dialog.showOpenDialog(win, {
      title: action === 'restore' ? 'Restore a WatchLog backup' : 'Import a WatchLog export',
      properties: ['openFile'],
      filters: [
        { name: 'WatchLog data', extensions: action === 'restore' ? ['sqlite'] : ['json', 'csv'] },
      ],
    });
    if (result.canceled) return 'Cancelled';
    const path = result.filePaths[0];
    if ((await stat(path)).size > 100 * 1024 * 1024)
      throw new Error('This file is too large (maximum 100 MB).');
    let snapshot: unknown;
    if (action === 'restore') {
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        if ((db.prepare('PRAGMA integrity_check').get() as any).integrity_check !== 'ok')
          throw new Error('Backup failed SQLite integrity validation.');
        if ((db.prepare('PRAGMA user_version').get() as any).user_version !== 1)
          throw new Error('Unsupported backup version.');
        const rows = (table: string) =>
          db
            .prepare(`SELECT ${table === 'titles' ? 'metadata' : 'data'} AS data FROM ${table}`)
            .all()
            .map((r: any) => JSON.parse(r.data));
        const prefs = db.prepare("SELECT data FROM preferences WHERE key='app'").get() as any;
        snapshot = {
          format: 'watchlog',
          version: 1,
          titles: rows('titles'),
          entries: rows('entries'),
          events: rows('events'),
          watchlist: rows('watchlist'),
          seasons: rows('seasons'),
          preferences: prefs ? JSON.parse(prefs.data) : {},
        };
      } finally {
        db.close();
      }
    } else {
      const content = await readFile(path, 'utf8');
      snapshot = path.toLowerCase().endsWith('.csv') ? fromCSV(content) : JSON.parse(content);
    }
    store.validateSnapshot(snapshot);
    if (action === 'restore') {
      const answer = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cancel', 'Restore backup'],
        defaultId: 0,
        cancelId: 0,
        message: 'Replace your current library with this backup?',
        detail:
          'A safety copy of your current database will be saved first. TMDB credentials are kept separately.',
      });
      if (answer.response !== 1) return 'Cancelled';
    }
    const backup = await automaticBackup();
    if (action === 'restore') store.replace(snapshot);
    else store.merge(snapshot);
    return `${action === 'restore' ? 'Restored' : 'Imported'} successfully. Safety backup: ${backup}`;
  }
  const backup = action === 'backup',
    csv = action === 'export-csv';
  const extension = backup ? 'sqlite' : csv ? 'csv' : 'json';
  const result = await dialog.showSaveDialog(win, {
    title: backup ? 'Back up database' : 'Export library',
    defaultPath: `WatchLog-${new Date().toISOString().slice(0, 10)}.${extension}`,
    filters: [{ name: 'WatchLog data', extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return 'Cancelled';
  if (backup) {
    // VACUUM writes to a new file; never overwrite an existing backup in place.
    const temp = result.filePath + `.${Date.now()}.tmp`;
    store.backup(temp);
    await rename(temp, result.filePath);
  } else {
    const data = store.snapshot();
    await writeFile(result.filePath, csv ? toCSV(data) : JSON.stringify(data, null, 2), 'utf8');
  }
  return `Saved to ${result.filePath}`;
}
function register() {
  handle('state', z.undefined(), async () => ({
    ...store.snapshot(),
    configured: await stat(secretPath()).then(
      () => true,
      () => false,
    ),
    dataPath: dataPath(),
    versionName: app.getVersion(),
  }));
  handle('save', saveSchema, (data) => store.save(data));
  handle('remove', z.object({ kind: z.enum(['title', 'event', 'watch']), id: idSchema }), (data) =>
    store.remove(data.kind, data.id),
  );
  handle('discover', discoverSchema, (data) => provider.discover(data));
  handle(
    'details',
    z.object({
      id: z.number().int().positive(),
      type: z.enum(['movie', 'tv']),
      language: prefsSchema.shape.language,
    }),
    (data) => provider.details(data.id, data.type, data.language),
  );
  handle(
    'season',
    z.object({
      titleId: idSchema,
      number: z.number().int().min(0).max(10000),
      refresh: z.boolean(),
    }),
    async (data) => {
      const cached = store.cachedSeason(data.titleId, data.number);
      if (cached && !data.refresh) return cached;
      const season = await provider.season(
        store.title(data.titleId),
        data.number,
        store.preferences().language,
      );
      store.cacheSeason(season);
      return season;
    },
  );
  handle('episodes', z.object({ events: z.array(eventSchema).min(1).max(1000) }), (data) =>
    store.episodes(data.events),
  );
  handle('preferences', prefsSchema, (data) => store.setPreferences(data));
  handle(
    'credentials',
    z.object({
      value: z
        .string()
        .trim()
        .min(20)
        .max(4096)
        .regex(/^[A-Za-z0-9._-]+$/),
    }),
    async (data) => {
      await new TMDB(async () => data.value).get('configuration');
      await saveCredential(data.value);
    },
  );
  handle(
    'transfer',
    z.object({ action: z.enum(['export-json', 'export-csv', 'import', 'backup', 'restore']) }),
    (data) => transfer(data.action),
  );
  handle('external', z.object({ url: z.string().url().max(1000) }), async (data) => {
    const url = new URL(data.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !['www.imdb.com', 'www.themoviedb.org'].includes(url.hostname)
    )
      throw new Error('This external link is not permitted.');
    await shell.openExternal(url.href);
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 880,
    minHeight: 640,
    title: 'WatchLog',
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#f7f7f5',
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => {
    win = null;
  });
  if (process.env.WATCHLOG_DEV_URL && !app.isPackaged) {
    if (process.env.WATCHLOG_DEV_URL !== 'http://127.0.0.1:5173')
      throw new Error('Unsupported development URL.');
    void win.loadURL(process.env.WATCHLOG_DEV_URL);
  } else void win.loadFile(join(__dirname, '../../dist/index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      await mkdir(dataPath(), { recursive: true });
      store = new Store(join(dataPath(), 'watchlog.sqlite'));
      await cachePosters(dataPath());
      session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        callback({
          cancel: !(
            ['file:', 'devtools:', 'data:', 'watchlog-poster:'].includes(url.protocol) ||
            (url.protocol === 'https:' && url.hostname === 'image.tmdb.org') ||
            (!app.isPackaged &&
              ['http:', 'ws:'].includes(url.protocol) &&
              url.host === '127.0.0.1:5173')
          ),
        });
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: 'WatchLog',
            submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }],
          },
          {
            label: 'Edit',
            submenu: [
              { role: 'undo' },
              { role: 'redo' },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          {
            label: 'View',
            submenu: [
              { role: 'resetZoom' },
              { role: 'zoomIn' },
              { role: 'zoomOut' },
              { role: 'togglefullscreen' },
            ],
          },
        ]),
      );
      register();
      createWindow();
      app.on('activate', () => {
        if (!win) createWindow();
      });
    })
    .catch((e) => {
      dialog.showErrorBox('WatchLog could not start', e.message);
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('will-quit', () => store?.close());
}
