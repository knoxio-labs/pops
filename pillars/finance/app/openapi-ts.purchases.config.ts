/**
 * Hey API codegen config — projects the PURCHASES pillar's OpenAPI spec to a
 * typed TS client at `src/purchases-api/`.
 *
 * app-finance is a cross-pillar consumer of purchases: a finance transaction
 * is one side of a purchase<->charge reconciliation, and the purchase detail
 * lives only in purchases. Per-consumer client, not a shared SDK — app-finance
 * owns its own slice of the purchases surface via the wire contract, decoupled
 * from `@pops/app-purchases`.
 *
 * purchases is a TypeScript pillar, so the spec is resolved through its
 * `./openapi` package export (a declared devDependency) rather than a vendored
 * snapshot — the ADR-033 vendoring path exists only for producers with no npm
 * package, such as the Rust `contacts` pillar. Reaching into the sibling
 * pillar's folder on disk would break this unit's black-box isolation.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:purchases-client
 */
import { createRequire } from 'node:module';

import { defineConfig } from '@hey-api/openapi-ts';

const require = createRequire(import.meta.url);

export default defineConfig({
  input: require.resolve('@pops/purchases/openapi'),
  output: {
    path: 'src/purchases-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/purchases-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
