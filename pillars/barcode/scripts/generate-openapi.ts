import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { barcodeContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: barcodeContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'barcode',
  description:
    "OpenAPI projection of the barcode pillar's REST contract. Authored as a ts-rest contract " +
    'and consumed by the pillar SDK for operationId route discovery.',
  hoistRecursiveDefinitions: false,
});
