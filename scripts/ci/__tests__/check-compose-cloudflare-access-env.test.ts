/**
 * `infra/docker-compose.yml` only forwards an environment variable into a
 * container if that service's own `environment:` block names it — setting
 * `CLOUDFLARE_ACCESS_TEAM_NAME` in the deployer's `.env` does nothing for a
 * service whose compose block never references it. Every service that
 * resolves a browser principal must forward the Access pair and the operator
 * list, and the shell's nginx must forward the operator list.
 *
 * Parses the real compose YAML with `js-yaml` rather than scanning lines, so
 * this cannot be fooled by the same shape (indentation, block-vs-flow
 * mappings, comments) that makes hand-rolled parsing fragile. The parsed
 * value is validated with `zod` rather than cast, so a compose file that
 * parses to something unexpected (an empty document, a top-level list) fails
 * with a readable schema error instead of an unrelated `undefined` crash a
 * few lines later.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

import { ComposeFileSchema } from '../compose-schema.mjs';

import type { z } from 'zod';

type ComposeFile = z.infer<typeof ComposeFileSchema>;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const composePath = join(repoRoot, 'infra', 'docker-compose.yml');
const devComposePath = join(repoRoot, 'infra', 'docker-compose.dev.yml');

function loadCompose(path: string): ComposeFile {
  return ComposeFileSchema.parse(load(readFileSync(path, 'utf8')));
}

const OPERATOR_EMAILS_VAR = 'POPS_OPERATOR_EMAILS';
const PRINCIPAL_VARS = [
  'CLOUDFLARE_ACCESS_TEAM_NAME',
  'CLOUDFLARE_ACCESS_AUD',
  OPERATOR_EMAILS_VAR,
];

const PRINCIPAL_SERVICES = [
  'registry-api',
  'inventory-api',
  'documents-api',
  'finance-api',
  'media-api',
  'food-api',
  'lists-api',
  'purchases-api',
  'bfm-api',
  'barcode-api',
  'tags-api',
  'ai-api',
  'cerebrum-api',
  'design-api',
  'pops-orchestrator',
];

const REQUIRED_VARS_BY_SERVICE: ReadonlyMap<string, readonly string[]> = new Map([
  ...PRINCIPAL_SERVICES.map((service): [string, readonly string[]] => [service, PRINCIPAL_VARS]),
  ['pops-shell', [OPERATOR_EMAILS_VAR]],
]);

/**
 * One line per required variable a service does not forward as
 * `${NAME:-}`. The default-to-empty form is part of the requirement: without
 * it Compose warns on every unset variable, and a hardcoded value would
 * ignore the deployer's `.env`.
 */
function findWiringViolations(
  compose: ComposeFile,
  required: ReadonlyMap<string, readonly string[]>
): string[] {
  const violations: string[] = [];
  for (const [serviceName, vars] of required) {
    const service = compose.services[serviceName];
    if (!service) {
      violations.push(`${serviceName}: service is not declared`);
      continue;
    }
    const env = service.environment ?? {};
    for (const key of vars) {
      const expected = `\${${key}:-}`;
      if (!Object.hasOwn(env, key)) {
        violations.push(`${serviceName}: environment is missing ${key}`);
      } else if (env[key] !== expected) {
        violations.push(`${serviceName}: ${key} must be forwarded as ${expected}`);
      }
    }
  }
  return violations;
}

function withoutEnvVar(compose: ComposeFile, serviceName: string, key: string): ComposeFile {
  const service = compose.services[serviceName];
  if (!service) throw new Error(`${serviceName} is not declared`);
  const environment = Object.fromEntries(
    Object.entries(service.environment ?? {}).filter(([name]) => name !== key)
  );
  return {
    ...compose,
    services: { ...compose.services, [serviceName]: { ...service, environment } },
  };
}

describe('infra/docker-compose.yml Cloudflare Access and operator wiring', () => {
  const compose = loadCompose(composePath);
  const requiredPairs = [...REQUIRED_VARS_BY_SERVICE].flatMap(([service, vars]) =>
    vars.map((key): [string, string] => [service, key])
  );

  it('forwards every required variable to every service that resolves a browser principal', () => {
    expect(findWiringViolations(compose, REQUIRED_VARS_BY_SERVICE)).toEqual([]);
  });

  it('requires all three variables of every pillar API and only the operator list of the shell', () => {
    expect(requiredPairs).toHaveLength(PRINCIPAL_SERVICES.length * 3 + 1);
    expect(REQUIRED_VARS_BY_SERVICE.get('pops-shell')).toEqual([OPERATOR_EMAILS_VAR]);
  });

  it.each(requiredPairs)('fails when %s stops forwarding %s', (serviceName, key) => {
    expect(
      findWiringViolations(withoutEnvVar(compose, serviceName, key), REQUIRED_VARS_BY_SERVICE)
    ).toEqual([`${serviceName}: environment is missing ${key}`]);
  });

  it('fails when a variable is hardcoded instead of read from the host environment', () => {
    const financeApi = compose.services['finance-api'];
    const hardcoded: ComposeFile = {
      ...compose,
      services: {
        ...compose.services,
        'finance-api': {
          ...financeApi,
          environment: { ...financeApi?.environment, [OPERATOR_EMAILS_VAR]: 'someone@example.com' },
        },
      },
    };

    expect(findWiringViolations(hardcoded, REQUIRED_VARS_BY_SERVICE)).toEqual([
      `finance-api: ${OPERATOR_EMAILS_VAR} must be forwarded as \${${OPERATOR_EMAILS_VAR}:-}`,
    ]);
  });

  it('fails when a required service is removed from the compose file', () => {
    const services = Object.fromEntries(
      Object.entries(compose.services).filter(([name]) => name !== 'design-api')
    );

    expect(findWiringViolations({ ...compose, services }, REQUIRED_VARS_BY_SERVICE)).toEqual([
      'design-api: service is not declared',
    ]);
  });
});

describe('infra/docker-compose.dev.yml', () => {
  it('forwards none of the variables, so dev traffic resolves to the local operator', () => {
    const dev = loadCompose(devComposePath);
    const forwarded = Object.entries(dev.services).flatMap(([serviceName, service]) =>
      PRINCIPAL_VARS.filter((key) => Object.hasOwn(service?.environment ?? {}, key)).map(
        (key) => `${serviceName}: ${key}`
      )
    );

    expect(forwarded).toEqual([]);
  });
});
