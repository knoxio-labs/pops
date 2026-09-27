import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const cwd = process.cwd();
for (const args of [['trust', join(cwd, 'mise.toml')]]) {
  const child = spawnSync('mise', args, { cwd, stdio: 'inherit' });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd, stdio: 'inherit' });
if (install.status !== 0) process.exit(install.status ?? 1);
const configs = execFileSync('git', ['ls-files', '-z', '*mise.toml'], { cwd, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
for (const config of configs) {
  const child = spawnSync('mise', ['trust', join(cwd, config)], { cwd, stdio: 'inherit' });
  if (child.status !== 0) process.exit(child.status ?? 1);
}
