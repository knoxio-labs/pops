import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { orchestratorContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: orchestratorContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'orchestrator',
  description:
    "OpenAPI projection of the orchestrator's REST contract, including the cross-pillar tagged query.",
  hoistRecursiveDefinitions: false,
});
