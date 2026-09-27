import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const hook = readFileSync(resolve('.husky/pre-push'), 'utf8');

describe('local validation push evidence', { timeout: 60_000 }, () => {
  it.each(['none', 'check', 'test:scripts'])(
    'refuses generated changes after validation: %s',
    (mutate) => {
      mkdirSync(resolve('tmp'), { recursive: true });
      const root = mkdtempSync(resolve('tmp/local-push-'));
      const env = {
        ...process.env,
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_COMMON_DIR: undefined,
      };
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
      try {
        mkdirSync(join(root, 'scripts/ci'), { recursive: true });
        mkdirSync(join(root, 'bin'));
        mkdirSync(join(root, 'node_modules'));
        writeFileSync(join(root, 'hook'), hook);
        writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
        writeFileSync(join(root, 'source.txt'), 'original');
        writeFileSync(join(root, 'scripts/pre-push-scope.mjs'), 'console.log("run\\nrun");');
        writeFileSync(join(root, 'scripts/pre-push-check-refs.mjs'), 'process.exit(0);');
        writeFileSync(join(root, 'scripts/ci/check-commit-attribution.mjs'), 'process.exit(0);');
        writeFileSync(join(root, 'bin/pnpm'), '#!/bin/sh\nexit 0\n');
        writeFileSync(
          join(root, 'bin/mise'),
          `#!/bin/sh\ncase "$PATH" in node_modules/.bin:*|*git-core:*) exit 9 ;; esac\n[ -z "$GIT_EXEC_PATH" ] || exit 9\n${mutate === 'none' ? 'true' : `if [ "$2" = "${mutate}" ]; then printf changed > source.txt; fi`}\n`
        );
        chmodSync(join(root, 'bin/pnpm'), 0o755);
        chmodSync(join(root, 'bin/mise'), 0o755);
        git('init', '-q');
        git('config', 'user.email', 'fixture@example.invalid');
        git('config', 'user.name', 'Fixture');
        git('add', '.');
        git('commit', '-qm', 'test: fixture');
        const result = spawnSync('sh', ['-e', 'hook'], {
          cwd: root,
          env: {
            ...env,
            GIT_EXEC_PATH: join(root, 'git-core'),
            PATH: `node_modules/.bin:${join(root, 'git-core')}:${join(root, 'bin')}:${process.env.PATH}`,
          },
          encoding: 'utf8',
          input: '',
        });
        expect(result.status).toBe(mutate === 'none' ? 0 : 1);
        if (mutate !== 'none')
          expect(result.stderr).toContain('validation generated changes outside HEAD');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
