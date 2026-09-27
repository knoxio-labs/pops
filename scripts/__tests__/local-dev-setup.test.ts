import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const setup = resolve('scripts/local-dev/setup.mjs');

describe('local setup', { timeout: 60_000 }, () => {
  it.each(['none', 'install', 'trust'])('orders setup and preserves %s failures', (failure) => {
    mkdirSync(resolve('tmp'), { recursive: true });
    const root = mkdtempSync(resolve('tmp/local-setup-'));
    const env = {
      ...process.env,
      GIT_DIR: undefined,
      GIT_WORK_TREE: undefined,
      GIT_INDEX_FILE: undefined,
      GIT_COMMON_DIR: undefined,
    };
    try {
      mkdirSync(join(root, 'bin'));
      mkdirSync(join(root, 'pillars/example'), { recursive: true });
      writeFileSync(join(root, 'mise.toml'), '');
      writeFileSync(join(root, 'pillars/example/mise.toml'), '');
      execFileSync('git', ['init', '-q'], { cwd: root, env });
      execFileSync('git', ['add', 'mise.toml', 'pillars/example/mise.toml'], { cwd: root, env });
      for (const command of ['mise', 'pnpm']) {
        const fail =
          (command === 'pnpm' && failure === 'install') ||
          (command === 'mise' && failure === 'trust');
        const script = join(root, 'bin', command);
        writeFileSync(
          script,
          `#!/bin/sh\nprintf '%s\\n' "${command} $*" >> calls\nexit ${fail ? 7 : 0}\n`
        );
        chmodSync(script, 0o755);
      }
      const result = spawnSync(process.execPath, [setup], {
        cwd: root,
        env: { ...env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        encoding: 'utf8',
      });
      const calls = readFileSync(join(root, 'calls'), 'utf8').trim().split('\n');
      expect(result.status).toBe(failure === 'none' ? 0 : 7);
      expect(calls[0]).toBe(`mise trust ${join(root, 'mise.toml')}`);
      if (failure === 'trust') expect(calls).toHaveLength(1);
      else {
        expect(calls[1]).toBe('pnpm install --frozen-lockfile');
        if (failure === 'install') expect(calls).toHaveLength(2);
        else
          expect(calls.slice(2)).toEqual([
            `mise trust ${join(root, 'mise.toml')}`,
            `mise trust ${join(root, 'pillars/example/mise.toml')}`,
          ]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
