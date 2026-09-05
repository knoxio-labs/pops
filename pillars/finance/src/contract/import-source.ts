/**
 * How an account gets its transactions (POPS-2751, ADR-052) — the enums the
 * `account_import_config` and `import_batches` tables share with the REST
 * contract. Declared once, next to {@link CHECKPOINT_SOURCES}
 * (`checkpoint.ts`), for the same reason: what an account carries, spelled in
 * one place for the db schema and the wire.
 */
import { z } from 'zod';

/**
 * The shape of the thing an import reads.
 *
 * `csv-dialect` is a file the column mapper can express once a `BankDialectId`
 * has named its header and sign convention. `pdf-statement` is a statement
 * whose rows a parser recovers from extracted text (`anz-pdf-statement.ts`).
 * `api` is a provider's own endpoint, fetched rather than uploaded — the only
 * kind with nothing for the wizard to open, and the only kind that can be
 * scheduled.
 */
export const IMPORT_SOURCE_KINDS = ['csv-dialect', 'pdf-statement', 'api'] as const;

/** One member of {@link IMPORT_SOURCE_KINDS}. */
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number];

/** Providers an `api` source can name. Closed so a config row cannot point at a client that does not exist. */
export const IMPORT_PROVIDERS = ['up'] as const;

/** One member of {@link IMPORT_PROVIDERS}. */
export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

/**
 * What a commit says about where its rows came from, recorded verbatim on the
 * `import_batches` row it writes. Optional on the wire so a client predating
 * the field still commits; a batch written without one carries `source_kind`
 * from the rows themselves (see `commit-batches.ts`).
 */
export const ImportSourceSchema = z.object({
  kind: z.enum(IMPORT_SOURCE_KINDS),
  /** The `BankDialectId` a `csv-dialect` file was parsed with. */
  dialectId: z.string().min(1).optional(),
  /** The parser a `pdf-statement` was read by, e.g. `anz-pdf-statement`. */
  parserId: z.string().min(1).optional(),
  /** The provider an `api` batch was fetched from. */
  provider: z.enum(IMPORT_PROVIDERS).optional(),
  /** Free-form parser version, so a later reparse can tell which grammar produced a batch. */
  parserVersion: z.string().min(1).optional(),
});

export type ImportSource = z.infer<typeof ImportSourceSchema>;

/** One `import_batches` row a commit wrote, as the commit result reports it (POPS-2916). */
export const CommitBatchSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  sourceKind: z.enum(IMPORT_SOURCE_KINDS),
  rowCount: z.number().int().nonnegative(),
  /** Inclusive `YYYY-MM-DD` span; both null when the batch wrote no rows. */
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  /** The checkpoint this batch minted, when its source carried a balance. */
  checkpointId: z.string().nullable(),
});

export type CommitBatch = z.infer<typeof CommitBatchSchema>;
