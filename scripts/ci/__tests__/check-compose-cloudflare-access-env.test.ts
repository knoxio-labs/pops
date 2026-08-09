/**
 * `infra/docker-compose.yml` only forwards an environment variable into a
 * container if that service's own `environment:` block names it — setting
 * `CLOUDFLARE_ACCESS_TEAM_NAME` in the deployer's `.env` does nothing for a
 * service whose compose block never references it. `registry-api` and
 * `bfm-api` both resolve a Cloudflare Access identity in
 * `src/api/middleware/identity.ts`, so both must forward it.
 *
 * Parses the real compose YAML with `js-yaml` rather than scanning lines, so
 * this cannot be fooled by the same shape (indentation, block-vs-flow
 * mappings, comments) that makes hand-rolled parsing fragile.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const composePath = join(repoRoot, 'infra', 'docker-compose.yml');

interface ComposeService {
  environment?: Record<string, unknown>;
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

function loadCompose(path: string): ComposeFile {
  return load(readFileSync(path, 'utf8')) as ComposeFile;
}

const CLOUDFLARE_ACCESS_VARS = ['CLOUDFLARE_ACCESS_TEAM_NAME', 'CLOUDFLARE_ACCESS_AUD'];

describe('infra/docker-compose.yml Cloudflare Access wiring', () => {
  const compose = loadCompose(composePath);

  it.each(['registry-api', 'bfm-api'])(
    '%s forwards CLOUDFLARE_ACCESS_TEAM_NAME and CLOUDFLARE_ACCESS_AUD from the host environment',
    (serviceName) => {
      const service = compose.services?.[serviceName];
      expect(service, `${serviceName} must be declared in infra/docker-compose.yml`).toBeDefined();

      const env = service?.environment ?? {};
      for (const key of CLOUDFLARE_ACCESS_VARS) {
        expect(
          Object.hasOwn(env, key),
          `${serviceName}.environment is missing ${key} — its container will never see it, ` +
            'no matter what the deployer sets in .env'
        ).toBe(true);
      }
    }
  );

  it("forwards each variable with compose's default-to-empty substitution, matching bfm-api's style", () => {
    const registryEnv = compose.services?.['registry-api']?.environment ?? {};
    const bfmEnv = compose.services?.['bfm-api']?.environment ?? {};

    for (const key of CLOUDFLARE_ACCESS_VARS) {
      expect(registryEnv[key]).toBe(`\${${key}:-}`);
      expect(bfmEnv[key]).toBe(`\${${key}:-}`);
    }
  });
});
