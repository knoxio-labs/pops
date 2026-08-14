/**
 * OpenAPI generator for `@pops/lists` — projects the ts-rest contract in
 * `src/contract/rest.ts` to a static `openapi/lists.openapi.json` file.
 *
 * The contract is the canonical declaration of the lists wire surface; this
 * script is a pure projection of it. Polyglot consumers (iOS Swift, Rust)
 * consume the JSON directly; TS consumers feed it through
 * `openapi-typescript` (see `generate-api-types.ts`) for `openapi-fetch`.
 *
 * The projection itself — the zod 4 schema transformer, the recursive key
 * sort, the oxfmt pass — is `@pops/contract-openapi`, shared with every other
 * pillar. Output stays deterministic so the
 * `pnpm generate:openapi && git diff --exit-code` drift check is stable.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writePillarOpenApi } from '@pops/contract-openapi';

import { listsContract } from '../src/contract/rest.js';

writePillarOpenApi({
  contract: listsContract,
  packageDir: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  pillarId: 'lists',
  description:
    "OpenAPI projection of the lists pillar's REST contract. " +
    'Authored as a ts-rest contract (src/contract/rest.ts); ' +
    'consumed directly by polyglot clients and via ' +
    'openapi-typescript by TS consumers.',
  hoistRecursiveDefinitions: false,
});
