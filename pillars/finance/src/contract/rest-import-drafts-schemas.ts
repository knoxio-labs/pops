/**
 * Wire schemas for pending imports (POPS-3329, finance ADR-005): what a card
 * lists, what the wizard hydrates from and writes back, and the lease calls
 * around it.
 *
 * `payload` is opaque on the wire: it is the wizard's own state, owned and
 * validated by the app that wrote it, and the server never reads inside it
 * for a file draft. What guards it is `shapeVersion`, stamped on write and
 * compared on read; a mismatch surfaces as the `unusable` state rather than
 * as a parse error somewhere in a browser.
 */
import { z } from 'zod';

import { IMPORT_DRAFT_STORED_STATES } from './import-draft.js';
import { IMPORT_PROVIDERS } from './import-source.js';
import { DateSpanSchema } from './rest-account-imports-schemas.js';

/**
 * What a card shows. The two stored states plus three the read derives:
 * `open` and `left-open` from the lease (an owner seen inside or past the
 * stale window), `unusable` from the shape version or an archived account.
 */
export const IMPORT_DRAFT_STATES = [
  ...IMPORT_DRAFT_STORED_STATES,
  'open',
  'left-open',
  'unusable',
] as const;

export type ImportDraftState = (typeof IMPORT_DRAFT_STATES)[number];

/** Why a draft is `unusable`; the reason text is worded for the card. */
export const IMPORT_DRAFT_UNUSABLE_CAUSES = ['shape', 'account-archived'] as const;

export type ImportDraftUnusableCause = (typeof IMPORT_DRAFT_UNUSABLE_CAUSES)[number];

export const ImportDraftSourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    /** The `BankDialectId` the rows were parsed with; null until the wizard picked one. */
    dialectId: z.string().nullable(),
    fileNames: z.array(z.string()),
  }),
  z.object({ kind: z.literal('live'), provider: z.enum(IMPORT_PROVIDERS) }),
]);

export type ImportDraftSource = z.infer<typeof ImportDraftSourceSchema>;

/** The wizard's state as JSON. Opaque here; see the file header. */
export const ImportDraftPayloadSchema = z.record(z.string(), z.unknown());

export type ImportDraftPayload = z.infer<typeof ImportDraftPayloadSchema>;

/** One pending import as every entry point lists it. */
export const ImportDraftSummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  source: ImportDraftSourceSchema,
  state: z.enum(IMPORT_DRAFT_STATES),
  /** The wizard step it stopped on; null until a person has opened it. */
  step: z.number().int().positive().nullable(),
  rowCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  span: DateSpanSchema.nullable(),
  /** Live only: the balance the provider reported with the newest row, minor units. */
  balanceReportedCents: z.number().int().nullable(),
  processSessionId: z.string().nullable(),
  savedAt: z.string(),
  createdAt: z.string(),
  /** When the tab holding it last checked in; null when nobody holds it. */
  ownerSeenAt: z.string().nullable(),
  unusableCause: z.enum(IMPORT_DRAFT_UNUSABLE_CAUSES).nullable(),
  unusableReason: z.string().nullable(),
});

export type ImportDraftSummary = z.infer<typeof ImportDraftSummarySchema>;

/** The summary plus what the wizard hydrates from. */
export const ImportDraftSchema = ImportDraftSummarySchema.extend({
  shapeVersion: z.number().int(),
  payload: ImportDraftPayloadSchema,
});

export type ImportDraft = z.infer<typeof ImportDraftSchema>;

export const ImportDraftsQuerySchema = z.object({
  account: z.string().optional(),
  state: z.enum(IMPORT_DRAFT_STORED_STATES).optional(),
});

export type ImportDraftsQuery = z.infer<typeof ImportDraftsQuerySchema>;

/** A tab's lease token: minted by the tab, kept in its sessionStorage, sent with every write. */
const OwnerToken = z.string().min(8).max(128);

/** The fields every write keeps in step with the payload. */
const DraftCountsSchema = z.object({
  step: z.number().int().positive().nullable(),
  rowCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  span: DateSpanSchema.nullable(),
  processSessionId: z.string().nullable().optional(),
});

/** Create a file draft. Live drafts are created by the Up path, never here. The creator holds the lease. */
export const CreateImportDraftBodySchema = DraftCountsSchema.extend({
  accountId: z.string(),
  dialectId: z.string().nullable(),
  fileNames: z.array(z.string()).min(1),
  payload: ImportDraftPayloadSchema,
  ownerToken: OwnerToken,
});

export type CreateImportDraftBody = z.infer<typeof CreateImportDraftBodySchema>;

export const WriteImportDraftBodySchema = DraftCountsSchema.extend({
  payload: ImportDraftPayloadSchema,
  ownerToken: OwnerToken,
});

export type WriteImportDraftBody = z.infer<typeof WriteImportDraftBodySchema>;

export const ClaimImportDraftBodySchema = z.object({
  ownerToken: OwnerToken,
  /** Take it from an owner still inside the stale window: the card's "Take over here". */
  force: z.boolean().optional(),
});

export type ClaimImportDraftBody = z.infer<typeof ClaimImportDraftBodySchema>;

export const LeaseBodySchema = z.object({ ownerToken: OwnerToken });

export type LeaseBody = z.infer<typeof LeaseBodySchema>;
