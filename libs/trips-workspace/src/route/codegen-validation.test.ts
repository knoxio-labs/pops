import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { expect, it } from 'vitest';
import { z } from 'zod';

function response(schema: Record<string, unknown>): Record<string, unknown> {
  return { description: 'Generated metadata fixture', content: { 'application/json': { schema } } };
}

it('generates closed, open and dynamic response objects through the actual owning configuration', async () => {
  const scratch = resolve(import.meta.dirname, '../../../../tmp');
  const unit = resolve(import.meta.dirname, '../..');
  mkdirSync(scratch, { recursive: true });
  const output = mkdtempSync(join(scratch, 'route-validation-codegen-'));
  try {
    const schemas: { name: string; schema: Record<string, unknown> }[] = [
      {
        name: 'closed',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
      },
      { name: 'empty', schema: { type: 'object', additionalProperties: false } },
      {
        name: 'open',
        schema: {
          type: 'object',
          additionalProperties: true,
          required: ['name'],
          properties: { name: { type: 'string' } },
        },
      },
      { name: 'dynamic', schema: { type: 'object', additionalProperties: { type: 'string' } } },
    ];
    const fixture = join(output, 'fixture.openapi.json');
    writeFileSync(
      fixture,
      JSON.stringify({
        openapi: '3.0.3',
        info: { title: 'Response metadata fixture', version: '1' },
        paths: Object.fromEntries(
          schemas.map(({ name, schema }) => [
            `/${name}`,
            { get: { operationId: `${name}.get`, responses: { 200: response(schema) } } },
          ])
        ),
      })
    );
    const generatedDirectory = join(output, 'client');
    execFileSync(
      process.execPath,
      [
        join(unit, 'node_modules/@hey-api/openapi-ts/bin/run.js'),
        '-f',
        join(unit, 'openapi-ts.config.ts'),
        '-i',
        fixture,
        '-o',
        generatedDirectory,
      ],
      { cwd: unit, timeout: 10_000, stdio: 'pipe' }
    );
    const generated: unknown = await import(
      pathToFileURL(join(generatedDirectory, 'zod.gen.ts')).href
    );
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
