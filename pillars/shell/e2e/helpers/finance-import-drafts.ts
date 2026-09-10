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

/**
 * The wizard state a live draft carries, mirrored from the pillar's
 * `LiveDraftPayloadSchema` (`src/api/modules/import-drafts/live-draft-payload.ts`)
 * — the server writes this one itself, unlike a file draft's opaque payload.
 *
 * Only the fields the wizard's structural guard (`isDraftPayload`) and its
 * resume clamp (`clampResumeStep`) actually read are typed here; the rest ride
 * along as the store slice they are.
 */
const LiveDraftPayloadSchema = z
  .object({
    currentStep: z.number().int(),
    sourceFileNames: z.array(z.string()),
    accountId: z.string().nullable(),
    accountName: z.string(),
    dialectId: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.string())),
    columnMap: z
      .object({
        date: z.string(),
        description: z.string(),
        amount: z.string(),
        location: z.string().optional(),
      })
      .strict(),
    parsedTransactions: z.array(z.record(z.string(), z.unknown())),
    parsedTransactionsFingerprint: z.string(),
    processSessionId: z.string().nullable(),
    processedForFingerprint: z.string().nullable(),
    processedTransactions: z
      .object({
        matched: z.array(z.record(z.string(), z.unknown())),
        uncertain: z.array(z.record(z.string(), z.unknown())),
        failed: z.array(z.record(z.string(), z.unknown())),
        skipped: z.array(z.record(z.string(), z.unknown())),
        warnings: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .strict(),
    confirmedTransactions: z.array(z.record(z.string(), z.unknown())),
    commitResult: z.record(z.string(), z.unknown()).nullable(),
    pendingEntities: z.array(z.unknown()),
    pendingChangeSets: z.array(z.unknown()),
    pendingTagRuleChangeSets: z.array(z.unknown()),
    manuallyResolvedChecksums: z.array(z.string()),
  })
  .strict();

/** The summary plus what the wizard hydrates from — the pillar's `ImportDraftSchema`. */
const LiveDraftReadSchema = ImportDraftSummarySchema.extend({
  shapeVersion: z.number().int(),
  payload: LiveDraftPayloadSchema,
}).strict();

/** `IMPORT_DRAFT_SHAPE_VERSION` (`src/contract/import-draft.ts`). */
const SHAPE_VERSION = 1;

export const LIVE_DRAFT_ID = 'e2e-live-draft';

export interface LiveDraftSeed {
  accountId: string;
  accountName: string;
  /** The rows as the Up mapper produced them; also the parsed set. */
  parsedTransactions: Array<Record<string, unknown>>;
  /** The same rows bucketed by the classification that ran on arrival. */
  processedTransactions: {
    matched: Array<Record<string, unknown>>;
    uncertain: Array<Record<string, unknown>>;
    failed: Array<Record<string, unknown>>;
    skipped: Array<Record<string, unknown>>;
  };
  /** The balance Up reported with the newest row, minor units. */
  balanceReportedCents: number;
}

/**
 * The fingerprint the wizard compares to decide a live draft's results are
 * current — `fingerprintOf` in the pillar's `live-draft-payload.ts`, which is
 * the checksums in order, joined. Both fingerprint fields carry it, which is
 * what makes the wizard open the draft on Review instead of re-running
 * Process.
 */
function fingerprintOf(parsed: Array<Record<string, unknown>>): string {
  return parsed.map((t) => String(t.checksum)).join('|');
}

function liveDraftPayload(seed: LiveDraftSeed): z.infer<typeof LiveDraftPayloadSchema> {
  const fingerprint = fingerprintOf(seed.parsedTransactions);
  return {
    // Review. `clampResumeStep` allows it because the processed results are
    // present and carry the current fingerprint; `firstImportStep` floors a
    // live draft at Process, so there is no Upload or Map step to skip past.
    currentStep: 4,
    sourceFileNames: [],
    accountId: seed.accountId,
    accountName: seed.accountName,
    dialectId: 'Up',
    headers: [],
    rows: [],
    columnMap: { date: '', description: '', amount: '' },
    parsedTransactions: seed.parsedTransactions,
    parsedTransactionsFingerprint: fingerprint,
    // The characteristic of this whole path: rows arrive pre-mapped from the
    // webhook or the sync and never touch the Process step, so there is no
    // session (POPS-3358).
    processSessionId: null,
    processedForFingerprint: fingerprint,
    processedTransactions: { ...seed.processedTransactions, warnings: [] },
    confirmedTransactions: [],
    commitResult: null,
    pendingEntities: [],
    pendingChangeSets: [],
    pendingTagRuleChangeSets: [],
    manuallyResolvedChecksums: [],
  };
}

