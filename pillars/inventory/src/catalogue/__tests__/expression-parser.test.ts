import { describe, expect, it } from 'vitest';

import { parseExpression } from '../expression-parser.js';

function nestedNot(depth: number): unknown {
  let expression: unknown = { op: 'literal', value: true };
  for (let index = 0; index < depth; index += 1) expression = { op: 'not', value: expression };
  return expression;
}

describe('parseExpression', () => {
  it('parses every closed node family without admitting executable syntax', () => {
    expect(
      parseExpression(
        1,
        JSON.parse(
          '{"op":"if","condition":{"op":"not","value":{"op":"literal","value":false}},"then":{"op":"add","left":{"op":"read","path":[],"fieldId":"price"},"right":{"op":"literal","value":"1.00"}},"else":{"op":"negate","value":{"op":"literal","value":"1.00"}}}'
        )
      )
    ).toMatchObject({ op: 'if' });
    expect(() =>
      parseExpression(1, { op: 'javascript', source: 'return Date.now()' })
    ).toThrowError(expect.objectContaining({ code: 'expression_op_unknown' }));
  });

  it('rejects unknown versions, excess keys, invalid literals and a third reference hop', () => {
    expect(() => parseExpression(3, { op: 'literal', value: true })).toThrowError(
      expect.objectContaining({ code: 'expression_version_unknown' })
    );
    expect(() => parseExpression(1, { op: 'literal', value: true, sql: 'select 1' })).toThrowError(
      expect.objectContaining({ code: 'expression_node_invalid' })
    );
    expect(() => parseExpression(1, { op: 'literal', value: { arbitrary: true } })).toThrowError(
      expect.objectContaining({ code: 'literal_invalid' })
    );
    expect(() =>
      parseExpression(1, { op: 'read', path: ['a', 'b', 'c'], fieldId: 'value' })
    ).toThrowError(expect.objectContaining({ code: 'reference_hops_exceeded' }));
  });

  it('accepts exactly 128 nodes and rejects the 129th', () => {
    expect(parseExpression(1, nestedNot(127))).toMatchObject({ op: 'not' });
    expect(() => parseExpression(1, nestedNot(128))).toThrowError(
      expect.objectContaining({ code: 'expression_nodes_exceeded' })
    );
  });
});
