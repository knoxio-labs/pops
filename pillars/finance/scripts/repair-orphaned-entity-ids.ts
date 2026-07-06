/**
 * Reviewed one-off repair for orphaned `entity_id` references (issue #3615,
 * CF009). Finance keeps a copy of each contact id; the 2026-06-22 contacts
 * reseed minted fresh ids by name and left those copies dangling. This script
 * rebinds every dead id to its live contact by the denormalized name stored on
 * `transactions`/`transaction_corrections` (and, transitively, `tag_rules`).
 *
 * DRY RUN by default — prints the exact remap and every id it can't resolve.
 * Pass `--apply` to write. Per the finance-audit remediation policy, TAKE A
 * VERIFIED DB SNAPSHOT FIRST (the whole-fleet backup, issue #3636, covers this).
 * Does NOT run automatically; invoke explicitly against the pillar's live env:
 *
 *   # dry run (default): show what would change
 *   POPS_REGISTRY_ENABLED=true POPS_REGISTRY_URL=... POPS_INTERNAL_API_KEY=... \
 *     pnpm --filter @pops/finance exec tsx scripts/repair-orphaned-entity-ids.ts
 *
 *   # apply (after a snapshot):
 *   ... tsx scripts/repair-orphaned-entity-ids.ts --apply
 *
 * Safety: refuses to run when contacts returns an EMPTY set (an outage would
 * otherwise make every reference look orphaned). Idempotent — a second run
 * after a successful repair finds nothing to do. Exits non-zero on any failure
 * so deploy automation can halt.
 */
import { createContactsClient } from '../src/api/contacts/client.js';
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { entityOrphansService, openFinanceDb } from '../src/db/index.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const contacts = createContactsClient();
  const live = (await contacts.fetchAllEntities()).map((e) => ({ id: e.id, name: e.name }));
  if (live.length === 0) {
    throw new Error(
      'contacts returned an empty set — refusing to run (an outage is indistinguishable ' +
        'from "everything is orphaned"); retry once contacts is reachable'
    );
  }

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const plan = entityOrphansService.planEntityRepair(opened.db, live);

    console.warn(
      `[repair-entity-ids] live contacts=${live.length} repairable=${plan.remap.size} ` +
        `unmatched=${plan.unmatched.length} ambiguous=${plan.ambiguous.length}`
    );
    for (const [oldId, newId] of plan.remap) {
      console.warn(`  remap ${oldId} -> ${newId}`);
    }
    for (const ref of plan.unmatched) {
      console.warn(`  UNMATCHED ${ref.entityId} names=[${ref.names.join(', ')}] (left as-is)`);
    }
    for (const ref of plan.ambiguous) {
      console.warn(`  AMBIGUOUS ${ref.entityId} names=[${ref.names.join(', ')}] (needs a human)`);
    }

    if (plan.remap.size === 0) {
      console.warn('[repair-entity-ids] no repairable orphans — nothing to do');
      return;
    }
    if (!apply) {
      console.warn(
        '[repair-entity-ids] DRY RUN — re-run with --apply to write (take a snapshot first)'
      );
      return;
    }

    const result = entityOrphansService.applyEntityRepair(opened.db, plan.remap);
    console.warn(
      `[repair-entity-ids] APPLIED — ids=${result.idsRepaired} rows: ` +
        `transactions=${result.counts.transactions} corrections=${result.counts.corrections} ` +
        `tagRules=${result.counts.tagRules}`
    );
  } finally {
    opened.raw.close();
  }
}

main().catch((err: unknown) => {
  console.error('[repair-entity-ids] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
