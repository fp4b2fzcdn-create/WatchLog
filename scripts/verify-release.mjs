import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';
import { normalize } from 'node:path';
const require = createRequire(import.meta.url),
  asar = require('@electron/asar');
const archive = 'release/win-unpacked/resources/app.asar';
const extract = (path) => asar.extractFile(archive, normalize(path));
const main = extract('dist-electron/electron/main.js').toString();
assert.ok(main.includes('sandbox: true'));
assert.ok(main.includes('contextIsolation: true'));
assert.ok(main.includes('nodeIntegration: false'));
assert.ok(!main.includes('remote-debugging-port'));
assert.ok(!main.includes('const qa='));
assert.ok(extract('dist/watchlog.svg').toString().includes('filmstrip W'));
assert.ok(extract('dist/tmdb.svg').length > 0);
assert.ok(extract('build/icon.png').length > 0);
const icon = await readFile('build/icon.ico'),
  exe = await readFile('release/win-unpacked/WatchLog.exe');
assert.ok(
  exe.includes(icon.subarray(22)),
  'Packaged executable must contain the original WatchLog icon.',
);
const installer = 'WatchLog Setup 0.1.0.exe',
  data = await readFile('release/' + installer);
await writeFile(
  'release/SHA256SUMS.txt',
  createHash('sha256').update(data).digest('hex') + '  ' + installer + '\n',
);
console.log(
  'PASS: packaged executable contains the original WatchLog icon; release archive includes branding, attribution and renderer isolation, with no QA debugging port. Installer SHA-256 saved.',
);
