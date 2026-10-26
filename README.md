# WatchLog
A personal desktop application for tracking and discovering movies and TV series.

WatchLog is a standalone Electron application with a private SQLite library, a React/TypeScript interface, and optional TMDB discovery. Your collection works without an account or a backend server.

## Install on Windows

Run **WatchLog Setup 0.1.0.exe** from the supplied build, choose an installation folder, and open WatchLog from the Start menu or desktop shortcut. This initial build is unsigned; signing requires a separate developer certificate. The installer was generated on Windows. Installation and uninstallation have not yet been exercised end to end.

You do not need Node.js, Git, or a development environment to use the packaged application.

1. Use **Add movie or TV → Add manually** to start a collection immediately.
2. For online metadata, open **Settings → Metadata connection**, paste your own TMDB API Read Access Token or v3 API key, and select **Connect TMDB**. The application validates it before saving. Replace it through the same control when rotating credentials.
3. Use **Log viewing** for each viewing, including rewatches. Release dates and viewing dates are separate. Viewing dates can be a day, month, year, approximate, or unknown.
4. For TV, open a saved series and select **Episodes**. Load a season, choose a viewing date, and mark individual episodes, a selection, or the whole season. Use **Log viewing** to log a whole series or season without entering every episode.
5. Back up regularly with **Settings → Your data → Back up**.

## Included in 0.1

- Library with poster grid, compact table, local search, sorting, status, genre, country, release year, and personal-rating filters.
- Manual and TMDB title entry, editable metadata, original and alternate names, IMDb identifiers and safe external links.
- Separate title preferences and individual viewing events, per-viewing notes and ratings, platforms, and rewatches.
- TMDB multilingual search and detail retrieval, trending/popular/highly rated/upcoming catalogues, country/language/year/genre/score filters, pagination, similar titles, and real TMDB recommendations seeded by a highly rated title.
- Watchlist priorities and notes. Starting a viewing archives the original watchlist entry and preserves its notes in the title's Overview.
- Cached season and episode metadata, batch viewing records, episode rewatches, and progress across unique episodes.
- Statistics for unique movies/series, episode viewing events, monthly/yearly activity, genres, countries, languages, release years, ratings, rewatches, and current progress.
- Light, dark, and system appearance; localized/original title preference; metadata-language and date-display preferences.
- Validated JSON/CSV export and re-import, consistent SQLite backups, validated restore with a confirmation and an automatic safety backup.
- Original vector WatchLog filmstrip-W logo, generated desktop icons, and Windows NSIS/macOS DMG packaging configuration.

**Keyboard shortcuts:** Ctrl/Cmd+K focuses global search. Ctrl/Cmd+N opens Add. Enter submits a search or form. Escape dismisses a dialog. Dialogs use native modal focus containment.

## Data and privacy

The application stores `watchlog.sqlite`, its SQLite journal files, encrypted `tmdb.enc`, poster cache, and safety backups in Electron's operating-system `userData` folder. The exact database path is shown in Settings. Normally this is `%APPDATA%\WatchLog` on Windows and `~/Library/Application Support/WatchLog` on macOS.

Application updates and uninstall/reinstall should preserve this separate data directory. Do not delete that directory unless you intend to remove your library. The database contains private viewing history and is not itself encrypted. Protect your operating-system account and backup files accordingly.

TMDB credentials use Electron's asynchronous `safeStorage` API, backed by OS cryptography. There is no plaintext fallback. On Windows, encryption does not protect a token from other software acting as your logged-in user. On macOS, stable signing is important for consistent Keychain access. Credentials are never sent to the renderer and are not included in exports, backups, or Git.

Only title searches, selected metadata/recommendation requests, and poster requests go to TMDB. Viewing dates, personal notes, personal ratings, and the database are not uploaded. Recommendations send the selected TMDB title ID, not your complete history. Viewed posters are cached for offline use; posters not yet downloaded display a title placeholder when offline. Poster cache files and credentials are not part of SQLite backups.

JSON exports contain the complete data model and preferences. CSV exports contain a row per record with readable columns plus a complete JSON field, so CSV re-import is lossless. Re-import reads the JSON field: use the application to edit records rather than editing readable CSV columns. Formula-like readable cells are escaped for spreadsheet safety. Imports merge new records and preserve existing records and current preferences. Re-importing the same export is idempotent. Restore replaces the library and preferences only after validation and confirmation. A safety backup is saved before either operation. Keep the original source file as well.

## Development

Use Node.js **24 LTS**, npm, and Git on Windows or macOS. SQLite is provided by Electron/Node's built-in `node:sqlite`; no native SQLite module compilation or database server is required.

```sh
git clone https://github.com/fp4b2fzcdn-create/WatchLog.git
cd WatchLog
git checkout feat/watchlog-desktop
npm ci
npm run dev
```