function liveSummary(seed: LiveDraftSeed) {
  const dates = seed.parsedTransactions.map((t) => String(t.date)).toSorted();
  const from = dates[0];
  const to = dates.at(-1);
  const { uncertain, failed } = seed.processedTransactions;
  return {
    id: LIVE_DRAFT_ID,
    accountId: seed.accountId,
    source: { kind: 'live' as const, provider: 'up' as const },
    // `saved`, not `live`: claiming a live draft is what turns it saved, and
    // the wizard claims it on hydration. A draft still collecting arrivals is
    // not one a person is reviewing.
    state: 'saved' as const,
    step: 4,
    rowCount: seed.parsedTransactions.length,
    unresolvedCount: uncertain.length + failed.length,
    span: from === undefined || to === undefined ? null : { from, to },
    balanceReportedCents: seed.balanceReportedCents,
    processSessionId: null,
    savedAt: '2026-09-10T00:00:00.000Z',
    createdAt: '2026-09-10T00:00:00.000Z',
    ownerSeenAt: null,
    unusableCause: null,
    unusableReason: null,
  };
}

/**
 * Answer the draft routes for one **live** draft already staged against
 * `seed.accountId` — the shape the Up webhook or a sync leaves behind, which
 * is the one thing a file upload can never produce: no file, no dialect, and
 * no process session.
 *
 * Seeding it here rather than through `POST /import-drafts` is not a
 * shortcut. That route hardcodes `sourceKind: 'file'` and requires a
 * non-empty `fileNames`, because live drafts are minted server-side by the Up
 * path and never created over REST — so there is no create call for a spec to
 * make.
 *
 * The spec navigates to `/finance/import?draft=<LIVE_DRAFT_ID>` and the
 * wizard hydrates from the `GET` below, claims the lease, and opens on
 * Review. Returns the traffic the spec can assert on.
 */
export async function stubLiveImportDraft(page: Page, seed: LiveDraftSeed): Promise<DraftTraffic> {
  const traffic: DraftTraffic = { writes: [], created: 0 };
  const summaryBody = liveSummary(seed);
  const readBody = { ...summaryBody, shapeVersion: SHAPE_VERSION, payload: liveDraftPayload(seed) };

  await page.route(/\/finance-api\/import-drafts(\?.*)?$/, (route: Route) => {
    // A live draft is never created over REST; a POST here means the wizard
    // took the file path, which is the thing this spec exists to rule out.
    if (route.request().method() === 'POST') {
      traffic.created += 1;
      return json(route, 400, {
        message: 'a live draft is not created over REST',
        code: 'BadRequestError',
      });
    }
    // `state=live` is the live-arrivals banner asking what is still collecting
    // for this account behind the draft being reviewed. Claiming this one
    // turned it `saved`, and nothing has arrived since, so the answer is none
    // and the banner stays away.
    const collecting = new URL(route.request().url()).searchParams.get('state') === 'live';
    return fulfilWith(
      200,
      z.object({ data: z.array(ImportDraftSummarySchema) }).strict(),
      { data: collecting ? [] : [summaryBody] },
      'importDrafts.list'
    )(route);
  });

  await page.route(/\/finance-api\/import-drafts\/[^/?]+$/, (route: Route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return fulfilWith(
        200,
        z.object({ data: LiveDraftReadSchema }).strict(),
        { data: readBody },
        'importDrafts.get'
      )(route);
    }
    if (method === 'PUT') {
      const body = route.request().postDataJSON() as { step: number; release?: boolean };
      traffic.writes.push({ step: body.step, release: body.release });
      return fulfilWith(
        200,
        z.object({ data: ImportDraftSummarySchema }).strict(),
        { data: { ...summaryBody, step: body.step } },
        'importDrafts.write'
      )(route);
    }
    if (method === 'DELETE') return route.fulfill({ status: 204 });
    return json(route, 404, { message: 'not found', code: 'NotFoundError' });
  });

  await page.route(/\/finance-api\/import-drafts\/[^/]+\/(claim|heartbeat)$/, (route: Route) =>
    fulfilWith(
      200,
      z.object({ data: ImportDraftSummarySchema }).strict(),
      { data: { ...summaryBody, ownerSeenAt: '2026-09-10T00:00:01.000Z' } },
      'importDrafts.lease'
    )(route)
  );
  await page.route(/\/finance-api\/import-drafts\/[^/]+\/release$/, (route: Route) =>
    route.fulfill({ status: 204 })
  );
  return traffic;
}
