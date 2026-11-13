import { defineConfig } from '@hey-api/openapi-ts';

import type { Plugins } from '@hey-api/openapi-ts';

type ObjectResolver = NonNullable<Plugins.Zod.Resolvers['object']>;

/** Preserve closed producer response objects in generated runtime validators. */
export const closedResponseObject: ObjectResolver = (context) => {
  const additional = context.schema.additionalProperties;
  if (additional === false || (additional && additional.type === 'never'))
    return context.chain.current.attr('strictObject').call(context.nodes.shape(context));
  return undefined;
};

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
