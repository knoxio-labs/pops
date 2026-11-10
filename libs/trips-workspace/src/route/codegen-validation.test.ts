import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { closedResponseObject } from './codegen';

function response(schema: Record<string, unknown>): Record<string, unknown> {
  return { description: 'Generated metadata fixture', content: { 'application/json': { schema } } };
}

it('generates closed, open and dynamic response objects from their actual OpenAPI metadata', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp');
  mkdirSync(scratch, { recursive: true });
  const output = mkdtempSync(join(scratch, 'route-validation-codegen-'));
  try {
    await createClient({
      plugins: [
        {
          name: 'zod',
          compatibilityVersion: 4,
          requests: false,
          responses: true,
          $resolvers: { object: closedResponseObject },
        },
      ],
      input: {
        path: {
          openapi: '3.0.3',
          info: { title: 'Response metadata fixture', version: '1' },
          paths: {
            '/empty': {
              get: {
                operationId: 'empty.get',
                responses: { 200: response({ type: 'object', additionalProperties: false }) },
              },
            },
            '/closed': {
              get: {
                operationId: 'closed.get',
                responses: {
                  200: response({
                    type: 'object',
                    additionalProperties: false,
                    required: ['name'],
                    properties: { name: { type: 'string' } },
                  }),
                },
              },
            },
            '/open': {
              get: {
                operationId: 'open.get',
                responses: {
                  200: response({
                    type: 'object',
                    additionalProperties: true,
                    required: ['name'],
                    properties: { name: { type: 'string' } },
                  }),
                },
              },
            },
            '/dynamic': {
              get: {
                operationId: 'dynamic.get',
                responses: {
                  200: response({ type: 'object', additionalProperties: { type: 'string' } }),
                },
              },
            },
          },
        },
      },
      output,
    });
    const generated: unknown = await import(pathToFileURL(join(output, 'zod.gen.ts')).href);
    if (
      typeof generated !== 'object' ||
      generated === null ||
      !('zClosedGetResponse' in generated) ||
      !(generated.zClosedGetResponse instanceof z.ZodType) ||
      !('zOpenGetResponse' in generated) ||
      !(generated.zOpenGetResponse instanceof z.ZodType) ||
      !('zDynamicGetResponse' in generated) ||
      !(generated.zDynamicGetResponse instanceof z.ZodType) ||
      !('zEmptyGetResponse' in generated) ||
      !(generated.zEmptyGetResponse instanceof z.ZodType)
    )
      throw new Error('Missing generated response schemas');
    expect(generated.zClosedGetResponse.safeParse({ name: 'Source' }).success).toBe(true);
    expect(
      generated.zClosedGetResponse.safeParse({ name: 'Source', extra: 'Rejected' }).success
    ).toBe(false);
    expect(generated.zOpenGetResponse.safeParse({ name: 'Source', extra: 'Allowed' }).success).toBe(
      true
    );
    expect(generated.zDynamicGetResponse.safeParse({ arbitrary: 'Allowed' }).success).toBe(true);
    expect(generated.zDynamicGetResponse.safeParse({ arbitrary: 42 }).success).toBe(false);
    expect(generated.zEmptyGetResponse.safeParse({}).success).toBe(true);
    expect(generated.zEmptyGetResponse.safeParse({ arbitrary: 'Rejected' }).success).toBe(false);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 30_000);
