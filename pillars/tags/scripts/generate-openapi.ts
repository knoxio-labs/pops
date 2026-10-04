import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { tagsContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: tagsContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'tags',
  description:
    "OpenAPI projection of the tags pillar's REST contract. Authored as a ts-rest contract " +
    'and consumed by the pillar SDK for operationId route discovery.',
  hoistRecursiveDefinitions: false,
});
