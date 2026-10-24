import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: '../openapi/contacts.openapi.json',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/contacts-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
