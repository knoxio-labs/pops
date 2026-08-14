/**
 * OpenAPI generator for `@pops/documents` — projects the ts-rest contract in
 * `src/contract/rest.ts` to a static `openapi/documents.openapi.json` file.
 *
 * The contract is the canonical declaration of the documents wire surface;
 * this script is a pure projection of it. `@pops/pillar-sdk`'s
 * `getRouteMap` fetches this document live from the pillar's `GET /openapi`
 * route to build its `operationId`-addressed route map, so a sibling
 * pillar's `pillar('documents')` proxy call resolves against it.
 *
 * The projection itself — the zod 4 schema transformer, the recursive key
 * sort, the oxfmt pass — is `@pops/contract-openapi`, shared with every other
 * pillar. Output stays deterministic so the
 * `pnpm generate:openapi && git diff --exit-code` drift check is stable.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { documentsContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: documentsContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'documents',
  description:
    "OpenAPI projection of the documents pillar's REST contract. " +
    'Authored as a ts-rest contract (src/contract/rest.ts); ' +
    'consumed by the pillar SDK to build its operationId route map.',
  hoistRecursiveDefinitions: false,
});
