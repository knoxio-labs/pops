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
 * purchases is a TypeScript pillar with a real npm package, so `require.resolve`
 * against its `./openapi` export would work — but that path makes `@pops/purchases`
 * a real dependency of app-finance, which drags the purchases BACKEND's runtime
 * graph (`better-sqlite3`, `express`, `drizzle-orm`, `@anthropic-ai/sdk`) into
 * every install and build that touches app-finance, including the shell image
 * and CI's per-app matrix. The spec is a static, dependency-free artifact;
 * nothing in that graph is needed to read it. This leg therefore vendors a
 * snapshot instead, under the same ADR-033 discipline the `contacts` leg uses
 * (there for a different reason — Rust has no npm package at all) — kept
 * byte-identical to the canonical `pillars/purchases/openapi/purchases.openapi.json`
 * by `scripts/ci/check-vendored-contracts.mjs`.
 *
 * Regenerate: pnpm --filter @pops/app-finance generate:purchases-client
 * Re-vendor after a producer change: cp pillars/purchases/openapi/purchases.openapi.json pillars/finance/app/contracts/purchases.openapi.json
 */
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: fileURLToPath(new URL('./contracts/purchases.openapi.json', import.meta.url)),
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
