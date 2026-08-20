import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { zodSchemaTransformer } from '../zod-schema-transformer.js';

describe('zodSchemaTransformer', () => {
  it('rejects non-zod schemas', () => {
    expect(zodSchemaTransformer({ schema: { type: 'string' } })).toBeNull();
  });

  it('widens a nullable enum so `null` is a member of `enum`, not just the `nullable` flag', () => {
    const result = zodSchemaTransformer({ schema: z.enum(['leaving', 'protected']).nullable() });

    expect(result).toEqual({
      type: 'string',
      enum: ['leaving', 'protected', null],
      nullable: true,
    });
  });

  it('widens a nullable enum nested inside an object property', () => {
    const result = zodSchemaTransformer({
      schema: z.object({ rotationStatus: z.enum(['leaving', 'protected']).nullable() }),
    }) as Record<string, unknown>;

    const properties = result['properties'] as Record<string, unknown>;
    const rotationStatus = properties['rotationStatus'] as Record<string, unknown>;
    expect(rotationStatus['enum']).toEqual(['leaving', 'protected', null]);
  });

  it('widens a nullable enum nested inside an array', () => {
    const result = zodSchemaTransformer({
      schema: z.array(z.enum(['x', 'y']).nullable()),
    }) as Record<string, unknown>;

    const items = result['items'] as Record<string, unknown>;
    expect(items['enum']).toEqual(['x', 'y', null]);
  });

  it('does not touch an enum that is not nullable', () => {
    const result = zodSchemaTransformer({ schema: z.enum(['a', 'b']) }) as Record<string, unknown>;
    expect(result['enum']).toEqual(['a', 'b']);
    expect(result['nullable']).toBeUndefined();
  });

  it('is idempotent: transforming the same schema twice does not double up null', () => {
    const schema = z.enum(['a', 'b']).nullable();
    zodSchemaTransformer({ schema });
    const result = zodSchemaTransformer({ schema }) as Record<string, unknown>;

    expect(result['enum']).toEqual(['a', 'b', null]);
  });

  it('leaves a plain nullable string untouched (no enum to widen)', () => {
    const result = zodSchemaTransformer({ schema: z.string().nullable() });
    expect(result).toEqual({ type: 'string', nullable: true });
  });
});