```sh
npm run build          # type-check, generate icons, build renderer and desktop code
npm test               # database, validation, import/export and provider tests
npm run test:desktop   # actual Electron workflow with an isolated temporary library
npm start             # open the built desktop application
npm run package:win    # Windows NSIS installer in release/
npm run package:mac    # macOS DMG, run on a Mac
```

`npm run dev` starts Vite on loopback only and launches Electron. The packaged application loads local files and needs no development server. Windows and macOS CI runs build, tests, desktop checks, and an unpacked package build; a configured workflow is not evidence that its remote run has passed.

Build macOS distributions on macOS for the desired architecture. Public distribution requires your Apple Developer signing identity and notarization credentials configured through electron-builder's environment settings. Windows signing likewise requires a certificate. None of these credentials belong in this repository.

### Source layout

| Folder | Purpose |
| --- | --- |
| `electron/` | Secure main process, SQLite store, migrations, OS dialogs, credential handling and poster cache |
| `electron/providers/` | Metadata-provider contract and TMDB implementation |
| `shared/` | Typed data model, IPC schemas and validation |
| `src/` | React views and consistent light/dark styles |
| `public/` | Original vector WatchLog logo and approved TMDB attribution logo |
| `scripts/` | Build, development, icon generation and test runners |
| `tests/` | Real SQLite tests, deterministic TMDB response fixtures and desktop workflow tests |

The renderer has no Node integration, uses context isolation and sandboxing, and receives only a narrow validated bridge. IPC accepts messages only from the main application frame. Permissions and untrusted navigation are denied. API calls are main-process-only; external links are restricted to HTTPS IMDb and TMDB. React escapes text. A restrictive Content Security Policy controls scripts, images, connections, frames and forms.

Schema version 1 creates relational title/identifier, tracking entry, viewing event, watchlist, season-cache, and preference tables. Foreign keys cascade explicit title deletion. Write groups and imports use transactions. Newer unsupported database versions are rejected without replacing the database. Add migrations rather than rebuilding user databases.

### Testing status and first-release limitations

- Windows build and NSIS installer generation succeeded locally. The packaged application was launched through the Windows desktop, and its actual interface was inspected.
- The full desktop regression passed on both Windows and macOS in [GitHub Actions run 40421304878](https://github.com/fp4b2fzcdn-create/WatchLog/actions/runs/40421304878), including manual title entry, historical viewing dates, multiple viewings, grid/list display, statistics, dark mode, restart persistence, renderer isolation, invalid IPC arguments, and discovery without a credential. Both runners also passed production build, all 20 database/provider tests, and an unpacked application build.
- The restricted Codex shell's Windows account cannot start Electron's sandboxed GPU/renderer children reliably. Normal desktop launch works. A separate `scripts/prepare-desktop-qa.mjs` creates an isolated native QA copy with a local debugging port; this modification is confined to `work/`, never the release build. Use only for local testing, close it when finished, and never distribute the QA copy. Desktop tests support `WATCHLOG_TEST_CDP` to connect to it and `WATCHLOG_TEST_RESTART_ONLY` for the restart check. The normal test command needs neither variable.
- 20 database/provider tests passed locally. These cover persistence, migrations, duplicate IDs, partial/invalid dates, watchlist preservation, rollback, CSV/JSON round-trips, merge idempotence, restore validation, SQLite backup, cached episodes, deletion, authentication headers and malformed remote responses. Production dependency audit reported zero known vulnerabilities at the time of the build.
- Live TMDB search, credential storage/rotation, recommendations, and image retrieval require your credential and have not been end-to-end tested against your TMDB account. Network/authentication behavior is tested using deterministic responses. No credential is bundled.
- macOS execution and unpacked packaging passed on GitHub's macOS runner. No physical Mac, signed/notarized DMG, or macOS installer workflow has been tested locally.
- Native export/import/restore dialogs and installer install/uninstall still need an end-to-end desktop pass. Their database and file-format logic has automated coverage.
- Metadata languages are supported; interface text is English. Discovery title search and discovery filters are separate TMDB operations, as explained in the interface. Filters are intended for catalogue browsing; recommendations and similar-title endpoints use TMDB's own results.
- IMDb IDs and links are supported. IMDb ratings and bulk official IMDb-dataset ingestion are not included. No IMDb scraping is performed.
- Posters are cached when displayed, not pre-downloaded in bulk. Ongoing-series metadata and episodes refresh on demand rather than through background monitoring.
- This first release does not include automatic application updates, a signed installer, or database-location relocation. The current data path is displayed in Settings.

## Attribution and technical references

This product uses the TMDB API but is not endorsed or certified by TMDB. Metadata and images belong to their respective owners. The included TMDB logo is an approved attribution asset from TMDB's logos page. WatchLog's own filmstrip-W logo is original project artwork.

- [TMDB authentication](https://developer.themoviedb.org/docs/authentication-application)
- [TMDB attribution requirements](https://developer.themoviedb.org/docs/faq)
- [TMDB approved logos](https://www.themoviedb.org/about/logos-attribution)
- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron OS credential protection](https://www.electronjs.org/docs/latest/api/safe-storage)
