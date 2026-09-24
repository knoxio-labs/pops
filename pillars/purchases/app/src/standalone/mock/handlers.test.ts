import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { contractCoverage, contractResponseConformance } from '@pops/pillar-sdk/testing/api-mock';

import { ORDER_ID } from '../fixtures/order';
import { handlers } from './handlers';

/**
 * The mock layer against the contract it stands in for.
 *
 * Both directions, via `contractCoverage`: an operation with no handler is a
 * page that 501s, a handler with no operation is coverage that is not there.
 *
 * Read from the committed OpenAPI document rather than from the generated
 * client, because the document is the contract. The client is one projection
 * of it, and a projection that had dropped an operation would agree with a
 * mock layer that had dropped the same one.
 */

// `import.meta.dirname` rather than a URL: this suite runs under jsdom, where
// `import.meta.url` is an http URL and `fileURLToPath` refuses it.
const SPEC_PATH = resolve(import.meta.dirname, '../../../../openapi/purchases.openapi.json');

describe('the mock layer covers the purchases contract', () => {
  const coverage = contractCoverage(
    JSON.parse(readFileSync(SPEC_PATH, 'utf8')),
    Object.keys(handlers)
  );

  // The floor. A spec this test could not read would make every assertion
  // below vacuously true, and the suite would go green having checked nothing.
  it('reads a contract with operations in it', () => {
    expect(coverage.operations.length).toBeGreaterThan(20);
  });

  it.each(coverage.operations)('%s has a handler', (operation) => {
    expect(coverage.missing).not.toContain(operation);
  });

  it('has no handler for an operation the contract does not declare', () => {
    expect(coverage.unexpected).toEqual([]);
  });

  describe('answers every operation with a contract-shaped body', async () => {
    const conformance = await contractResponseConformance(
      JSON.parse(readFileSync(SPEC_PATH, 'utf8')),
      handlers,
      {
        'GET /purchases/{id}': { params: { id: ORDER_ID } },
        'PATCH /purchases/{id}/items/{itemId}': { params: { id: ORDER_ID, itemId: 'itm_drill' } },
        'POST /purchases/{id}/documents': { params: { id: ORDER_ID } },
        'POST /purchases/{id}/items/{itemId}/inventory-item': {
          params: { id: ORDER_ID, itemId: 'itm_drill' },
        },
        'POST /purchases/{id}/items/{itemId}/inventory-proposal': {
          params: { id: ORDER_ID, itemId: 'itm_drill' },
        },
        'PATCH /products/{productId}': { params: { productId: 'prd_drill' } },
        'PATCH /products/aliases/{aliasId}': { params: { aliasId: 'als_1' } },
        'GET /reconcile/links': {
          query: new URLSearchParams({ transactionUri: 'pops://finance/transaction/txn_5512' }),
        },
      }
    );

    it('checks every declared operation', () => {
      expect(conformance.map((result) => result.operation)).toEqual(coverage.operations);
    });

    it.each(conformance.map((result) => [result.operation, result] as const))(
      '%s',
      (_operation, { operationId, schemaPath, issues }) => {
        expect(issues, `${operationId ?? 'no operationId'} against ${schemaPath}`).toEqual([]);
      }
    );
  });

  it('returns a contract-shaped receipt extraction draft', async () => {
    const extractReceipt = handlers['POST /receipts/extract'];
    expect(extractReceipt).toBeDefined();
    if (extractReceipt === undefined) throw new Error('receipt extraction handler is missing');

    const response = await extractReceipt({
      method: 'POST',
      path: '/receipts/extract',
      params: {},
      query: new URLSearchParams(),
      body: undefined,
    });

    expect(response.body).toMatchObject({
      kind: 'draft',
      matchedMerchantEntityId: null,
    });
  });
});
