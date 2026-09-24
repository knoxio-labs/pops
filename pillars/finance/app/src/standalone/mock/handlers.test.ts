import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contractCoverage, type MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import { contactsHandlers, contactsUnavailableHandlers } from './contacts-handlers';
import { financeHandlers } from './finance-handlers';
import { purchasesHandlers } from './purchases-handlers';

/**
 * Each handler set against the contract it stands in for, in both directions
 * (`contractCoverage`): an operation with no handler is a page that 501s, and
 * a handler with no operation is coverage that is not there.
 *
 * Read from the committed OpenAPI documents rather than from the generated
 * clients, because the documents are the contracts — finance's own, and the
 * vendored contacts and purchases snapshots the clients are generated from.
 */

// `import.meta.dirname` rather than a URL: this suite runs under jsdom, where
// `import.meta.url` is an http URL and `fileURLToPath` refuses it.
const APP_ROOT = resolve(import.meta.dirname, '../../..');

function readSpec(relative: string): unknown {
  return JSON.parse(readFileSync(resolve(APP_ROOT, relative), 'utf8'));
}

interface ContractCase {
  readonly name: string;
  readonly spec: string;
  readonly handlers: MockHandlers;
  /** A floor below the real count: a spec this could not read would make every other assertion vacuous. */
  readonly atLeast: number;
}

const CONTRACTS: readonly ContractCase[] = [
  {
    name: 'finance',
    spec: '../openapi/finance.openapi.json',
    handlers: financeHandlers,
    atLeast: 100,
  },
  {
    name: 'contacts',
    spec: 'contracts/contacts.openapi.json',
    handlers: contactsHandlers,
    atLeast: 15,
  },
  {
    name: 'contacts (absent)',
    spec: 'contracts/contacts.openapi.json',
    handlers: contactsUnavailableHandlers,
    atLeast: 15,
  },
  {
    name: 'purchases',
    spec: 'contracts/purchases.openapi.json',
    handlers: purchasesHandlers,
    atLeast: 35,
  },
];

describe.each(CONTRACTS)('the $name mock layer covers its contract', (contract) => {
  const coverage = contractCoverage(readSpec(contract.spec), Object.keys(contract.handlers));

  it('reads a contract with operations in it', () => {
    expect(coverage.operations.length).toBeGreaterThanOrEqual(contract.atLeast);
  });

  it.each(coverage.operations)('%s has a handler', (operation) => {
    expect(coverage.missing).not.toContain(operation);
  });

  it('has no handler for an operation the contract does not declare', () => {
    expect(coverage.unexpected).toEqual([]);
  });
});

describe('contacts, absent', () => {
  it.each(Object.entries(contactsUnavailableHandlers))(
    '%s answers pillar-unavailable under a 503',
    async (_key, handler) => {
      const answer = await handler({
        method: 'GET',
        path: '/',
        params: {},
        query: new URLSearchParams(),
        body: undefined,
      });
      expect(answer.status).toBe(503);
      expect(answer.body).toMatchObject({ kind: 'pillar-unavailable', moduleId: 'contacts' });
    }
  );
});
