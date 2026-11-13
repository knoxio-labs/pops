import { defineConfig } from '@hey-api/openapi-ts';

import { closedResponseObject } from './openapi-ts.config';

export default defineConfig({
  input: '../../pillars/documents/openapi/documents.openapi.json',
  plugins: [
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/documents-api-runtime-config.js' },
    '@hey-api/typescript',
    '@hey-api/sdk',
    {
      name: 'zod',
      compatibilityVersion: 4,
      requests: true,
      responses: true,
      $resolvers: {
        object: closedResponseObject,
        enum: (context) => {
          const items = context.schema.items;
          if (items?.length === 1 && items[0]?.const === null)
            return context.chain.current.attr('null').call();
          return undefined;
        },
      },
    },
  ],
});
