import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

const lanes = {
  quality: 'quality.yml',
  units: 'unit-quality.yml',
  apps: 'app-quality.yml',
  rust: 'rust-quality.yml',
  frontend: 'fe-quality.yml',
  browser: 'fe-test-e2e.yml',
  images: 'docker-build.yml',
  registry: 'registry-generated-quality.yml',
  ios: 'ios-quality.yml',
} as const;

function workflow(name: string): Record<string, unknown> {
  const path = join(repoRoot, '.github/workflows', name);
  const parsed = parseYaml(readFileSync(path, 'utf8'), path);
  if (!isMapping(parsed)) throw new Error(`${name} must contain a YAML mapping`);
  return parsed;
}

function job(workflowDocument: Record<string, unknown>, name: string): Record<string, unknown> {
  const jobs = workflowDocument.jobs;
  if (!isMapping(jobs) || !isMapping(jobs[name])) throw new Error(`Missing ${name} job`);
  return jobs[name];
}

function dockerDiscoveryScript(): string {
  const discover = job(workflow('docker-build.yml'), 'discover');
  if (!Array.isArray(discover.steps)) throw new Error('Docker discovery steps are missing');
  const list = discover.steps.find((step: unknown) => isMapping(step) && step.id === 'list');
  if (!isMapping(list) || typeof list.run !== 'string') {
    throw new Error('Docker discovery script is missing');
  }
  return list.run
    .replaceAll('${{ inputs.full-validation }}', 'true')
    .replaceAll('${{ github.event_name }}', 'pull_request')
    .replaceAll('${{ needs.changes.outputs.relevant }}', 'false');
}

describe('promotion workflow', { timeout: 30_000 }, () => {
  it('calls every full validation lane through a compatible reusable interface', () => {
    const promotion = workflow('promotion-quality.yml');
    const classify = job(promotion, 'classify');
    expect(classify.outputs).toEqual({
      required: '${{ steps.scope.outputs.required }}',
    });
    expect(Array.isArray(classify.steps)).toBe(true);
    const scope = Array.isArray(classify.steps)
      ? classify.steps.find((step: unknown) => isMapping(step) && step.id === 'scope')
      : undefined;
    expect(isMapping(scope) && isMapping(scope.env) && scope.env.PROMOTION_REQUIRED).toBe(
      "${{ github.base_ref == 'main' && (startsWith(github.head_ref, 'promotion/') || startsWith(github.head_ref, 'integration/')) }}"
    );

    for (const [lane, filename] of Object.entries(lanes)) {
      const laneJob = job(promotion, lane);
      expect(laneJob.uses).toBe(`./.github/workflows/${filename}`);
      expect(laneJob.needs).toBe('classify');
      expect(laneJob.if).toBe("needs.classify.outputs.required == 'true'");
      expect(isMapping(laneJob.with) && laneJob.with['full-validation']).toBe(true);

      const calledWorkflow = workflow(filename);
      const on = calledWorkflow.on;
      const workflowCall = isMapping(on) ? on.workflow_call : undefined;
      const inputs = isMapping(workflowCall) ? workflowCall.inputs : undefined;
      const fullValidation = isMapping(inputs) ? inputs['full-validation'] : undefined;
      expect(isMapping(fullValidation) && fullValidation.type).toBe('boolean');
      expect(isMapping(fullValidation) && fullValidation.required).toBe(true);
      expect(isMapping(fullValidation) && fullValidation.default).toBeUndefined();
    }

    const validation = job(promotion, 'validation');
    expect(validation.needs).toEqual(['classify', ...Object.keys(lanes)]);
    expect(Array.isArray(validation.steps)).toBe(true);
    const terminal = Array.isArray(validation.steps)
      ? validation.steps.find(
          (step: unknown) =>
            isMapping(step) && isMapping(step.env) && 'PROMOTION_RESULTS' in step.env
        )
      : undefined;
    expect(isMapping(terminal) && isMapping(terminal.env) && terminal.env.PROMOTION_REQUIRED).toBe(
      '${{ needs.classify.outputs.required }}'
    );
  });

  it('runs actual Docker discovery for an unrelated PR when full validation is requested', () => {
    const scratch = join(repoRoot, 'tmp');
    mkdirSync(scratch, { recursive: true });
    const cwd = mkdtempSync(join(scratch, 'promotion-docker-discovery-'));
    const output = join(cwd, 'output');
    try {
      for (const path of [
        'pillars/alpha/Dockerfile',
        'pillars/alpha/Dockerfile.api',
        'pillars/beta/app/Dockerfile',
      ]) {
        mkdirSync(join(cwd, path, '..'), { recursive: true });
        writeFileSync(join(cwd, path), 'FROM scratch\n');
      }
      mkdirSync(join(cwd, 'pillars/beta/source/deep'), { recursive: true });
      writeFileSync(join(cwd, 'pillars/beta/source/deep/Dockerfile'), 'FROM scratch\n');

      execFileSync('bash', ['-c', dockerDiscoveryScript()], {
        cwd,
        env: { ...process.env, GITHUB_OUTPUT: output },
        stdio: 'pipe',
        timeout: 10_000,
      });

      const line = readFileSync(output, 'utf8')
        .split('\n')
        .find((candidate) => candidate.startsWith('dockerfiles='));
      expect(line).toBeDefined();
      expect(JSON.parse(line?.slice('dockerfiles='.length) ?? '[]')).toEqual([
        'pillars/alpha/Dockerfile',
        'pillars/alpha/Dockerfile.api',
        'pillars/beta/app/Dockerfile',
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
