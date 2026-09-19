import { describe, expect, it } from 'vitest';

import {
  buildContractScopeMap,
  hasScopeFor,
  resolveContractScope,
} from '../service-account-scope.js';

describe('hasScopeFor', () => {
  it('matches an exact grant', () => {
    expect(hasScopeFor(['finance.transactions.list'], 'finance.transactions.list')).toBe(true);
  });

  it('matches by dot prefix', () => {
    expect(hasScopeFor(['finance.transactions'], 'finance.transactions.list')).toBe(true);
  });

  it('does not let a prefix leak into a sibling module', () => {
    expect(hasScopeFor(['finance.transactions'], 'finance.budgets.list')).toBe(false);
  });

  it('does not treat a shared string prefix as a scope prefix', () => {
    expect(hasScopeFor(['finance.trans'], 'finance.transactions.list')).toBe(false);
  });

  it('authorises nothing on an empty grant', () => {
    expect(hasScopeFor([], 'finance.transactions.list')).toBe(false);
  });

  it('does not let a pillar-wide grant on one pillar reach another', () => {
    expect(hasScopeFor(['finance'], 'inventory.items.delete')).toBe(false);
  });
});

/** A miniature ts-rest-shaped router: nested plain objects, route leaves. */
const contract = {
  transactions: {
    list: { method: 'GET', path: '/transactions' },
    get: { method: 'GET', path: '/transactions/:id' },
    search: { method: 'GET', path: '/transactions/search' },
    update: { method: 'PATCH', path: '/transactions/:id' },
  },
  budgets: {
    list: { method: 'get', path: '/budgets' },
  },
};

describe('buildContractScopeMap', () => {
  it('projects every leaf onto a dotted scope under the root', () => {
    const map = buildContractScopeMap(contract, 'finance');
    expect(map.routes).toEqual(
      expect.arrayContaining([
        { method: 'GET', path: '/transactions', scope: 'finance.transactions.list' },
        { method: 'GET', path: '/transactions/:id', scope: 'finance.transactions.get' },
        { method: 'PATCH', path: '/transactions/:id', scope: 'finance.transactions.update' },
        { method: 'GET', path: '/budgets', scope: 'finance.budgets.list' },
      ])
    );
  });

  it('finds every leaf, so a new route cannot be added ungated by omission', () => {
    expect(buildContractScopeMap(contract, 'finance').routes).toHaveLength(5);
  });

  it('throws when two literal routes collide once case-folded, instead of silently overwriting one', () => {
    const collidingContract = {
      transactions: {
        list: { method: 'GET', path: '/transactions' },
      },
      legacyTransactions: {
        list: { method: 'GET', path: '/TRANSACTIONS' },
      },
    };
    expect(() => buildContractScopeMap(collidingContract, 'finance')).toThrow(/already registered/);
  });
});

describe('resolveContractScope', () => {
  const map = buildContractScopeMap(contract, 'finance');

  it('resolves a literal path', () => {
    expect(resolveContractScope(map, 'GET', '/transactions')).toBe('finance.transactions.list');
  });

  it('resolves a parameterised path', () => {
    expect(resolveContractScope(map, 'GET', '/transactions/abc-123')).toBe(
      'finance.transactions.get'
    );
  });

  it('prefers a literal route over a parameterised one that also matches', () => {
    expect(resolveContractScope(map, 'GET', '/transactions/search')).toBe(
      'finance.transactions.search'
    );
  });

  it('discriminates on method', () => {
    expect(resolveContractScope(map, 'PATCH', '/transactions/abc')).toBe(
      'finance.transactions.update'
    );
  });

  it('normalises the declared method case', () => {
    expect(resolveContractScope(map, 'GET', '/budgets')).toBe('finance.budgets.list');
  });

  it('tolerates a trailing slash, which Express routes non-strictly', () => {
    expect(resolveContractScope(map, 'GET', '/transactions/')).toBe('finance.transactions.list');
  });

  it('does not match a deeper path against a parameterised segment', () => {
    expect(resolveContractScope(map, 'GET', '/transactions/abc/splits')).toBeUndefined();
  });

  it('returns undefined for a path outside the contract', () => {
    expect(resolveContractScope(map, 'GET', '/health')).toBeUndefined();
  });

  it('ignores case on a literal path, because Express routes `/TRANSACTIONS` to `/transactions`', () => {
    expect(resolveContractScope(map, 'GET', '/TRANSACTIONS')).toBe('finance.transactions.list');
    expect(resolveContractScope(map, 'GET', '/Budgets/')).toBe('finance.budgets.list');
  });

  it('ignores case on a parameterised path', () => {
    expect(resolveContractScope(map, 'PATCH', '/Transactions/abc')).toBe(
      'finance.transactions.update'
    );
  });

  it('keeps literal-over-pattern precedence when the case differs', () => {
    expect(resolveContractScope(map, 'GET', '/transactions/SEARCH')).toBe(
      'finance.transactions.search'
    );
  });

  it('resolves a HEAD as the GET it shares a path with, because Express runs the GET handler', () => {
    expect(resolveContractScope(map, 'HEAD', '/transactions')).toBe('finance.transactions.list');
    expect(resolveContractScope(map, 'head', '/transactions/abc')).toBe('finance.transactions.get');
  });

  it('does not stretch HEAD onto a path only a non-GET route declares', () => {
    const writeOnly = buildContractScopeMap(
      { sync: { push: { method: 'POST', path: '/sync' } } },
      'finance'
    );
    expect(resolveContractScope(writeOnly, 'HEAD', '/sync')).toBeUndefined();
  });

  it('prefers a declared HEAD route over the GET beside it', () => {
    const withHead = buildContractScopeMap(
      {
        blobs: {
          probe: { method: 'HEAD', path: '/blobs/:id' },
          get: { method: 'GET', path: '/blobs/:id' },
        },
      },
      'finance'
    );
    expect(resolveContractScope(withHead, 'HEAD', '/blobs/x')).toBe('finance.blobs.probe');
  });
});
