import { describe, expect, it } from 'vitest';

import { buildMatchExpression, tokenizeQuery } from '../lexical-query.js';

describe('tokenizeQuery', () => {
  it('keeps the content words of a question and drops its function words', () => {
    expect(tokenizeQuery('What did I decide about the Karbon migration?')).toEqual([
      'decide',
      'karbon',
      'migration',
    ]);
  });

  it('searches a query made only of function words as typed', () => {
    expect(tokenizeQuery('who are you')).toEqual(['who', 'are', 'you']);
  });

  it('drops repeated terms', () => {
    expect(tokenizeQuery('karbon Karbon KARBON')).toEqual(['karbon']);
  });

  it('keeps accented letters and digits inside a term', () => {
    expect(tokenizeQuery('migração POPS-5345')).toEqual(['migração', 'pops', '5345']);
  });

  it('caps the number of terms', () => {
    const many = Array.from({ length: 80 }, (_, i) => `term${i}`).join(' ');
    expect(tokenizeQuery(many)).toHaveLength(32);
  });
});

describe('buildMatchExpression', () => {
  it('quotes every term and joins them with OR', () => {
    expect(buildMatchExpression('karbon migration')).toBe('"karbon" OR "migration"');
  });

  it('returns null when nothing searchable is left', () => {
    expect(buildMatchExpression('')).toBeNull();
    expect(buildMatchExpression('"* - : ( ) ^')).toBeNull();
  });

  it.each([
    ['"karbon"', '"karbon"'],
    ['karbon*', '"karbon"'],
    ['-karbon', '"karbon"'],
    ['title:karbon', '"title" OR "karbon"'],
    ['(karbon)', '"karbon"'],
    ['karbon NEAR migration', '"karbon" OR "near" OR "migration"'],
    ['karbon NOT migration', '"karbon" OR "not" OR "migration"'],
    ['karbon AND migration OR cluster', '"karbon" OR "migration" OR "cluster"'],
    ['karbon" OR "x', '"karbon" OR "x"'],
  ])('turns %s into plain quoted terms', (query, expected) => {
    expect(buildMatchExpression(query)).toBe(expected);
  });

  it('never emits a quote, operator character or bare word outside a quoted term', () => {
    const expression = buildMatchExpression('a"b*c-d:e(f)g^h NEAR/2 {col}: +x') ?? '';
    expect(expression.replaceAll(/"[\p{L}\p{N}]+"/gu, '').replaceAll(' OR ', '')).toBe('');
  });
});
