import type { LinkType } from '@/fixtures/purchases-vocabulary';

/**
 * Fictional data for the reconcile queue (`/purchases`), shaped like
 * `GET /reconcile/queue`'s 200 response
 * (the generated `ReconcileQueueResponses`). Typed locally
 * rather than imported — the playground reaches no pillar contract — so this
 * mirrors the wire shape by hand and will drift if the real one changes.
 *
 * The set exists to show the queue working, not just the happy path: a
 * charge with no merchant, one with more than one proposed link, a
 * big-ticket amount, and a charge that has sat unexplained for months.
 */

export type { LinkType } from '@/fixtures/purchases-vocabulary';

/** One unconfirmed link: a transaction the engine thinks settles the charge. */
export interface ProposedLink {
  transactionUri: string;
  amountCents: number;
  linkType: LinkType;
  /** 0..1. The server never sends exactly 0 or 1 for a derived link. */
  confidence: number;
}

/** One charge awaiting a decision, with everything the engine proposes for it. */
export interface QueueEntry {
  chargeId: string;
  purchaseId: string;
  /** Free text naming the importer, e.g. `amazon`, `coles`, `manual`. */
  source: string;
  sourceOrderId: string | null;
  merchantEntityName: string | null;
  orderedAt: string;
  amountCents: number;
  currency: string;
  /**
   * `Σ proposed − amountCents`, so an unexplained charge carries the whole
   * charge as a negative rather than zero: nothing proposed is short by the
   * full amount, and zero would read as balanced.
   */
  deltaCents: number;
  proposed: ProposedLink[];
  /**
   * Whether `source` is one `includeAuto` normally filters out. Grocery and
   * other high-volume feeds auto-link on import (ADR-042); the queue hides
   * them by default so the inbox stays about charges that actually need a
   * human.
   */
  autoLinkedSource: boolean;
}

export const purchasesQueue: QueueEntry[] = [
  {
    chargeId: 'chg_01K5Q1XN4E7K2M9V3ZB6TY',
    purchaseId: 'pur_01K5Q1XN4E7K2M9V3ZB6TY',
    source: 'bunnings',
    sourceOrderId: 'BW-88213409',
    merchantEntityName: 'Bunnings Warehouse',
    orderedAt: '2026-09-05',
    amountCents: 15_600,
    currency: 'AUD',
    deltaCents: 0,
    autoLinkedSource: false,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_9f2a1c',
        amountCents: 15_600,
        linkType: 'exact',
        confidence: 0.98,
      },
    ],
  },
  {
    chargeId: 'chg_01K5Q0T3Z8N5R2QWY7JHEQ',
    purchaseId: 'pur_01K5Q0T3Z8N5R2QWY7JHEQ',
    source: 'email',
    sourceOrderId: null,
    merchantEntityName: null,
    orderedAt: '2026-09-04',
    amountCents: 4_250,
    currency: 'AUD',
    deltaCents: -1_250,
    autoLinkedSource: false,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_7b6e40',
        amountCents: 3_000,
        linkType: 'rule',
        confidence: 0.41,
      },
    ],
  },
  {
    chargeId: 'chg_01K5Q2M6B4H7C1XKD9PFAW',
    purchaseId: 'pur_01K5Q2M6B4H7C1XKD9PFAW',
    source: 'amazon',
    sourceOrderId: '112-5566341-9982746',
    merchantEntityName: 'Amazon AU',
    orderedAt: '2026-09-03',
    amountCents: 289_900,
    currency: 'AUD',
    deltaCents: 40_000,
    autoLinkedSource: false,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_2c88df',
        amountCents: 249_900,
        linkType: 'partial',
        confidence: 0.72,
      },
      {
        transactionUri: 'finance://transaction/txn_a015e2',
        amountCents: 80_000,
        linkType: 'manual',
        confidence: 1,
      },
    ],
  },
  {
    chargeId: 'chg_01K5Q3F7Y2W9J3HNRK6BMS',
    purchaseId: 'pur_01K5Q3F7Y2W9J3HNRK6BMS',
    source: 'ikea',
    sourceOrderId: 'IK-004471822',
    merchantEntityName: 'IKEA',
    orderedAt: '2026-09-02',
    amountCents: 62_400,
    currency: 'AUD',
    deltaCents: -12_400,
    autoLinkedSource: false,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_5e11ab',
        amountCents: 30_000,
        linkType: 'split',
        confidence: 0.63,
      },
      {
        transactionUri: 'finance://transaction/txn_5e11ac',
        amountCents: 20_000,
        linkType: 'split',
        confidence: 0.63,
      },
    ],
  },
  {
    chargeId: 'chg_01K5Q4K9M1P4D6P8SXV2QJ',
    purchaseId: 'pur_01K5Q4K9M1P4D6P8SXV2QJ',
    source: 'coles',
    sourceOrderId: 'CLS-77231',
    merchantEntityName: 'Coles',
    orderedAt: '2026-09-05',
    amountCents: 8_423,
    currency: 'AUD',
    deltaCents: 0,
    autoLinkedSource: true,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_bb44f0',
        amountCents: 8_423,
        linkType: 'exact',
        confidence: 0.95,
      },
    ],
  },
  {
    chargeId: 'chg_01K5Q52T9V3ZR8QWY0MBHK',
    purchaseId: 'pur_01K5Q52T9V3ZR8QWY0MBHK',
    source: 'manual',
    sourceOrderId: null,
    merchantEntityName: 'Sample Coffee',
    orderedAt: '2026-02-11',
    amountCents: 540,
    currency: 'AUD',
    deltaCents: -540,
    autoLinkedSource: false,
    proposed: [],
  },
  {
    chargeId: 'chg_01K5Q6H2N7T4W1QXY8DMRZ',
    purchaseId: 'pur_01K5Q6H2N7T4W1QXY8DMRZ',
    source: 'kmart',
    sourceOrderId: 'KM-330198',
    merchantEntityName: 'Kmart',
    orderedAt: '2026-09-01',
    amountCents: 1_999,
    currency: 'AUD',
    deltaCents: 0,
    autoLinkedSource: false,
    proposed: [
      {
        transactionUri: 'finance://transaction/txn_c39d21',
        amountCents: 1_999,
        linkType: 'combined',
        confidence: 0.87,
      },
    ],
  },
];

/**
 * Every charge here already carries a proposal, so filtering this set down
 * to "Unexplained" finds nothing — the filter-flavored empty state, not a
 * queue with nothing in it.
 */
export const allProposedQueue: QueueEntry[] = purchasesQueue.filter(
  (entry) => entry.proposed.length > 0
);

/**
 * A page that came back full, so the truncation notice can be read at the
 * size it really carries rather than at a number invented to fit seven rows.
 *
 * The seven above are cycled with fresh charge ids; every clone keeps its
 * original's arithmetic, so a row read out of this page says the same thing
 * as the row it came from.
 */
export function fullQueuePage(size: number): QueueEntry[] {
  return Array.from({ length: size }, (_, index) => {
    const entry = purchasesQueue[index % purchasesQueue.length];
    if (entry === undefined) throw new Error('the queue fixture is empty');
    return index < purchasesQueue.length
      ? entry
      : {
          ...entry,
          chargeId: `${entry.chargeId}-${index}`,
          purchaseId: `${entry.purchaseId}-${index}`,
        };
  });
}
