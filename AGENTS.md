# WatchLog development

- Preserve user data and existing Git history. Never commit credentials, databases, exports or real viewing history.
- Personal data belongs in Electron's userData directory. Tests must use temporary directories.
- Keep Node, SQLite, secrets, networking and file dialogs in the main process. Validate every IPC argument. Do not expose generic IPC, filesystem or shell capabilities.
- Use explicit migrations, transactions and validated imports. Back up before restoring. Distinguish title counts from viewing events.
- Keep TMDB and personal ratings separate; never label TMDB ratings as IMDb ratings. Do not scrape IMDb.
- Run npm run build, npm test and npm run test:desktop for substantive changes. Desktop tests run the actual Electron application with isolated data.
- Package Windows with npm run package:win. Build and sign macOS releases on macOS; never claim unperformed platform tests.
