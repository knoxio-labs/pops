/**
 * Whether saving a version-1 computed field as version 2 changes what it
 * evaluates to (POPS-4525). Version 2 only widens what validates and
 * evaluates (unit conversion, derived units) and compares decimals by value
 * where version 1 compares their spelling; every other version-1 vector
 * evaluates identically. The web builder therefore keeps a version-1 field
 * on version 1 unless an edit needs units.
 */
import { describe, expect, it } from 'vitest';

import { buildExpressionVector } from '../sync/computed-vectors/build.js';
import { EXPRESSION_VECTOR_CASES } from '../sync/computed-vectors/cases.js';

import type { ExpressionVector } from '../sync/computed-vectors/build.js';

const versionOne = EXPRESSION_VECTOR_CASES.filter(
  (vectorCase) => (vectorCase.expressionVersion ?? 1) === 1
);

function refusedOrFailed(expected: ExpressionVector['expected']): boolean {
  return expected.outcome === 'rejected' || expected.evaluationErrorCode !== null;
}

function changedUnderVersionTwo() {
  return versionOne.flatMap((vectorCase) => {
    const one = buildExpressionVector(vectorCase).expected;
    const two = buildExpressionVector({ ...vectorCase, expressionVersion: 2 }).expected;
    return JSON.stringify(one) === JSON.stringify(two) ? [] : [{ name: vectorCase.name, one }];
  });
}

describe('expression version 1 against version 2', () => {
  const changed = changedUnderVersionTwo();

  it('covers a meaningful share of the version-1 vectors', () => {
    expect(versionOne.length).toBeGreaterThan(100);
  });

  it('evaluates every accepted version-1 vector identically, except decimal equality', () => {
    const accepted = changed.filter((entry) => !refusedOrFailed(entry.one)).map((e) => e.name);
    expect(accepted.toSorted()).toEqual(
      [
        'equal decimals compare spelling, not magnitude',
        'v1 equal compares a product by spelling: 1.5 × 2 = 3 is false',
        'v1 equal compares negative zero by spelling',
        'v1 equal compares read decimals by spelling',
      ].toSorted()
    );
  });

  it('changes a refused or failing version-1 vector only by accepting unit work', () => {
    const refused = changed.filter((entry) => refusedOrFailed(entry.one)).map((e) => e.name);
    expect(refused.toSorted()).toEqual(
      [
        'a measurement result in another unit is an evaluation error',
        'measurement add across units is an evaluation error',
        'version 1 still refuses a result in another unit of the same dimension',
        'version 1 still refuses measurement × measurement',
      ].toSorted()
    );
  });
});
