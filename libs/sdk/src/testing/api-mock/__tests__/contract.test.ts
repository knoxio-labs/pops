import { describe, expect, it } from 'vitest';

import { contractCoverage, contractOperations } from '../contract.js';

const SPEC = {
  openapi: '3.1.0',
  paths: {
    '/things': {
      parameters: [{ name: 'x', in: 'query' }],
      summary: 'not an operation',
      get: {},
      post: {},
    },
    '/things/{id}': { delete: {}, patch: {}, head: {} },
  },
};

describe('contractOperations', () => {
  it('lists every HTTP operation as a sorted key and ignores path-item metadata', () => {
    expect(contractOperations(SPEC)).toEqual([
      'DELETE /things/{id}',
      'GET /things',
      'HEAD /things/{id}',
      'PATCH /things/{id}',
      'POST /things',
    ]);
  });

  it('refuses something that is not an OpenAPI document rather than reading it as empty', () => {
    expect(() => contractOperations({})).toThrow(/no `paths` object/);
    expect(() => contractOperations(null)).toThrow(/no `paths` object/);
    expect(() => contractOperations({ paths: [] })).toThrow(/no `paths` object/);
  });
});

describe('contractCoverage', () => {
  it('reports nothing for a handler set that matches exactly', () => {
    const coverage = contractCoverage(SPEC, contractOperations(SPEC));
    expect(coverage.missing).toEqual([]);
    expect(coverage.unexpected).toEqual([]);
  });

  it('reports a declared operation with no handler', () => {
    const coverage = contractCoverage(SPEC, ['GET /things', 'POST /things', 'HEAD /things/{id}']);
    expect(coverage.missing).toEqual(['DELETE /things/{id}', 'PATCH /things/{id}']);
    expect(coverage.unexpected).toEqual([]);
  });

  it('reports a handler for an operation the contract does not declare', () => {
    const coverage = contractCoverage(SPEC, [
      ...contractOperations(SPEC),
      'PUT /things',
      'GET /gone',
    ]);
    expect(coverage.missing).toEqual([]);
    expect(coverage.unexpected).toEqual(['GET /gone', 'PUT /things']);
  });

  it('treats a method spelled in the wrong case as both missing and unexpected', () => {
    const keys = contractOperations(SPEC).map((key) =>
      key === 'GET /things' ? 'get /things' : key
    );
    const coverage = contractCoverage(SPEC, keys);
    expect(coverage.missing).toEqual(['GET /things']);
    expect(coverage.unexpected).toEqual(['get /things']);
  });
});
