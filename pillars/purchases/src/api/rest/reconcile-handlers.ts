/**
 * Handlers for the `reconcile.*` ts-rest sub-router.
 */
import { confirmLink, listReconcileQueue, rejectLink, unlinkCharge } from '../../db/index.js';
import { nowIso } from '../../db/services/internal.js';

import type { z } from 'zod';

import type { ReconcileQueueQuerySchema } from '../../contract/rest-reconcile.js';
import type { PurchasesDb, QueueEntry } from '../../db/index.js';
import type { SweepOutcome } from '../../reconcile/sweep.js';

type QueueQuery = z.infer<typeof ReconcileQueueQuerySchema>;
type Decision = { chargeId: string; transactionUri: string };

/** What the route needs from the runner, without importing its scheduling. */
export type SweepTrigger = (scope: { source?: string }) => Promise<SweepOutcome>;

function missingLink(decision: Decision) {
  return {
    status: 404 as const,
    body: {
      message:
        `No link between charge ${decision.chargeId} and ${decision.transactionUri}. ` +
        `A sweep may have re-derived it since the queue was read.`,
      code: 'link_not_found',
    },
  };
}

function toWireEntries(entries: readonly QueueEntry[]) {
  return entries.map((entry) => ({
    ...entry,
    proposed: entry.proposed.map((link) => ({ ...link })),
  }));
}

export function makeReconcileHandlers(db: PurchasesDb, sweep?: SweepTrigger) {
  return {
    queue: async ({ query }: { query: QueueQuery }) => ({
      status: 200 as const,
      body: {
        // Copied out of the readonly service shape into the mutable one the
        // wire schema describes.
        items: toWireEntries(
          listReconcileQueue(db, {
            ...(query.source === undefined ? {} : { source: query.source }),
            ...(query.kind === undefined ? {} : { kind: query.kind }),
            ...(query.includeAuto === undefined ? {} : { includeAuto: query.includeAuto }),
            ...(query.limit === undefined ? {} : { limit: query.limit }),
            ...(query.offset === undefined ? {} : { offset: query.offset }),
          })
        ),
      },
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
          body: { message: 'No sweep runner is configured', code: 'sweep_unavailable' },
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
