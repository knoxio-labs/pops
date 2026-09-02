/**
 * `pops-mcp`'s healthcheck must probe `/ready`, not `/health` (POPS-2760).
 *
 * The two routes answer different questions and the container's liveness gate
 * used to ask the wrong one. `/health` is deliberately upstream-free and
 * returns ok unconditionally; `/ready` reports 503 when no service-account key
 * resolves. Probing `/health` meant a container that could not read its mounted
 * secret bound the port, passed its healthcheck, and failed every tool call —
 * green in `docker ps`, `restart: unless-stopped` never tripping, watchtower
 * happily rolling it forward.
 *
 * The boot gate in `service-account-key.ts` is the primary fix and would kill
 * such a container outright. This guard covers the case that gate cannot: a key
 * that stops resolving *after* startup, and, more importantly, a future edit
 * quietly reverting the probe. Both files are checked — dev drifting back to
 * `/health` is the same hole one environment over.
 *
 * Parses the real compose YAML with `js-yaml` rather than scanning lines, so it
 * cannot be fooled by indentation, block-vs-flow mappings or comments — the
 * same reasoning as `check-compose-cloudflare-access-env.test.ts`, whose shape
 * this follows.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';

import type { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.dev.yml'];

function loadCompose(name: string): z.infer<typeof ComposeFileSchema> {
  return ComposeFileSchema.parse(load(readFileSync(join(repoRoot, 'infra', name), 'utf8')));
}

/** The healthcheck `test` flattened to one string, whichever form it takes. */
function probeText(test: string | string[] | undefined): string {
  return Array.isArray(test) ? test.join(' ') : (test ?? '');
}

describe('pops-mcp healthcheck probes readiness, not liveness', () => {
  it.each(COMPOSE_FILES)('%s probes /ready', (file) => {
    const service = loadCompose(file).services['pops-mcp'];
    expect(service, `pops-mcp must be declared in infra/${file}`).toBeDefined();

    const probe = probeText(service?.healthcheck?.test);
    expect(probe, `pops-mcp in infra/${file} declares no healthcheck test`).not.toBe('');
    expect(
      probe,
      `pops-mcp's healthcheck in infra/${file} must probe /ready. /health returns ok even with ` +
        'no service-account key, so probing it marks a container healthy that cannot answer a ' +
        'single tool call (POPS-2760).'
    ).toContain('/ready');
  });

  it.each(COMPOSE_FILES)('%s does not probe /health', (file) => {
    const probe = probeText(loadCompose(file).services['pops-mcp']?.healthcheck?.test);

    expect(probe).not.toContain('/health');
  });
});

describe('the guard can actually fail', () => {
  // A guard nobody has watched fail is not a guard (POPS-1589). These pin the
  // predicate itself against hand-built fixtures, so the assertions above are
  // known to reject the shape they exist to reject rather than passing because
  // they read nothing.
  function serviceFrom(
    yaml: string
  ): z.infer<typeof ComposeFileSchema>['services'][string] | undefined {
    return ComposeFileSchema.parse(load(yaml)).services['pops-mcp'];
  }

  it('rejects a healthcheck that probes /health', () => {
    const service = serviceFrom(`
services:
  pops-mcp:
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://localhost:3011/health')"]
`);

    expect(probeText(service?.healthcheck?.test)).not.toContain('/ready');
  });

  it('accepts the list form and the string form alike', () => {
    const list = serviceFrom(`
services:
  pops-mcp:
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://localhost:3011/ready')"]
`);
    const string = serviceFrom(`
services:
  pops-mcp:
    healthcheck:
      test: "curl -f http://localhost:3011/ready"
`);

    expect(probeText(list?.healthcheck?.test)).toContain('/ready');
    expect(probeText(string?.healthcheck?.test)).toContain('/ready');
  });

  it('treats a service with no healthcheck as a failure, not a pass', () => {
    const service = serviceFrom(`
services:
  pops-mcp:
    image: ghcr.io/knoxio-labs/pops-mcp:main
`);

    expect(probeText(service?.healthcheck?.test)).toBe('');
  });
});
