import { describe, expect, it, vi } from 'vitest';

import { contractResponseConformance } from '../responses.js';

import type { MockRequest } from '../install.js';

const SPEC = {
  openapi: '3.0.2',
  paths: {
    '/links/batch': {
      post: {
        operationId: 'links.batch',
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['transactions'],
                  properties: {
                    transactions: { type: 'array', items: { $ref: '#/components/schemas/Link' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/things/{id}': {
      get: {
        operationId: 'things.get',
        responses: {
          '200': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Thing' } },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: { responses: { '204': { description: 'gone' } } },
    },
    '/fallback': {
      get: {
        responses: {
          default: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/text': {
      get: { responses: { '200': { content: { 'text/plain': { schema: { type: 'string' } } } } } },
    },
  },
  components: {
    schemas: {
      Link: {
        type: 'object',
        required: ['id', 'note'],
        properties: { id: { type: 'string' }, note: { type: 'string', nullable: true } },
      },
      Thing: {
        type: 'object',
        required: ['id', 'link'],
        properties: { id: { type: 'string' }, link: { $ref: '#/components/schemas/Link' } },
      },
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
    responses: {
      NotFound: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
};

const THING = { id: 't1', link: { id: 'l1', note: null } };

describe('contractResponseConformance', () => {
  it('passes a body that matches the declared schema, through component refs and nullable', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'POST /links/batch': () => ({ body: { transactions: [{ id: 'l1', note: null }] } }),
    });
    expect(result).toEqual({
      operation: 'POST /links/batch',
      operationId: 'links.batch',
      status: 200,
      schemaPath: '#/paths/~1links~1batch/post/responses/200/content/application~1json/schema',
      issues: [],
    });
  });

  it('reports a body keyed differently from the contract, with the operation and schema path', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'POST /links/batch': () => ({ body: { purchases: [] } }),
    });
    expect(result?.operationId).toBe('links.batch');
    expect(result?.schemaPath).toBe(
      '#/paths/~1links~1batch/post/responses/200/content/application~1json/schema'
    );
    expect(result?.issues).toHaveLength(1);
    expect(result?.issues[0]).toMatch(/^transactions: /);
  });

  it('reports a violation inside a referenced component at its instance path', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ body: { id: 't1', link: { id: 7, note: null } } }),
    });
    expect(result?.issues).toHaveLength(1);
    expect(result?.issues[0]).toMatch(/^link\.id: /);
  });

  it('rejects null where the schema is not nullable', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ body: { id: null, link: { id: 'l1', note: null } } }),
    });
    expect(result?.issues[0]).toMatch(/^id: /);
  });

  it('validates an error status against its schema, resolving a response-level ref', async () => {
    const results = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ status: 404, body: { code: 'NOT_FOUND', message: 'no' } }),
    });
    expect(results[0]?.schemaPath).toBe(
      '#/paths/~1things~1{id}/get/responses/404/content/application~1json/schema'
    );
    expect(results[0]?.issues).toEqual([]);

    const [bad] = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ status: 404, body: { message: 'no' } }),
    });
    expect(bad?.issues[0]).toMatch(/^code: /);
  });

  it('reports a status the operation does not declare', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ status: 503, body: {} }),
    });
    expect(result?.schemaPath).toBeNull();
    expect(result?.issues).toEqual(['status 503 is not declared by the operation']);
  });

  it('falls back to the default response for an undeclared status', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /fallback': () => ({ status: 418, body: {} }),
    });
    expect(result?.schemaPath).toBe(
      '#/paths/~1fallback/get/responses/default/content/application~1json/schema'
    );
    expect(result?.issues[0]).toMatch(/^message: /);
  });

  it('reports a body on a response that declares none, and accepts none', async () => {
    const [withBody] = await contractResponseConformance(SPEC, {
      'DELETE /things/{id}': () => ({ status: 204, body: { ok: true } }),
    });
    expect(withBody?.issues).toEqual([
      'status 204 cannot carry a body, but the handler answered one',
    ]);

    const [empty] = await contractResponseConformance(SPEC, {
      'DELETE /things/{id}': () => ({ status: 204 }),
    });
    expect(empty?.issues).toEqual([]);
  });

  it('does not ask a 204 for the body a document declares for it, and reports a 200 body the document omits', async () => {
    const spec = {
      paths: {
        '/gone': {
          delete: {
            responses: {
              '204': {
                content: { 'application/json': { schema: { type: 'object', required: ['x'] } } },
              },
            },
          },
          post: { responses: { '200': { description: 'nothing' } } },
        },
      },
    };
    const results = await contractResponseConformance(spec, {
      'DELETE /gone': () => ({ status: 204 }),
      'POST /gone': () => ({ body: { ok: true } }),
    });
    expect(results).toEqual([
      expect.objectContaining({ operation: 'DELETE /gone', schemaPath: null, issues: [] }),
      expect.objectContaining({
        operation: 'POST /gone',
        issues: ['status 200 declares no body, but the handler answered one'],
      }),
    ]);
  });

  it('reports a missing body where the contract declares one', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({}),
    });
    expect(result?.issues).toHaveLength(1);
  });

  it('does not validate a non-JSON response', async () => {
    const [result] = await contractResponseConformance(SPEC, {
      'GET /text': () => ({ body: 42 }),
    });
    expect(result).toMatchObject({ schemaPath: null, issues: [] });
  });

  it('binds every path parameter to its own name unless a sample supplies it', async () => {
    const seen: MockRequest[] = [];
    const handler = vi.fn((request: MockRequest) => {
      seen.push(request);
      return { body: THING };
    });

    await contractResponseConformance(SPEC, { 'GET /things/{id}': handler });
    await contractResponseConformance(
      SPEC,
      { 'GET /things/{id}': handler },
      { 'GET /things/{id}': { params: { id: 'a b' }, query: new URLSearchParams('x=1') } }
    );

    expect(seen[0]).toMatchObject({ method: 'GET', path: '/things/id', params: { id: 'id' } });
    expect(seen[0]?.body).toBeUndefined();
    expect(seen[1]).toMatchObject({ path: '/things/a%20b', params: { id: 'a b' } });
    expect(seen[1]?.query.get('x')).toBe('1');
  });

  it('skips handler keys the document does not declare, and orders results by key', async () => {
    const results = await contractResponseConformance(SPEC, {
      'GET /things/{id}': () => ({ body: THING }),
      'GET /gone': () => ({ body: {} }),
      'DELETE /things/{id}': () => ({ status: 204 }),
    });
    expect(results.map((r) => r.operation)).toEqual(['DELETE /things/{id}', 'GET /things/{id}']);
  });

  it('names the field that failed inside a union, from the closest branch', async () => {
    const spec = {
      paths: {
        '/outcome': {
          post: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        {
                          type: 'object',
                          required: ['kind', 'count'],
                          properties: { kind: { enum: ['swept'] }, count: { type: 'integer' } },
                        },
                        {
                          type: 'object',
                          required: ['kind', 'reason'],
                          properties: { kind: { enum: ['skipped'] }, reason: { type: 'string' } },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const [result] = await contractResponseConformance(spec, {
      'POST /outcome': () => ({ body: { kind: 'swept', count: 'many' } }),
    });
    expect(result?.issues).toHaveLength(1);
    expect(result?.issues[0]).toMatch(/^count: /);

    const [bare] = await contractResponseConformance(
      {
        paths: {
          '/outcome': {
            post: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        oneOf: [
                          {
                            type: 'object',
                            required: ['kind', 'a', 'b', 'c'],
                            properties: {
                              kind: { enum: ['swept'] },
                              a: { type: 'integer' },
                              b: { type: 'integer' },
                              c: { type: 'integer' },
                            },
                          },
                          {
                            type: 'object',
                            required: ['kind', 'reason'],
                            properties: {
                              kind: { enum: ['skipped'] },
                              reason: { type: 'string' },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      { 'POST /outcome': () => ({ body: { kind: 'swept' } }) }
    );
    expect(bare?.issues.map((issue) => issue.split(':')[0])).toEqual(['a', 'b', 'c']);
  });

  it('refuses something that is not an OpenAPI document', async () => {
    await expect(contractResponseConformance({}, {})).rejects.toThrow(/no `paths` object/);
  });
});
