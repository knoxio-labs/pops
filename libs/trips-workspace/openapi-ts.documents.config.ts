import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../pillars/documents/openapi/documents.openapi.json',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/documents-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
