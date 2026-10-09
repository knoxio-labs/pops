import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';

import type { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

function loadCompose(): z.infer<typeof ComposeFileSchema> {
  return ComposeFileSchema.parse(
    load(readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8'))
  );
}

describe('pops-shell healthcheck', () => {
  it('probes nginx and watcher health with a configurable watcher host binding', () => {
    const probe = loadCompose().services['pops-shell']?.healthcheck?.test;
    const text = Array.isArray(probe) ? probe.join(' ') : (probe ?? '');
    const composeText = readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8');

    expect(text).toContain('http://127.0.0.1:80/healthz');
    expect(text).toContain('http://127.0.0.1:9090/health');
    expect(composeText).toContain("'${POPS_NGINX_HEALTH_BIND:-127.0.0.1}:19090:9090'");
    expect(composeText).toContain("POPS_NGINX_VALIDATION_FAILURE_THRESHOLD: '1'");
    expect(text).not.toMatch(/http:\/\/127\.0\.0\.1:80(?:\s|$)/);
    expect(text).not.toContain('/registry-api/health');
  });
});
