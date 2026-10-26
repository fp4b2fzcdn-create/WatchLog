// Optional workaround for managed Windows runners that cannot spawn Chromium
// child processes. Builds a separate QA copy; never changes the release build.
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const root = resolve('../../work/native-qa');
await mkdir(root, { recursive: true });
const source = join(root, 'source'),
  runtime = join(root, 'runtime'),
  data = join(root, 'data');
await mkdir(source, { recursive: true });
await mkdir(data, { recursive: true });
asar.extractAll(resolve('release/win-unpacked/resources/app.asar'), source);
const main = join(source, 'dist-electron/electron/main.js');
const text = await readFile(main, 'utf8');
await writeFile(
  main,
  `const qa=require('electron');qa.app.setPath('userData',${JSON.stringify(data)});qa.app.commandLine.appendSwitch('remote-debugging-port','9225');\n` +
    text,
);
await cp(resolve('release/win-unpacked'), runtime, { recursive: true });
await asar.createPackage(source, join(runtime, 'resources/app.asar'));
console.log('Native QA application:', join(runtime, 'WatchLog.exe'));
console.log('Isolated QA data:', data);
console.log(
  'After launching that application: set WATCHLOG_TEST_CDP=http://127.0.0.1:9225 and run npm run test:desktop.',
);
