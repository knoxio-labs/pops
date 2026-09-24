import { ENTITY_USAGE } from '../../fixtures/entities';
import { BUDGETS, CURRENCIES, NUDGES, WISHLIST } from '../../fixtures/overview';
import { TAG_VOCABULARY } from '../../fixtures/rules';
import { TRANSACTIONS, type FixtureTransaction } from '../../fixtures/transactions';
import { created, done, notFound, ok, page } from '../respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  CurrenciesListResponses,
  DataQualityNudgesResponses,
  SettingsListResponses,
  SummaryGetResponses,
  TransactionsDeleteResponses,
  TransactionsGetResponses,
} from '../../../finance-api/types.gen';

/**
 * Transactions, budgets, the wishlist, currencies, settings and the read-only
 * roll-ups. `GET /transactions` filters by account and entity the way the
 * pillar does, because the account page and the entity page each ask for
 * their own slice and would otherwise both show the whole ledger.
 */

const [firstTransaction] = TRANSACTIONS;
const [firstBudget] = BUDGETS;
const [firstWish] = WISHLIST;
const [firstCurrency] = CURRENCIES;

const listTransactions: MockHandler = (request) => {
  const accountId = request.query.get('accountId');
  const entityId = request.query.get('entityId');
  const rows = TRANSACTIONS.filter(
    (t) =>
      (accountId === null || t.accountId === accountId) &&
      (entityId === null || t.entityId === entityId)
  );
  return { body: page(rows, request) };
};

const transactionById: MockHandler = ({ params }) => {
  const found = TRANSACTIONS.find((t) => t.id === params['id']);
  if (found === undefined) return notFound('transaction');
  const body: TransactionsGetResponses[200] = { data: found };
  return { body };
};

/** A deleted row as the pillar snapshots it for undo: stored columns, tags serialised. */
function snapshotOf(t: FixtureTransaction): TransactionsDeleteResponses[200]['snapshot'] {
  return {
    accountId: t.accountId,
    amount: t.amount,
    checksum: null,
    country: t.country,
    date: t.date,
    description: t.description,
    entityId: t.entityId,
    entityName: t.entityName,
    foreignAmountMinor: t.foreignAmountMinor,
    foreignCurrency: t.foreignCurrency,
    fxCaptureSource: t.fxCaptureSource,
    fxFeeCents: t.fxFeeCents,
    id: t.id,
    lastEditedTime: t.lastEditedTime,
    location: t.location,
    matchConfidence: null,
    matchRuleId: null,
    matchType: null,
    notes: t.notes,
    notionId: null,
    rawRow: null,
    relatedTransactionId: t.relatedTransactionId,
    tags: JSON.stringify(t.tags),
    type: t.type,
  };
}

const deleteTransaction: MockHandler = ({ params }) => {
  const found = TRANSACTIONS.find((t) => t.id === params['id']);
  if (found === undefined) return notFound('transaction');
  const body: TransactionsDeleteResponses[200] = {
    message: 'deleted',
    snapshot: snapshotOf(found),
  };
  return { body };
};

const spend = { cents: 0, transactionCount: 0 };

const EMPTY_SUMMARY: SummaryGetResponses[200]['data'] = {
  empty: true,
  currencies: ['AUD'],
  total: spend,
  previousTotal: null,
  deltaCents: null,
  deltaRatio: null,
  byAccount: [],
  byEntity: [],
  byMonth: [],
  byTag: [],
  income: {
    total: spend,
    previousTotal: null,
    deltaCents: null,
    deltaRatio: null,
    byAccount: [],
    byEntity: [],
    byMonth: [],
  },
  net: { cents: 0, byMonth: [], deltaCents: null, previousCents: null },
  inference: {
    concentration: { cents: 0, entityCount: 0, shareOfTotal: null },
    foreign: { fees: spend, spend },
    largestCharge: null,
    recurringSubscriptions: { byEntity: [], spend, tag: 'subscriptions' },
  },
  window: { key: '30d', start: null, end: '2026-09-05', previous: null },
};

const SETTINGS: SettingsListResponses[200]['data'] = [
  { key: 'finance.defaultCurrency', value: 'AUD' },
];
const [firstSetting] = SETTINGS;

export const ledgerHandlers: MockHandlers = {
  'GET /transactions': listTransactions,
  'POST /transactions': created({ data: firstTransaction, message: 'created' }),
  'GET /transactions/{id}': transactionById,
  'PATCH /transactions/{id}': ok({ data: firstTransaction, message: 'updated' }),
  'DELETE /transactions/{id}': deleteTransaction,
  'POST /transactions/restore': created({ data: firstTransaction, message: 'restored' }),
  'POST /transactions/{id}/unlink-transfer': ok({ data: firstTransaction, message: 'unlinked' }),
  'GET /transactions/suggest-tags': ok({ tags: [{ tag: 'groceries', source: 'rule' }] }),
  'GET /transactions/descriptions-preview': ok({
    data: TRANSACTIONS.map((t) => ({ description: t.description, checksum: null })),
    total: TRANSACTIONS.length,
    truncated: false,
  }),

  'GET /budgets': (request) => ({ body: page(BUDGETS, request) }),
  'POST /budgets': created({ data: firstBudget, message: 'created' }),
  'GET /budgets/{id}': ok({ data: firstBudget }),
  'PATCH /budgets/{id}': ok({ data: firstBudget, message: 'updated' }),
  'DELETE /budgets/{id}': done,

  'GET /wishlist': (request) => ({ body: page(WISHLIST, request) }),
  'POST /wishlist': created({ data: firstWish, message: 'created' }),
  'GET /wishlist/{id}': ok({ data: firstWish }),
  'PATCH /wishlist/{id}': ok({ data: firstWish, message: 'updated' }),
  'DELETE /wishlist/{id}': done,

  'GET /currencies': ok<CurrenciesListResponses[200]>({ data: CURRENCIES }),
  'POST /currencies': created({ data: firstCurrency, message: 'created' }),
  'PATCH /currencies/{code}': ok({ data: firstCurrency, message: 'updated' }),
  'DELETE /currencies/{code}': done,

  'GET /entity-usage': (request) => ({ body: page(ENTITY_USAGE, request) }),
  'GET /data-quality/nudges': ok<DataQualityNudgesResponses[200]>({ data: NUDGES }),
  'GET /summary': ok<SummaryGetResponses[200]>({ data: EMPTY_SUMMARY }),
  'GET /tag-rules/vocabulary': ok({ tags: TAG_VOCABULARY }),
  'POST /search': ok({ hits: [] }),

  'GET /settings': ok<SettingsListResponses[200]>({ data: SETTINGS }),
  'POST /settings/get-many': ok({ settings: {} }),
  'POST /settings/set-many': ok({ settings: {} }),
  'POST /settings/reset': ok({ reset: [], settings: {} }),
  'GET /settings/{key}': ok({ data: firstSetting }),
  'PUT /settings/{key}': ok({ data: firstSetting, message: 'saved' }),
  'POST /settings/{key}/ensure': ok({ data: firstSetting }),
  'POST /settings/{key}/reset': ok({ data: firstSetting, message: 'reset' }),
};
