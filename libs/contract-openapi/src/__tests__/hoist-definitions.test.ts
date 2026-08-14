import { describe, expect, it } from 'vitest';

import { hoistRecursiveDefinitions } from '../hoist-definitions.js';

describe('hoistRecursiveDefinitions', () => {
  it('lifts a nested `definitions` block to components.schemas and drops it in place', () => {
    const document: Record<string, unknown> = {
      paths: {
        '/tree': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/definitions/Node',
                      definitions: { Node: { type: 'object' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    hoistRecursiveDefinitions(document);

    expect(document).toEqual({
      components: { schemas: { Node: { type: 'object' } } },
      paths: {
        '/tree': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Node' },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it('lifts `$defs` under the same rewrite', () => {
    const document: Record<string, unknown> = {
      paths: {
        '/a': { schema: { $ref: '#/$defs/Leaf', $defs: { Leaf: { type: 'string' } } } },
      },
    };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({ schemas: { Leaf: { type: 'string' } } });
  });

  it('rewrites refs outside `paths` too — collection walks paths, rewriting walks the document', () => {
    const document: Record<string, unknown> = {
      components: { schemas: { Wrapper: { $ref: '#/definitions/Node' } } },
      paths: {},
    };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({
      schemas: { Wrapper: { $ref: '#/components/schemas/Node' } },
    });
  });

  it('walks into arrays', () => {
    const document: Record<string, unknown> = {
      paths: {
        '/a': {
          parameters: [
            { schema: { $ref: '#/definitions/P', definitions: { P: { type: 'number' } } } },
          ],
        },
      },
    };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({ schemas: { P: { type: 'number' } } });
  });

  it('preserves an existing components.schemas rather than replacing it', () => {
    const document: Record<string, unknown> = {
      components: { schemas: { Existing: { type: 'boolean' } } },
      paths: { '/a': { schema: { definitions: { New: { type: 'null' } } } } },
    };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({
      schemas: { Existing: { type: 'boolean' }, New: { type: 'null' } },
    });
  });

  it('materialises an empty components.schemas when there is nothing to hoist', () => {
    const document: Record<string, unknown> = { paths: { '/a': { get: {} } } };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({ schemas: {} });
  });

  it('leaves refs that point at neither definitions nor $defs alone', () => {
    const document: Record<string, unknown> = {
      paths: { '/a': { schema: { $ref: '#/components/schemas/Already' } } },
    };

    hoistRecursiveDefinitions(document);

    expect(document['paths']).toEqual({
      '/a': { schema: { $ref: '#/components/schemas/Already' } },
    });
  });

  it('does not hoist definitions nested inside a definitions block it already lifted', () => {
    const document: Record<string, unknown> = {
      paths: {
        '/a': {
          schema: { definitions: { Outer: { definitions: { Inner: { type: 'string' } } } } },
        },
      },
    };

    hoistRecursiveDefinitions(document);

    expect(document['components']).toEqual({
      schemas: { Outer: { definitions: { Inner: { type: 'string' } } } },
    });
  });
});
