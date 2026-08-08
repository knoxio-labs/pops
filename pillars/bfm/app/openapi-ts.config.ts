/**
 * Hey API codegen config — projects the bfm pillar's OpenAPI spec to a typed
 * TS client at `src/bfm-api/`.
 *
 * Per-consumer client (not a shared SDK): this app consumes its OWN pillar,
 * so the client stays inside the pillar directory and needs no cross-pillar
 * leg. `pillars/bfm/openapi/bfm.openapi.json` is the polyglot source of
 * truth — the iOS client generates from the same file.
 *
 * Regenerate: pnpm --filter @pops/app-bfm generate:api
 */
import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/bfm.openapi.json',
  output: {
    path: 'src/bfm-api',
  },
  plugins: [
    {
      name: '@hey-api/client-fetch',
      runtimeConfigPath: './src/bfm-api-runtime-config.js',
    },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
