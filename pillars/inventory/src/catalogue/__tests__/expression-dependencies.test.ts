import { describe, expect, it } from 'vitest';

import {
  assertAcyclicExpressionGraph,
  collectInvalidatedExpressions,
} from '../expression-dependencies.js';

describe('expression dependency graph', () => {
  it('collects transitive invalidations without including unrelated definitions', () => {
    const graph = new Map([
      ['type:subtotal', new Set(['type:price'])],
      ['type:total', new Set(['type:subtotal'])],
      ['type:label', new Set(['type:name'])],
    ]);
    expect(collectInvalidatedExpressions(graph, [{ typeId: 'type', fieldId: 'price' }])).toEqual(
      new Set(['type:subtotal', 'type:total'])
    );
  });

  it('accepts a DAG and rejects a transitive cycle', () => {
    expect(() =>
      assertAcyclicExpressionGraph(
        new Map([
          ['type:a', new Set(['type:b'])],
          ['type:b', new Set(['type:stored'])],
        ])
      )
    ).not.toThrow();
    expect(() =>
      assertAcyclicExpressionGraph(
        new Map([
          ['type:a', new Set(['type:b'])],
          ['type:b', new Set(['type:c'])],
          ['type:c', new Set(['type:a'])],
        ])
      )
    ).toThrowError(expect.objectContaining({ code: 'expression_cycle' }));
  });
});
