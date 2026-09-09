import { ORDER_ID } from './order';

import type { ReconcileQueueResponses } from '../../purchases-api/types.gen';

/**
 * Fictional throughout, following the convention in `pillars/design/src/
 * fixtures/`. Chosen to make the page's own reasoning visible rather than to
 * be the smallest payload that typechecks — a fixture where everything
 * reconciles renders a page that looks right and demonstrates nothing.
 */

/**
 * Three charges in three states: one the engine matched exactly, one it split
 * across two transactions, and one it can explain not at all. The third is the
 * one that matters — an unexplained charge has nothing to confirm or reject,
 * and the queue's keyboard bindings have to refuse rather than fire.
 */
export const RECONCILE_QUEUE: ReconcileQueueResponses[200] = {
  items: [
    {
      amountCents: 19859,
      chargeId: 'chg_4a17',
      currency: 'AUD',
      deltaCents: 0,
      merchantEntityName: 'Hardware Barn',
      orderedAt: '2026-08-14T03:12:00.000Z',
      purchaseId: ORDER_ID,
      source: 'hardware-barn',
      sourceOrderId: 'HB-2026-114872',
      proposed: [
        {
          amountCents: 19859,
          confidence: 0.98,
          linkType: 'exact',
          transactionDescription: 'HARDWARE BARN 114872',
          transactionUri: 'pops://finance/transaction/txn_5512',
        },
      ],
    },
    {
      amountCents: 8420,
      chargeId: 'chg_77b1',
      currency: 'AUD',
      deltaCents: -120,
      merchantEntityName: 'Grocer & Co',
      orderedAt: '2026-08-21T22:40:00.000Z',
      purchaseId: 'pur_3ba1',
      source: 'grocer-co',
      sourceOrderId: 'GC-88213',
      proposed: [
        {
          amountCents: 5200,
          confidence: 0.74,
          linkType: 'split',
          transactionDescription: 'GROCER AND CO 88213',
          transactionUri: 'pops://finance/transaction/txn_6011',
        },
        {
          amountCents: 3100,
          confidence: 0.61,
          linkType: 'split',
          transactionDescription: 'GROCER AND CO 88213-B',
          transactionUri: 'pops://finance/transaction/txn_6012',
        },
      ],
    },
    {
      amountCents: 4500,
      chargeId: 'chg_c003',
      currency: 'AUD',
      deltaCents: 4500,
      merchantEntityName: null,
      orderedAt: '2026-08-27T09:05:00.000Z',
      purchaseId: 'pur_c003',
      source: 'receipt-upload',
      sourceOrderId: null,
      proposed: [],
    },
  ],
};
