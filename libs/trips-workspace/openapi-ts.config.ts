import { defineConfig } from '@hey-api/openapi-ts';

import { closedResponseObject } from './src/route/codegen';

export default defineConfig({
  input: '../../pillars/trips/openapi/trips.openapi.json',
  output: 'src/trips-api',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/trips-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
    {
      name: 'zod',
      compatibilityVersion: 4,
      requests: false,
      responses: true,
      $resolvers: {
        object: closedResponseObject,
      },
    },
  ],
});
