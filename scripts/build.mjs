import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.electron.json'],
  { stdio: 'inherit' },
);
mkdirSync('dist-electron', { recursive: true });
writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }));
