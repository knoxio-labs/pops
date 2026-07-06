/**
 * Detection + repair for orphaned `entity_id` references (issue #3615, CF009).
 *
 * Contacts is the source of truth; finance keeps only a COPY of the contact id
 * on `transactions` / `transaction_corrections` / `transaction_tag_rules`
 * (migration `0057_drop_entities_mirror.sql` dropped the local `entities` table
 * and its FKs). When contacts are reseeded — as on 2026-06-22, which minted
 * fresh ids by name and left every finance copy dangling — those copied ids
 * become dead real-UUID orphans. Nothing existing catches them: the commit
 * guard only rejects `temp:`/`pending:` placeholders, the outbox reconciler
 * only knows `pending:contact:` ids, and the cross-pillar cron only touches
 * `budgets.owner_uri`. The `entity-usage` rollup iterates the LIVE contact set,
 * so a dead id (present in finance, absent from contacts) is silently dropped
 * rather than surfaced — the anti-join in the wrong direction.
 *
 * This service computes the correct anti-join `finance-ids \ live-contact-ids`
 * and, using the denormalized `entity_name` persisted on `transactions` /
 * `transaction_corrections`, derives a deterministic old-id → new-id remap
 * (contact name → live id, case-insensitive). `transaction_tag_rules` carries
 * no name column, so its orphans are repaired transitively: any id that also
 * appears on a named table is remapped everywhere at once via
 * {@link reassignEntityId}.
 *
 * Standard db-arg service: plain functions, caller owns the connection, no HTTP
 * concerns. Pure detection/planning is separated from the mutation so the
 * planning half is trivially unit-testable and the reviewed repair script can
 * print a plan before it writes.
 */
import { transactionCorrections, transactions, transactionTagRules } from '../schema.js';
import {
  isPendingContactId,
  reassignEntityId,
  type ReassignEntityIdCounts,
} from './entity-precreate-outbox.js';

import type { FinanceDb } from './internal.js';

/** Same reserved namespace the commit guard rejects (`commit-validation.ts`). */
const TEMP_ID_PREFIX = 'temp:';

/** A placeholder id owned by other machinery — never a repair candidate. */
function isPlaceholderId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX) || isPendingContactId(id);
}

/** Normalise a name for case/whitespace-insensitive matching, mirroring how
 * contacts enforces name uniqueness (`WHERE name COLLATE NOCASE = ?`). */
function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

/** The minimum shape of a live contact needed to repair by name. */
export interface LiveEntityRef {
  id: string;
  name: string;
}

/** A distinct real-UUID `entity_id` seen across the finance tables, with every
 * distinct denormalized name it was stored under (empty when only
 * `transaction_tag_rules`, which has no name column, references it). */
export interface DistinctEntityRef {
  entityId: string;
  names: string[];
}

/**
 * Every distinct non-placeholder `entity_id` referenced by any of the three
 * finance tables, merged across tables so a `tag_rules`-only id still inherits
 * the name stored for it on `transactions`/`corrections`. Placeholder ids
 * (`temp:` / `pending:contact:`) are excluded — they belong to the commit guard
 * and the outbox reconciler respectively.
 */
export function listDistinctEntityRefs(db: FinanceDb): DistinctEntityRef[] {
  const namesById = new Map<string, Set<string>>();

  const record = (id: string | null, name: string | null): void => {
    if (id == null || isPlaceholderId(id)) return;
    let names = namesById.get(id);
    if (!names) {
      names = new Set<string>();
      namesById.set(id, names);
    }
    if (name != null && name.trim() !== '') names.add(name);
  };

  for (const row of db
    .select({ id: transactions.entityId, name: transactions.entityName })
    .from(transactions)
    .all()) {
    record(row.id, row.name);
  }
  for (const row of db
    .select({ id: transactionCorrections.entityId, name: transactionCorrections.entityName })
    .from(transactionCorrections)
    .all()) {
    record(row.id, row.name);
  }
  for (const row of db
    .select({ id: transactionTagRules.entityId })
    .from(transactionTagRules)
    .all()) {
    record(row.id, null);
  }

  return [...namesById.entries()].map(([entityId, names]) => ({ entityId, names: [...names] }));
}

/** A planned repair: the deterministic old-id → new-id remap plus the orphans
 * that could NOT be resolved, split by reason so the operator sees exactly what
 * a repair would and would not touch. */
export interface EntityRepairPlan {
  /** old (dead) entity_id → new (live) contact id. Safe to apply as-is. */
  remap: Map<string, string>;
  /** Orphans with no stored name, or a name that matches no live contact. */
  unmatched: DistinctEntityRef[];
  /** Orphans whose name is ambiguous — stored under >1 distinct name, or whose
   * name is not unique in the live contact set. Deliberately NOT auto-remapped;
   * these need a human. */
  ambiguous: DistinctEntityRef[];
}

