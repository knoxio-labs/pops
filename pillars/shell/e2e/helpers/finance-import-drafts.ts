/**
 * `/finance-api/import-drafts*` stubs for the wizard specs (finance ADR-005).
 *
 * The wizard writes its state through to a server draft from the first
 * parsed rows onwards, so a spec that walks it needs these routes answered
 * or every step is followed by a failed save. The shapes are hand-mirrored
 * from `pillars/finance/src/contract/rest-import-drafts-schemas.ts`, the
 * way the other finance stubs mirror theirs, and validated on the way out
 * so a drift in the pillar's contract reddens the spec rather than passing
 * a body the app would not accept.
 */
import { z } from 'zod';

import { fulfilWith, json } from './pillar-rest';

import type { Page, Route } from '@playwright/test';

export const ImportDraftSummarySchema = z
  .object({
    id: z.string(),
    accountId: z.string(),
    source: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('file'),
          dialectId: z.string().nullable(),
          fileNames: z.array(z.string()),
        })
        .strict(),
      z.object({ kind: z.literal('live'), provider: z.literal('up') }).strict(),
    ]),
    state: z.enum(['saved', 'live', 'open', 'left-open', 'unusable']),
    step: z.number().int().nullable(),
    rowCount: z.number().int(),
    unresolvedCount: z.number().int(),
    span: z.object({ from: z.string(), to: z.string() }).strict().nullable(),
    balanceReportedCents: z.number().int().nullable(),
    processSessionId: z.string().nullable(),
    savedAt: z.string(),
    createdAt: z.string(),
    ownerSeenAt: z.string().nullable(),
    unusableCause: z.enum(['shape', 'account-archived']).nullable(),
    unusableReason: z.string().nullable(),
  })
  .strict();

const DraftEnvelopeSchema = z.object({ data: ImportDraftSummarySchema }).strict();
const DraftListSchema = z.object({ data: z.array(ImportDraftSummarySchema) }).strict();

export const DRAFT_ID = 'e2e-draft';

function summary(accountId: string, fileNames: string[]) {
  return {
    id: DRAFT_ID,
    accountId,
    source: { kind: 'file' as const, dialectId: 'Amex', fileNames },
    state: 'open' as const,
    step: 1,
    rowCount: 0,
    unresolvedCount: 0,
    span: null,
    balanceReportedCents: null,
    processSessionId: null,
    savedAt: '2026-09-10T00:00:00.000Z',
    createdAt: '2026-09-10T00:00:00.000Z',
    ownerSeenAt: '2026-09-10T00:00:00.000Z',
    unusableCause: null,
    unusableReason: null,
  };
}

export interface DraftTraffic {
  /** Bodies of every `PUT /import-drafts/:id`, in order. */
  writes: Array<{ step: number; release?: boolean }>;
  created: number;
}

/**
 * Answer the draft routes for one file import against `accountId`: the
 * create returns a fixed id, every write echoes a summary at the step it
 * carried, the list is empty, and release is a 204. Returns the traffic the
 * spec can assert on.
 */
export async function stubImportDrafts(page: Page, accountId: string): Promise<DraftTraffic> {
  const traffic: DraftTraffic = { writes: [], created: 0 };
  await page.route(/\/finance-api\/import-drafts(\?.*)?$/, async (route: Route) => {
    if (route.request().method() === 'POST') {
      traffic.created += 1;
      const body = route.request().postDataJSON() as { fileNames: string[]; step: number };
      return fulfilWith(
        201,
        DraftEnvelopeSchema,
        { data: { ...summary(accountId, body.fileNames), step: body.step } },
        'importDrafts.create'
      )(route);
    }
    return fulfilWith(200, DraftListSchema, { data: [] }, 'importDrafts.list')(route);
  });
  await page.route(/\/finance-api\/import-drafts\/[^/?]+$/, async (route: Route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { step: number; release?: boolean };
      traffic.writes.push({ step: body.step, release: body.release });
      return fulfilWith(
        200,
        DraftEnvelopeSchema,
        { data: { ...summary(accountId, []), step: body.step } },
        'importDrafts.write'
      )(route);
    }
    if (method === 'DELETE') return route.fulfill({ status: 204 });
    return json(route, 404, { message: 'not found', code: 'NotFoundError' });
  });
  await page.route(/\/finance-api\/import-drafts\/[^/]+\/(claim|heartbeat)$/, (route: Route) =>
    fulfilWith(
      200,
      DraftEnvelopeSchema,
      { data: summary(accountId, []) },
      'importDrafts.lease'
    )(route)
  );
  await page.route(/\/finance-api\/import-drafts\/[^/]+\/release$/, (route: Route) =>
    route.fulfill({ status: 204 })
  );
  return traffic;
}
