/**
 * Handlers for the `reconcile.*` ts-rest sub-router.
 */
import { FINANCE_TRANSACTION_URI } from '../../contract/schemas/scalars.js';
import {
  confirmLink,
  listPurchasesForTransaction,
  listReconcileQueue,
  rejectLink,
  summariseLinksForTransactions,
  unlinkCharge,
} from '../../db/index.js';
import { nowIso } from '../../db/services/internal.js';
import { purchaseErrorBody } from '../errors.js';
import { toPurchaseChargeLinkBody } from './serializers.js';

import type { z } from 'zod';

import type { TransactionLinksBatchBodySchema } from '../../contract/rest-reconcile-batch.js';
import type {
  ReconcileQueueQuerySchema,
  TransactionLinksQuerySchema,
} from '../../contract/rest-reconcile.js';
import type { LinkedPurchase, PurchasesDb, QueueEntry } from '../../db/index.js';
import type { SweepOutcome } from '../../reconcile/sweep.js';
import type { FinanceTransactionLookup } from '../finance/client.js';
import type { CandidateTransaction } from '../finance/wire.js';

type QueueQuery = z.infer<typeof ReconcileQueueQuerySchema>;
type TransactionLinksQuery = z.infer<typeof TransactionLinksQuerySchema>;
type TransactionLinksBatchBody = z.infer<typeof TransactionLinksBatchBodySchema>;
type Decision = { chargeId: string; transactionUri: string };

/** What the route needs from the runner, without importing its scheduling. */
export type SweepTrigger = (scope: { source?: string }) => Promise<SweepOutcome>;

function missingLink(decision: Decision) {
  return {
    status: 404 as const,
    body: purchaseErrorBody('link_not_found', {
      message:
        `No link between charge ${decision.chargeId} and ${decision.transactionUri}. ` +
        `A sweep may have re-derived it since the queue was read.`,
    }),
  };
}

function financeTransactionIds(entries: readonly QueueEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    for (const link of entry.proposed) {
      const id = link.transactionUri.match(FINANCE_TRANSACTION_URI)?.[1];
      if (id !== undefined) ids.add(id);
    }
  }
  return [...ids];
}

async function queueTransactionDetails(
  financeTransactionLookup: FinanceTransactionLookup | undefined,
  ids: readonly string[]
): Promise<ReadonlyMap<string, CandidateTransaction>> {
  if (financeTransactionLookup === undefined || ids.length === 0) return new Map();

  try {
    const result = await financeTransactionLookup.fetchTransactionsByIds(ids);
    if (result.kind !== 'ok') return new Map();
    return new Map(result.transactions.map((transaction) => [transaction.id, transaction]));
  } catch {
    return new Map();
  }
}

function toWireEntries(
  entries: readonly QueueEntry[],
  transactionsById: ReadonlyMap<string, CandidateTransaction>
) {
  return entries.map((entry) => ({
    ...entry,
    proposed: entry.proposed.map((link) => {
      const id = link.transactionUri.match(FINANCE_TRANSACTION_URI)?.[1];
      const transaction = id === undefined ? undefined : transactionsById.get(id);
      return {
        ...link,
        transactionDate: transaction?.date ?? null,
        transactionPayee: transaction?.entityName ?? null,
      };
    }),
  }));
}

function toWireLinkedPurchases(entries: readonly LinkedPurchase[]) {
  return entries.map((entry) => ({
    purchase: entry.purchase,
    charges: entry.charges.map((charge) => ({
      charge: charge.charge,
      link: toPurchaseChargeLinkBody(charge.link),
    })),
    linkedCents: entry.linkedCents,
  }));
}

/** Builds reconciliation routes and optionally decorates queue proposals with Finance details. */
export function makeReconcileHandlers(
  db: PurchasesDb,
  sweep?: SweepTrigger,
  financeTransactionLookup?: FinanceTransactionLookup
) {
  return {
    queue: async ({ query }: { query: QueueQuery }) => {
      const entries = listReconcileQueue(db, {
        ...(query.source === undefined ? {} : { source: query.source }),
        ...(query.kind === undefined ? {} : { kind: query.kind }),
        ...(query.includeAuto === undefined ? {} : { includeAuto: query.includeAuto }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.offset === undefined ? {} : { offset: query.offset }),
      });
      const ids = financeTransactionIds(entries);
      const transactionsById = await queueTransactionDetails(financeTransactionLookup, ids);
      return {
        status: 200 as const,
        body: {
          // Copied out of the readonly service shape into the mutable one the
          // wire schema describes.
          items: toWireEntries(entries, transactionsById),
        },
      };
    },

    links: async ({ query }: { query: TransactionLinksQuery }) => ({
      status: 200 as const,
      body: {
        // Echoed back so a response is self-describing once it has been
        // passed around, cached or logged away from the request that
        // produced it.
        transactionUri: query.transactionUri,
        purchases: toWireLinkedPurchases(listPurchasesForTransaction(db, query.transactionUri)),
      },
    }),

    linksBatch: async ({ body }: { body: TransactionLinksBatchBody }) => ({
      status: 200 as const,
      // Copied because the service answers with a readonly array and the wire
      // body ts-rest validates against is a mutable one.
      body: { transactions: [...summariseLinksForTransactions(db, body.transactionUris)] },
    }),

    confirm: async ({ body }: { body: Decision }) => {
      const outcome = confirmLink(db, body.chargeId, body.transactionUri, nowIso());
      // 404 rather than a silent success: the link the user was looking at
      // is gone, and telling them it was confirmed would be a lie they only
      // discover when it reappears in the queue.
      if (!outcome.pinned) return missingLink(body);
      return {
        status: 200 as const,
        body: { ok: true as const, matchRuleId: outcome.matchRuleId },
      };
    },

    unlink: async ({ body }: { body: Decision }) => {
      const removed = unlinkCharge(db, body.chargeId, body.transactionUri);
      if (!removed) return missingLink(body);
      return { status: 200 as const, body: { ok: true as const } };
    },

    reject: async ({ body }: { body: Decision }) => {
      const rejected = rejectLink(db, body.chargeId, body.transactionUri, nowIso());
      if (!rejected) return missingLink(body);
      return { status: 200 as const, body: { ok: true as const } };
    },

    sweep: async ({ body }: { body?: { source?: string } }) => {
      if (sweep === undefined) {
        // No runner wired — the pillar is serving reads but nothing drives
        // reconciliation, which a caller must be able to tell apart from a
        // sweep that ran and found nothing.
        return {
          status: 503 as const,
          body: purchaseErrorBody('sweep_unavailable', {
            message: 'No sweep runner is configured',
          }),
        };
      }

      const outcome = await sweep(body?.source === undefined ? {} : { source: body.source });
      if (outcome.kind === 'skipped') {
        return { status: 200 as const, body: { kind: 'skipped' as const, reason: outcome.reason } };
      }
      return {
        status: 200 as const,
        body: {
          kind: 'swept' as const,
          chargesConsidered: outcome.chargesConsidered,
          derivedChargesMinted: outcome.derivedChargesMinted,
          linksTornDown: outcome.linksTornDown,
          linksWritten: outcome.linksWritten,
          reviewCount: outcome.review.length,
        },
      };
    },
  };
}
