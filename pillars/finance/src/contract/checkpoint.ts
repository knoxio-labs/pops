/**
 * Storage shapes behind an account checkpoint (POPS-2750, ADR-051) — the enum
 * the `account_checkpoints` table and its REST contract share. Kept next to
 * {@link ACCOUNT_KINDS} (`account-kind.ts`) for the same reason the loan enums
 * are: what an account carries, declared once for the db schema and the wire.
 */

/**
 * Where a checkpoint's number came from.
 *
 * `manual` is a figure typed in by hand — read off the banking app, or a count
 * of what is in the wallet. `import` is a balance an importer found printed on
 * the file it was already reading (POPS-2882). `statement` is one parsed out of
 * a statement document (POPS-2752), and is unreachable until that ships; it is
 * declared now so the wire schema never has to change to admit it.
 *
 * The distinction is not cosmetic: only `manual` rows may be deleted, and the
 * partial unique index on `(account_id, as_of, source)` covers exactly the two
 * machine sources, so re-importing the same file cannot double a checkpoint
 * while a second hand count on the same day stays legal.
 */
export const CHECKPOINT_SOURCES = ['manual', 'import', 'statement'] as const;

/** One member of {@link CHECKPOINT_SOURCES}. */
export type CheckpointSource = (typeof CHECKPOINT_SOURCES)[number];
