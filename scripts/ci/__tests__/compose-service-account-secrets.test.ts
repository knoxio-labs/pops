/**
 * A pillar that reads a credential from a mounted file gets that file in
 * `infra/docker-compose.yml`, at the path it reads.
 *
 * This repo's compose had drifted from the deployed stack: capivara mounted
 * finance's service-account key and cerebrum's LLM API key, and this file
 * mounted neither, so it described a finance that could never authenticate
 * outbound (POPS-3379). Each row pins one variable to the secret behind it,
 * including the top-level declaration a service's `secrets:` entry needs for
 * compose to start it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const compose = ComposeFileSchema.parse(
  load(readFileSync(join(repoRoot, 'infra', 'docker-compose.yml'), 'utf8'))
);

const FILE_SECRETS = [
  {
    service: 'finance-api',
    variable: 'POPS_INTERNAL_API_KEY_FILE',
    secret: 'pops_finance_api_key',
  },
  { service: 'finance-api', variable: 'UP_BANK_TOKEN_FILE', secret: 'up_bank_token' },
  { service: 'finance-api', variable: 'UP_WEBHOOK_SECRET_FILE', secret: 'up_webhook_secret' },
  {
    service: 'purchases-api',
    variable: 'POPS_INTERNAL_API_KEY_FILE',
    secret: 'pops_purchases_api_key',
  },
  { service: 'bfm-api', variable: 'POPS_INTERNAL_API_KEY_FILE', secret: 'pops_bfm_api_key' },
  { service: 'cerebrum-api', variable: 'ANTHROPIC_API_KEY_FILE', secret: 'claude_api_key' },
];

function mountedSecrets(service: string): string[] {
  return (compose.services[service]?.secrets ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry.source
  );
}

describe('credential files mounted in infra/docker-compose.yml', () => {
  it.each(FILE_SECRETS)(
    '$service reads $variable from the mounted $secret',
    ({ service, variable, secret }) => {
      expect(compose.services[service], `${service} must be declared`).toBeDefined();
      expect(mountedSecrets(service)).toContain(secret);
      expect(compose.services[service]?.environment?.[variable]).toBe(`/run/secrets/${secret}`);
      expect(Object.keys(compose.secrets ?? {})).toContain(secret);
    }
  );
});
