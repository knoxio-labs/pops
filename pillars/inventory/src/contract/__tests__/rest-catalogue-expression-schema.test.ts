import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { parseExpression } from '../../catalogue/expression-parser.js';
import { ELSE_KEY, ExpressionV1Schema, THEN_KEY } from '../rest-catalogue-expression-schema.js';

/**
 * Regression coverage for the published `ExpressionV1` wire contract's `if`
 * node. It previously required `thenBranch`/`elseBranch` — the parsed-AST
 * field names `expression-types.ts` uses — while `expression-parser.ts`'s
 * `parseConditional` validates incoming JSON with `exactKeys(value,
 * ['condition', 'else', 'op', 'then'], path)`. A field published through the
 * documented contract with an `if` expression would store the wrong keys and
 * fail at publish time with `expression_node_invalid`. These tests fail
 * against that shape and pass against the parser's real wire keys.
 */
describe('ExpressionV1Schema', () => {
  it('accepts an if-expression using the parser real then/else wire keys, matching parseExpression', () => {
    const wire = {
      op: 'if',
      condition: { op: 'literal', value: true },
      [THEN_KEY]: { op: 'read', path: [], fieldId: randomUUID() },
      [ELSE_KEY]: { op: 'literal', value: 0 },
    };
    expect(ExpressionV1Schema.parse(wire)).toEqual(wire);
    expect(parseExpression(1, wire)).toMatchObject({ op: 'if' });
  });

  it('rejects thenBranch/elseBranch, the parsed-AST field names rather than the wire keys', () => {
    const wrong = {
      op: 'if',
      condition: { op: 'literal', value: true },
      thenBranch: { op: 'literal', value: 1 },
      elseBranch: { op: 'literal', value: 0 },
    };
    expect(ExpressionV1Schema.safeParse(wrong).success).toBe(false);
    expect(() => parseExpression(1, wrong)).toThrowError(
      expect.objectContaining({ code: 'expression_node_invalid' })
    );
  });

  it('round-trips every other node family the parser accepts', () => {
    const fieldId = randomUUID();
    const wire = {
      op: 'add',
      left: { op: 'read', path: [], fieldId },
      right: { op: 'negate', value: { op: 'literal', value: 1 } },
    };
    expect(ExpressionV1Schema.parse(wire)).toEqual(wire);
    expect(parseExpression(1, wire)).toMatchObject({ op: 'add' });
  });

  it('rejects a decimal literal, matching the parser own safe-integer-only rule', () => {
    const wire = { op: 'literal', value: 2.5 };
    expect(ExpressionV1Schema.safeParse(wire).success).toBe(false);
    expect(() => parseExpression(1, wire)).toThrowError(
      expect.objectContaining({ code: 'expression_node_invalid' })
    );
  });
});
