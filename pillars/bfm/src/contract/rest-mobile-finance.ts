import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
  MobilePageLimit,
} from './rest-mobile-responses.js';
import {
  MobileAccountDetailSchema,
  MobileAccountsPageSchema,
  MobileTransactionDetailSchema,
  MobileTransactionsPageSchema,
  MobileUpstreamErrorSchema,
} from './rest-schemas.js';

const c = initContract();

export const mobileFinanceContract = c.router({
  listTransactions: {
    method: 'GET',
    path: '/mobile/finance/transactions',
    query: z.object({
      limit: MobilePageLimit,
      /**
       * Opaque continuation token from a previous page's `nextCursor`. Its
       * contents are bfm's business and may change; the app must echo it back
       * unmodified and must never construct one.
       */
      cursor: z.string().optional(),
      /**
       * Narrow the page to one account, for the account dashboard's recent
       * rows. Absent means every account, which is what the transactions
       * screen asks for.
       *
       * It pages exactly like the unfiltered list — the cursor is an anchor in
       * the ordering, not an offset — but a cursor minted under one
       * `accountId` and replayed under another names a position in a
       * different sequence. The app never does this: a filter change starts a
       * fresh page.
       */
      accountId: z.string().optional(),
    }),
    responses: {
      200: MobileTransactionsPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One cursor-paginated page of transaction list rows',
    metadata: requires('finance.transactions.read'),
  },
  getTransaction: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileTransactionDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The fuller record behind one list row, for the detail screen',
    metadata: requires('finance.transactions.read'),
  },
  listAccounts: {
    method: 'GET',
    path: '/mobile/finance/accounts',
    responses: {
      200: MobileAccountsPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Every account this device can read, active and archived alike',
    metadata: requires('finance.accounts.read'),
  },
  getAccount: {
    method: 'GET',
    path: '/mobile/finance/accounts/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileAccountDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One account and its month-end balance history, for the dashboard screen',
    metadata: requires('finance.accounts.read'),
  },
});
