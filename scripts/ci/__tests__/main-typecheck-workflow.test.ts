import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowPath = join(repoRoot, '.github', 'workflows', 'main-typecheck.yml');

function requiredMapping(value: unknown, name: string): Record<string, unknown> {
  if (!isMapping(value)) throw new Error(`${name} must be a mapping`);
  return value;
}

function workflow(): Record<string, unknown> {
  return requiredMapping(parseYaml(readFileSync(workflowPath, 'utf8'), workflowPath), 'workflow');
}

describe('main-typecheck workflow', () => {
  it('runs for every push to main without a path filter', () => {
    const triggers = requiredMapping(workflow().on, 'on');
    const push = requiredMapping(triggers.push, 'on.push');

    expect(Object.keys(triggers)).toEqual(['push']);
    expect(push.branches).toEqual(['main']);
    expect(push.paths).toBeUndefined();
    expect(push['paths-ignore']).toBeUndefined();
  });

  it('runs the full workspace typecheck and reports failures', () => {
    const jobs = requiredMapping(workflow().jobs, 'jobs');
    const job = requiredMapping(jobs.typecheck, 'jobs.typecheck');
    if (!Array.isArray(job.steps)) throw new Error('jobs.typecheck.steps must be an array');

    const steps: Record<string, unknown>[] = job.steps.map((step, index) =>
      requiredMapping(step, `jobs.typecheck.steps[${index}]`)
    );
    const setup = steps.find((step) => step.uses === './.github/actions/setup-mise');
    const install = steps.find((step) => step.run === 'pnpm install --frozen-lockfile');
    const typecheck = steps.find((step) => step.run === 'mise typecheck');

    expect(setup).toBeDefined();
    expect(install).toBeDefined();
    expect(typecheck).toBeDefined();
    expect(steps.indexOf(install!)).toBe(steps.indexOf(setup!) + 1);
    expect(steps.indexOf(typecheck!)).toBe(steps.indexOf(install!) + 1);
    expect(job['continue-on-error']).toBeUndefined();
    expect(typecheck?.['continue-on-error']).toBeUndefined();
  });
});
