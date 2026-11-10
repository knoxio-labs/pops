import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { tripsContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: tripsContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'trips',
  description:
    "OpenAPI projection of the trips pillar's REST contract. Authored as a ts-rest contract " +
    'and consumed by the pillar SDK for operationId route discovery.',
  hoistRecursiveDefinitions: true,
});
