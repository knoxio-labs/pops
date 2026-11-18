import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { z } from 'zod';

import { isStoragePath } from './litestream-storage.mjs';

const environmentName = z.string().regex(/^[A-Z][A-Z0-9_]*$/u);
const fixtureSchema = z.strictObject({
  version: z.literal(1),
  authorityEnvironment: environmentName,
  directoryEnvironment: environmentName,
  directory: z.string().refine(isStoragePath),
  provisionCommand: z.array(z.string().min(1)).min(1),
  refusalStatus: z.literal(500),
});

/**
 * An image-owned, explicit isolated provisioning contract; never production initialization.
 * @param {string} dockerfilePath
 * @param {string | undefined} label
 * @param {string[]} mountPaths
 * @returns {AuthorityFixture | undefined}
 */
export function readAuthorityFixture(dockerfilePath, label, mountPaths) {
  if (label === undefined) return undefined;
  const directory = resolve(dirname(dockerfilePath));
  const file = resolve(directory, label);
  const local = relative(directory, file);
  if (local === '' || local.startsWith('..') || local.startsWith('/')) {
    throw new Error('Smoke fixture must belong to the Dockerfile directory');
  }
  const actualDirectory = realpathSync(directory);
  const actualFile = realpathSync(file);
  const actualLocal = relative(actualDirectory, actualFile);
  if (actualLocal === '' || actualLocal.startsWith('..') || actualLocal.startsWith('/')) {
    throw new Error('Smoke fixture must resolve within the Dockerfile directory');
  }
  const fixture = fixtureSchema.parse(JSON.parse(readFileSync(actualFile, 'utf8')));
  if (!mountPaths.includes(fixture.directory)) {
    throw new Error('Smoke authority directory requires its own declared persistent mount');
  }
  if (fixture.authorityEnvironment === fixture.directoryEnvironment) {
    throw new Error('Smoke authority and directory require distinct environment names');
  }
  return fixture;
}

/** @typedef {z.infer<typeof fixtureSchema>} AuthorityFixture */
/** @typedef {{name: string, path: string}} FixtureVolume */
/** @typedef {(args: string[]) => Promise<string>} DockerCommand */

/**
 * Build explicit synthetic setup arguments using only this run's owned fresh volumes.
 * @param {AuthorityFixture} fixture
 * @param {string} image
 * @param {FixtureVolume[]} volumes
 * @param {string} guardId
 * @returns {string[]}
 */
export function authorityProvisionArgs(fixture, image, volumes, guardId) {
  return [
    'run',
    '--rm',
    ...volumes.flatMap(({ name, path }) => ['--volume', `${name}:${path}`]),
    '--env',
    `${fixture.authorityEnvironment}=${guardId}`,
    '--env',
    `${fixture.directoryEnvironment}=${fixture.directory}`,
    image,
    ...fixture.provisionCommand,
  ];
}

/**
 * Exercise missing/mismatched authority on separate disposable volumes, then provision the
 * matching fixture used by the ordinary successful image smoke. All authority is synthetic.
 * @param {{fixture: AuthorityFixture, image: string, volumes: FixtureVolume[], docker: DockerCommand,
 * cleanup: (args: string[]) => Promise<void>, refuse: (environment: Record<string,string>, volumes: FixtureVolume[], expectedStatus: number) => Promise<void>}} options
 * @returns {Promise<Record<string,string>>} The matching server's expected identity only.
 */
export async function prepareAuthorityFixture({
  fixture,
  image,
  volumes,
  docker,
  cleanup,
  refuse,
}) {
  const guardId = randomUUID();
  const environment = { [fixture.authorityEnvironment]: guardId };
  for (const provision of [false, true]) {
    const negative = volumes.map(({ path }) => ({
      name: `pops-smoke-refusal-${randomUUID()}`,
      path,
    }));
    try {
      for (const { name } of negative) await docker(['volume', 'create', name]);
      if (provision) {
        await docker(authorityProvisionArgs(fixture, image, negative, randomUUID()));
      }
      await refuse(environment, negative, fixture.refusalStatus);
    } finally {
      for (const { name } of negative) await cleanup(['volume', 'rm', '--force', name]);
    }
  }
  await docker(authorityProvisionArgs(fixture, image, volumes, guardId));
  return environment;
}
