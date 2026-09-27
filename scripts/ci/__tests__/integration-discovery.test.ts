import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';
import { gitEnv } from '../resolve-report-base.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

function discoveryScript(event: string): string {
  const path = join(repoRoot, '.github/workflows/_discover-units.yml');
  const workflow = parseYaml(readFileSync(path, 'utf8'), path);
  if (!isMapping(workflow) || !isMapping(workflow.jobs) || !isMapping(workflow.jobs.list)) {
    throw new Error('Missing discovery job');
  }
  const steps: unknown = workflow.jobs.list.steps;
  if (!Array.isArray(steps)) throw new Error('Missing steps');
  const step: unknown = steps.find((value: unknown) => isMapping(value) && value.id === 'scan');
  if (!isMapping(step) || typeof step.run !== 'string') throw new Error('Missing scan script');
  return step.run
    .replaceAll('${{ github.event_name }}', event)
    .replaceAll('${{ github.event.before }}', '')
    .replaceAll("${{ github.base_ref || 'main' }}", 'main');
}

describe('integration and promotion discovery', () => {
  it.each(['pull_request', 'merge_group'])(
    'runs the actual discovery shell for %s',
    (event) => {
      const scratch = join(repoRoot, 'tmp');
      mkdirSync(scratch, { recursive: true });
      const cwd = mkdtempSync(join(scratch, 'integration-discovery-'));
      const output = join(cwd, 'output');
      const env = { ...gitEnv(), GITHUB_OUTPUT: output };
      const git = (...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });
      try {
        git('init', '-b', 'main');
        git('config', 'user.name', 'Test');
        git('config', 'user.email', 'test@example.test');
        for (const unit of ['one', 'two']) {
          mkdirSync(join(cwd, 'pillars', unit), { recursive: true });
          writeFileSync(
            join(cwd, 'pillars', unit, 'package.json'),
            JSON.stringify({ name: `@pops/${unit}` })
          );
        }
        mkdirSync(join(cwd, 'clients/ios'), { recursive: true });
        writeFileSync(join(cwd, 'clients/ios/README.md'), 'client');
        git('add', '.');
        git('commit', '-m', 'test: create units');
        git('update-ref', 'refs/remotes/origin/main', 'HEAD');
        writeFileSync(join(cwd, 'pillars/one/source.ts'), 'export const value = 1;');
        git('add', '.');
        git('commit', '-m', 'test: change one unit');
        execFileSync('bash', ['-c', discoveryScript(event)], {
          cwd,
          env,
          stdio: 'pipe',
          timeout: 20_000,
        });
        const lines = readFileSync(output, 'utf8').split('\n');
        const changed = lines.find((line) => line.startsWith('changed='));
        expect(changed).toContain('@pops/one');
        if (event === 'merge_group') {
          expect(changed).toContain('@pops/two');
          expect(lines).toContain('changedClientDirs=clients/ios ');
        } else {
          expect(changed).not.toContain('@pops/two');
          expect(lines).toContain('changedClientDirs=');
        }
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    60_000
  );
});