/**
 * Plan the repair without touching the database: diff the distinct finance
 * refs against the live contact set and, for each orphan, resolve its stored
 * name back to a live contact id. An orphan is only remapped when it carries
 * exactly one distinct name AND that name resolves to exactly one live contact;
 * everything else lands in `unmatched`/`ambiguous` for operator review rather
 * than being guessed.
 */
export function planEntityRepair(
  db: FinanceDb,
  liveEntities: readonly LiveEntityRef[]
): EntityRepairPlan {
  const liveIds = new Set(liveEntities.map((e) => e.id));

  const nameToId = new Map<string, string>();
  const duplicateNames = new Set<string>();
  for (const entity of liveEntities) {
    const key = normalizeName(entity.name);
    if (nameToId.has(key) && nameToId.get(key) !== entity.id) duplicateNames.add(key);
    else nameToId.set(key, entity.id);
  }

  const remap = new Map<string, string>();
  const unmatched: DistinctEntityRef[] = [];
  const ambiguous: DistinctEntityRef[] = [];

  for (const ref of listDistinctEntityRefs(db)) {
    if (liveIds.has(ref.entityId)) continue; // still resolves — not an orphan

    if (ref.names.length === 0) {
      unmatched.push(ref);
      continue;
    }
    if (ref.names.length > 1) {
      ambiguous.push(ref);
      continue;
    }

    const [onlyName] = ref.names;
    if (onlyName === undefined) {
      unmatched.push(ref);
      continue;
    }
    const key = normalizeName(onlyName);
    if (duplicateNames.has(key)) {
      ambiguous.push(ref);
      continue;
    }
    const newId = nameToId.get(key);
    if (newId == null || newId === ref.entityId) {
      unmatched.push(ref);
      continue;
    }
    remap.set(ref.entityId, newId);
  }

  return { remap, unmatched, ambiguous };
}

/** Per-table row counts an orphan sweep found (rows, not distinct ids). */
export interface OrphanRowCounts {
  transactions: number;
  corrections: number;
  tagRules: number;
  distinctIds: number;
}

/**
 * Count orphaned reference ROWS per table (an orphan id may be referenced by
 * many rows). Cheap enough to run every reconciler tick; used to surface a
 * reseed the moment it lands rather than waiting for the next reviewed repair.
 */
export function countOrphanedRows(
  db: FinanceDb,
  liveEntityIds: ReadonlySet<string>
): OrphanRowCounts {
  const isOrphan = (id: string | null): id is string =>
    id != null && !isPlaceholderId(id) && !liveEntityIds.has(id);

  const distinctIds = new Set<string>();
  const countTable = (rows: { id: string | null }[]): number => {
    let n = 0;
    for (const row of rows) {
      if (isOrphan(row.id)) {
        n += 1;
        distinctIds.add(row.id);
      }
    }
    return n;
  };

  const transactionsCount = countTable(
    db.select({ id: transactions.entityId }).from(transactions).all()
  );
  const correctionsCount = countTable(
    db.select({ id: transactionCorrections.entityId }).from(transactionCorrections).all()
  );
  const tagRulesCount = countTable(
    db.select({ id: transactionTagRules.entityId }).from(transactionTagRules).all()
  );

  return {
    transactions: transactionsCount,
    corrections: correctionsCount,
    tagRules: tagRulesCount,
    distinctIds: distinctIds.size,
  };
}

/** The outcome of applying an {@link EntityRepairPlan}'s `remap`. */
export interface EntityRepairResult {
  /** Distinct orphan ids rewritten to a live contact id. */
  idsRepaired: number;
  /** Rows rewritten per referencing table. */
  counts: ReassignEntityIdCounts;
}

/**
 * Apply a planned `remap` in a single transaction, rewriting every occurrence
 * of each dead id across all three tables via {@link reassignEntityId}.
 * Idempotent: re-running with the same remap after a successful repair rewrites
 * zero rows (the dead ids no longer appear). Accepts the remap (not the whole
 * plan) so a caller can review/trim it — e.g. drop ambiguous ids — before
 * applying.
 */
export function applyEntityRepair(
  db: FinanceDb,
  remap: ReadonlyMap<string, string>
): EntityRepairResult {
  return db.transaction((tx) => {
    const counts: ReassignEntityIdCounts = { transactions: 0, corrections: 0, tagRules: 0 };
    for (const [oldId, newId] of remap) {
      const applied = reassignEntityId(tx, oldId, newId);
      counts.transactions += applied.transactions;
      counts.corrections += applied.corrections;
      counts.tagRules += applied.tagRules;
    }
    return { idsRepaired: remap.size, counts };
  });
}
