import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../../tags/openapi/tags.openapi.json',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/tags-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
