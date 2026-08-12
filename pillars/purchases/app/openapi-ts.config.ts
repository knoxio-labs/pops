/**
 * Hey API codegen config — projects the purchases pillar's OpenAPI spec to a
 * typed TS client at `src/purchases-api/`.
 *
 * Per-consumer client (not a shared SDK): this app consumes its OWN pillar,
 * so the client stays inside the pillar directory and needs no cross-pillar
 * leg. `pillars/purchases/openapi/purchases.openapi.json` is the source of
 * truth, itself generated from the ts-rest contract.
 *
 * Regenerate: pnpm --filter @pops/app-purchases generate:purchases-client
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/purchases.openapi.json',
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
