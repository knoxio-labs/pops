import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/trips/openapi/trips.openapi.json',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/trips-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
