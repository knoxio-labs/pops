import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { tripsContract } from '../src/contract/rest.js';

import type { AppRoute } from '@ts-rest/core';

function isReadOnlyRoute(route: AppRoute): boolean {
  const metadata = route.metadata;
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'readOnly' in metadata &&
    metadata.readOnly === true
  );
}

writePillarOpenApi({
  contract: tripsContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'trips',
  description:
    "OpenAPI projection of the trips pillar's REST contract. Authored as a ts-rest contract " +
    'and consumed by the pillar SDK for operationId route discovery.',
  hoistRecursiveDefinitions: true,
  operationMapper: (operation, route) =>
    isReadOnlyRoute(route) ? { ...operation, 'x-pops-read-only': true } : operation,
});
