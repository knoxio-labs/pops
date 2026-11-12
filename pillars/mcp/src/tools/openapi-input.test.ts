import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contractInputs } from '../contract-inputs.js';
import {
  projectOperationInput,
  projectOperationResponse,
  projectOperationSuccess,
} from './openapi-input.js';

function documentFor(body: unknown, parameters: unknown[] = []) {
  return {
    openapi: '3.0.3',
    paths: {
      '/things/{id}': {
        post: {
          operationId: 'things.create',
          parameters,
          requestBody: { content: { 'application/json': { schema: body } } },
          responses: { 201: { content: { 'application/json': { schema: body } } } },
        },
      },
    },
  };
}

const closed = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const read = (owner: keyof typeof contractInputs): unknown =>
  JSON.parse(readFileSync(contractInputs[owner], 'utf8'));

describe('published OpenAPI MCP input admission', () => {
  it('shares the advertised schema and validator, preserving omission/null and exact input bytes', () => {
    const input = projectOperationInput(
      documentFor(
        closed({
          name: { type: 'string', nullable: true },
          count: { type: 'integer', minimum: 0 },
        }),
        [id]
      ),
      'things.create'
    );
    const args = { id: 7, name: null, count: 0 };
    expect(input.method).toBe('POST');
    expect(input.inputSchema.required).toEqual(['id']);
    expect(input.validate(args)).toEqual({ valid: true, data: args, errorMessage: undefined });
    expect(input.validate({ id: 7 }).valid).toBe(true);
    expect(input.validate({ id: '7' }).valid).toBe(false);
    expect(input.validate({ id: 7, unexpected: 1 }).valid).toBe(false);
    expect(args).toEqual({ id: 7, name: null, count: 0 });
  });

  it('retains nested exact unions, required fields and formats', () => {
    const input = projectOperationInput(
      documentFor(
        closed(
          {
            operationId: { type: 'string', format: 'uuid' },
            command: {
              oneOf: [
                closed(
                  {
                    kind: { type: 'string', enum: ['visit'] },
                    when: { type: 'string', format: 'date' },
                  },
                  ['kind', 'when']
                ),
                closed(
                  {
                    kind: { type: 'string', enum: ['link'] },
                    uri: { type: 'string', format: 'uri' },
                  },
                  ['kind', 'uri']
                ),
              ],
            },
          },
          ['operationId', 'command']
        )
      ),
      'things.create'
    );
    const operationId = '6e22b66a-45f6-4aa1-aaba-04fd8d6d9f81';
    expect(
      input.validate({ operationId, command: { kind: 'visit', when: '2026-02-29' } }).valid
    ).toBe(false);
    expect(
      input.validate({ operationId, command: { kind: 'visit', when: '2026-02-28' } }).valid
    ).toBe(true);
    expect(input.validate({ operationId, command: { kind: 'link', uri: 'not a uri' } }).valid).toBe(
      false
    );
    expect(
      input.validate({ operationId: 'no', command: { kind: 'link', uri: 'https://example.com' } })
        .valid
    ).toBe(false);
    expect(
      input.validate({
        operationId,
        command: { kind: 'visit', when: '2026-02-28', uri: 'https://example.com' },
      }).valid
    ).toBe(false);
    const nullable = projectOperationInput(
      documentFor(
        closed(
          {
            value: {
              nullable: true,
              oneOf: [closed({ kind: { enum: ['self'] } }, ['kind'])],
            },
          },
          ['value']
        )
      ),
      'things.create'
    );
    expect(nullable.validate({ value: null }).valid).toBe(true);
    expect(nullable.validate({ value: { kind: 'self' } }).valid).toBe(true);
    expect(nullable.validate({ value: { kind: 'foreign' } }).valid).toBe(false);
  });

  it('resolves local escaped references and validates success without dropping fields', () => {
    const body = closed({ value: { $ref: '#/components/schemas/a~1b~0c' } }, ['value']);
    const document = {
      ...documentFor(body),
      components: { schemas: { 'a/b~c': { type: 'string', minLength: 2 } } },
    };
    const input = projectOperationInput(document, 'things.create');
    expect(input.validate({ value: 'x' }).valid).toBe(false);
    expect(input.validate({ value: 'xy' }).valid).toBe(true);
    const response = projectOperationResponse(document, 'things.create', 201);
    expect(response({ value: 'xy' }).valid).toBe(true);
    expect(response({ value: 'x' }).valid).toBe(false);
    expect(() => projectOperationResponse(document, 'things.create', 200)).toThrow('response 200');
  });

  it('requires an unambiguous success schema and accepts no-content only when declared', () => {
    const base = documentFor(closed({ name: { type: 'string' } }, ['name']));
    const operation = base.paths['/things/{id}'].post;
    const withResponses = (responses: Record<string, unknown>) => ({
      ...base,
      paths: { '/things/{id}': { post: { ...operation, responses } } },
    });
    const success = projectOperationSuccess(base, 'things.create');
    expect(success.status).toBe(201);
    expect(success.validate({ name: 'Recorded' }).valid).toBe(true);
    expect(success.validate(undefined).valid).toBe(false);
    const empty = projectOperationSuccess(
      withResponses({ 204: { description: 'No content' } }),
      'things.create'
    );
    expect(empty.status).toBe(204);
    expect(empty.validate(undefined).valid).toBe(true);
    for (const value of [null, false, 0, {}, '']) expect(empty.validate(value).valid).toBe(false);
    expect(() => projectOperationSuccess(withResponses({}), 'things.create')).toThrow(
      'exactly one success'
    );
    expect(() =>
      projectOperationSuccess(withResponses({ ...operation.responses, 204: {} }), 'things.create')
    ).toThrow('exactly one success');
    expect(() =>
      projectOperationSuccess(withResponses({ 204: operation.responses[201] }), 'things.create')
    ).toThrow('Unexpected HTTP 204');
  });

  it.each([
    [{ $ref: 'https://example.com/schema' }, 'External'],
    [{ $ref: '#/components/schemas/missing' }, 'Missing'],
    [{ type: 'string', format: 'future-format' }, 'Unsupported'],
    [{ type: 'string', futureConstraint: true }, 'Unsupported'],
    [{ type: 'string', default: 'invented' }, 'Unsupported'],
  ])('fails startup for unsupported or unresolved published schema %j', (property, message) => {
    expect(() =>
      projectOperationInput(documentFor(closed({ value: property })), 'things.create')
    ).toThrow(String(message));
  });

  it('rejects recursive references, duplicate operations and ambiguous flattened fields', () => {
    const recursive = {
      ...documentFor(closed({ value: { $ref: '#/components/schemas/loop' } })),
      components: { schemas: { loop: { $ref: '#/components/schemas/loop' } } },
    };
    expect(() => projectOperationInput(recursive, 'things.create')).toThrow('Recursive');
    const document = documentFor(closed({ id: { type: 'integer' } }), [id]);
    expect(() => projectOperationInput(document, 'things.create')).toThrow('Ambiguous');
    const duplicate = documentFor(closed({}));
    expect(() =>
      projectOperationInput(
        { ...duplicate, paths: { ...duplicate.paths, '/other': duplicate.paths['/things/{id}'] } },
        'things.create'
      )
    ).toThrow('exactly one');
    expect(() => projectOperationInput(duplicate, 'things.missing')).toThrow('exactly one');
  });

  it('intersects signed numeric formats with existing constraints without blocking nullable values', () => {
    const input = projectOperationInput(
      documentFor(
        closed({
          wide: { type: 'integer', format: 'int64', nullable: true },
          narrow: { type: 'integer', format: 'int64', minimum: 2, maximum: 4 },
          double: { type: 'number', format: 'double' },
        })
      ),
      'things.create'
    );
    for (const wide of [-(2 ** 63), 2 ** 63 - 1024, null])
      expect(input.validate({ wide }).valid).toBe(true);
    for (const wide of [-(2 ** 63) - 2048, 2 ** 63, 1.5])
      expect(input.validate({ wide }).valid).toBe(false);
    expect(input.validate({ narrow: 1 }).valid).toBe(false);
    expect(input.validate({ narrow: 3 }).valid).toBe(true);
    expect(input.validate({ narrow: 5 }).valid).toBe(false);
    expect(input.validate({ double: Number.MAX_VALUE }).valid).toBe(true);
    expect(input.validate({ double: Infinity }).valid).toBe(false);
  });

  it('lowers OpenAPI boolean exclusivity without losing positive-ID boundaries', () => {
    const input = projectOperationInput(
      documentFor(
        closed({
          id: {
            type: 'integer',
            minimum: 0,
            exclusiveMinimum: true,
            maximum: 9,
            exclusiveMaximum: false,
          },
        })
      ),
      'things.create'
    );
    expect(input.validate({ id: 0 }).valid).toBe(false);
    expect(input.validate({ id: 1 }).valid).toBe(true);
    expect(input.validate({ id: 9 }).valid).toBe(true);
    expect(input.validate({ id: 10 }).valid).toBe(false);
  });

  it('admits every input and successful response from the 89 canonical Trips operations', () => {
    const trips = read('trips');
    if (
      typeof trips !== 'object' ||
      trips === null ||
      !('paths' in trips) ||
      typeof trips.paths !== 'object' ||
      trips.paths === null
    )
      throw new Error('Missing canonical paths');
    const operations: string[] = [];
    for (const path of Object.values(trips.paths)) {
      if (typeof path !== 'object' || path === null) throw new Error('Invalid canonical path');
      for (const operation of Object.values(path)) {
        if (
          typeof operation === 'object' &&
          operation !== null &&
          'operationId' in operation &&
          typeof operation.operationId === 'string'
        )
          operations.push(operation.operationId);
      }
    }
    expect(operations).toHaveLength(89);
    for (const operation of operations) {
      expect(() => projectOperationInput(trips, operation), operation).not.toThrow();
      expect(() => projectOperationSuccess(trips, operation), operation).not.toThrow();
    }
  });
});
