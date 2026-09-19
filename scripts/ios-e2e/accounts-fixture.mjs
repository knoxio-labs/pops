/**
 * The one finance account the iOS flow's transactions belong to, in the
 * shape finance's `accounts.get` returns it.
 *
 * `clients/ios/.maestro/pairing-to-transaction-detail.yaml` asserts
 * `Account, Everyday` on the transaction detail screen. That text is not read
 * off a transaction row — `pillars/bfm/src/api/finance/wire.ts` carries only
 * `accountId` on a transaction since POPS-3571, and
 * `pillars/bfm/src/api/finance/accounts-client.ts`'s `resolveAccount` /
 * `resolveAccountCurrencies` fetch this account by that id to answer the
 * display name and currency. Without this fixture and the `accounts.get`
 * route `upstream-stub.mjs` serves it on, that lookup 404s and the BFM falls
 * back to "Unknown account" — a fallback that exists for a real outage, not
 * for a harness that forgot to seed the thing it is asking about.
 *
 * Every field here is one `pillars/finance/openapi/finance.openapi.json`
 * declares required on `accounts.get`'s 200 response — see
 * `requiredResponseFields` in `upstream-stub.mjs`, and the test in
 * `scripts/__tests__/ios-e2e-upstream-stub.test.ts` that checks this fixture
 * against it. `pillars/bfm/src/api/finance/wire.ts`'s `FinanceAccountRowSchema`
 * reads only a subset of these — the rest are here because this is meant to
 * read as a real finance response, not the narrower slice one caller happens
 * to need today.
 */

/** The account every seeded transaction in `transactions-fixture.mjs` belongs to. */
export const EVERYDAY_ACCOUNT_ID = 'e2e-account-everyday';

export const seededAccounts = [
  {
    id: EVERYDAY_ACCOUNT_ID,
    name: 'Everyday',
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
    entityDisplayName: null,
    entityDisplayNameStale: false,
    entityColour: null,
    entityAvatarAssetId: null,
    resolvedEntityId: null,
    balance: {
      balanceCents: 415_150,
      asOf: '2026-03-03',
      basis: 'transactions',
      anchor: null,
      inconsistent: false,
    },
    importStatus: {
      lastImportAt: null,
      lastSyncedAt: null,
      lastBatchId: null,
      newestTransactionDate: null,
      span: null,
      cadenceDays: null,
      source: null,
    },
    transactionCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
