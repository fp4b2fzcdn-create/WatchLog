import './build.mjs';
import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['--test', 'tests/store.test.cjs', 'tests/provider.test.cjs'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
