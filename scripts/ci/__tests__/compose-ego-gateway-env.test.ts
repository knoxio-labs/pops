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
const INBOUND_SECRET = 'mcp_inbound_token';
const INBOUND_SECRET_FILE = '../secrets/mcp_inbound_token';
const INBOUND_SECRET_PATH = '/run/secrets/mcp_inbound_token';
const MCP_API_KEY_PATH = '/run/secrets/pops_mcp_api_key';

type ComposeService = NonNullable<z.infer<typeof ComposeFileSchema>['services'][string]>;

function loadCompose(name: string): z.infer<typeof ComposeFileSchema> {
  return ComposeFileSchema.parse(load(readFileSync(join(repoRoot, 'infra', name), 'utf8')));
}

function service(
  compose: z.infer<typeof ComposeFileSchema>,
  name: string,
  file: string
): ComposeService {
  const result = compose.services[name];
  if (result === undefined || result === null) {
    throw new Error(`${name} must be declared in infra/${file}`);
  }
  return result;
}

function secretSources(service: ComposeService): string[] {
  return (service.secrets ?? []).map((entry) => (typeof entry === 'string' ? entry : entry.source));
}

describe('Ego MCP gateway Compose secret wiring', () => {
  it.each(COMPOSE_FILES)('%s mounts one file-backed inbound secret for both peers', (file) => {
    const compose = loadCompose(file);
    const cerebrum = service(compose, 'cerebrum-api', file);
    const mcp = service(compose, 'pops-mcp', file);
    const cerebrumEnvironment = cerebrum.environment ?? {};
    const mcpEnvironment = mcp.environment ?? {};

    expect(cerebrumEnvironment['CEREBRUM_EGO_MCP_URL']).toBe('${CEREBRUM_EGO_MCP_URL:-}');
    expect(cerebrumEnvironment['CEREBRUM_EGO_MCP_TOKEN_FILE']).toBe(INBOUND_SECRET_PATH);
    expect(cerebrumEnvironment).not.toHaveProperty('CEREBRUM_EGO_MCP_TOKEN');
    expect(secretSources(cerebrum)).toContain(INBOUND_SECRET);

    expect(mcpEnvironment['MCP_INBOUND_TOKEN_FILE']).toBe(INBOUND_SECRET_PATH);
    expect(mcpEnvironment).not.toHaveProperty('MCP_INBOUND_TOKEN');
    expect(secretSources(mcp)).toContain(INBOUND_SECRET);
    expect(compose.secrets?.[INBOUND_SECRET]).toEqual({ file: INBOUND_SECRET_FILE });
  });

  it.each(COMPOSE_FILES)(
    '%s keeps MCP outbound service auth separate from inbound auth',
    (file) => {
      const compose = loadCompose(file);
      const mcp = service(compose, 'pops-mcp', file);

      expect(secretSources(mcp)).toContain('pops_mcp_api_key');
      expect(mcp.environment?.['POPS_API_KEY_FILE']).toBe(MCP_API_KEY_PATH);
      expect(mcp.environment?.['MCP_INBOUND_TOKEN_FILE']).toBe(INBOUND_SECRET_PATH);
      expect(MCP_API_KEY_PATH).not.toBe(INBOUND_SECRET_PATH);
      expect(compose.secrets?.pops_mcp_api_key).toEqual({ file: '../secrets/pops_mcp_api_key' });
    }
  );
});
