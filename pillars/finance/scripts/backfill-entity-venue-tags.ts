/**
 * Reviewed one-off backfill of the merchant-level `venue:` facet onto contact
 * `defaultTags` (POPS-2609). `venue:` is a fact about the merchant — Stonewall
 * is always a bar — so it belongs on the contact, where the tag-suggester's
 * entity pass picks it up for free on every future import, instead of being
 * re-decided per transaction (or sent to a model, which POPS-2596 proposed).
 *
 * Reads the venue tags the ledger already carries, groups them per entity, and
 * proposes the single best-supported value. Also strips any `occasion:` /
 * `contains:` default, which describe one transaction and must never sit on a
 * merchant. `enrich:` merchants (Amazon, Bunnings, IKEA …) are deliberately
 * left without a venue: the venue does not determine what was bought there.
 *
 * DRY RUN by default — prints the coverage before/after, every write it would
 * make, and every entity it refuses to decide for. Pass `--apply` to write
 * through the contacts pillar (contacts owns `defaultTags`; finance rows are
 * never edited). Per the finance-audit remediation policy, TAKE A VERIFIED DB
 * SNAPSHOT FIRST. Idempotent — a second run after a successful backfill finds
 * nothing to do.
 *
 *   # dry run (default): the plan, plus the entities that need a human call
 *   POPS_REGISTRY_ENABLED=true POPS_REGISTRY_URL=... POPS_INTERNAL_API_KEY=... \
 *     pnpm --filter @pops/finance exec tsx scripts/backfill-entity-venue-tags.ts
 *
 *   # the same plan as JSON, to review and to seed the override file
 *   ... tsx scripts/backfill-entity-venue-tags.ts --json > plan.json
 *
 *   # apply, including the reviewed venue calls for what the ledger couldn't decide
 *   ... tsx scripts/backfill-entity-venue-tags.ts --venues=venues.json --apply
 *
 * `--venues=<path>` takes `{ "<contact id or exact name>": "venue:x" }` — the
 * reviewed human calls for the `no-evidence` / `ambiguous` entities. An
 * override outranks every heuristic (the `enrich:` exclusion included) and the
 * plan records each disagreement it papers over.
 *
 * Safety: refuses to run when contacts returns an EMPTY set — an outage would
 * otherwise look like "no contacts have defaults". Exits non-zero on any
 * failure so a half-applied run is visible.
 */
import { readFileSync } from 'node:fs';

import { createContactsClient, type ContactsClient } from '../src/api/contacts/client.js';
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import {
  entityVenueDefaultsService,
  isPerTransactionFacet,
  openFinanceDb,
  type EntityVenueDefaultsPlan,
  type LiveEntityDefaults,
} from '../src/db/index.js';

const LOG = '[backfill-venue-defaults]';

function readOverrides(path: string, live: LiveEntityDefaults[]): Map<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object of "<contact id or name>": "venue:x"`);
  }
  const byName = new Map(live.map((e) => [e.name.toLowerCase(), e.id]));
  const overrides = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`override "${key}" in ${path} is not a string`);
    }
    overrides.set(byName.get(key.toLowerCase()) ?? key, value);
  }
  return overrides;
}

function reportPlan(plan: EntityVenueDefaultsPlan): void {
  console.warn(
    `${LOG} writes=${plan.writes.length} overridden=${plan.overridden.length} ` +
      `alreadyCorrect=${plan.alreadyCorrect.length} needsAHuman=${plan.review.length} ` +
      `contactsWithNoTransactions=${plan.withoutTransactions}`
  );
  for (const write of plan.writes) {
    const facets = write.removed.filter(isPerTransactionFacet);
    const legacy = write.removed.filter((tag) => !isPerTransactionFacet(tag));
    const strips = [
      facets.length > 0 ? `per-transaction ${facets.join(', ')}` : '',
      legacy.length > 0 ? `legacy ${legacy.join(', ')}` : '',
    ].filter(Boolean);
    const suffix = strips.length > 0 ? ` (strips ${strips.join('; ')})` : '';
    console.warn(
      `  ${write.entityName}: [${write.before.join(', ')}] -> [${write.after.join(', ')}]${suffix}`
    );
  }
  for (const override of plan.overridden) {
    console.warn(
      `  OVERRIDE ${override.entityName} = ${override.venue}${override.note ? ` — ${override.note}` : ''}`
    );
  }
  for (const item of plan.review) {
    console.warn(`  ${item.reason.toUpperCase()} ${item.entityName}: ${item.detail}`);
  }
  for (const key of plan.unknownOverrides) {
    console.warn(`  UNKNOWN OVERRIDE "${key}" matches no live contact — check the review file`);
  }
}

async function applyPlan(contacts: ContactsClient, plan: EntityVenueDefaultsPlan): Promise<number> {
  let applied = 0;
  for (const write of plan.writes) {
    await contacts.updateDefaultTags(write.entityId, write.after);
    applied += 1;
  }
  return applied;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const asJson = process.argv.includes('--json');
  const venuesArg = process.argv.find((arg) => arg.startsWith('--venues='));

  const contacts = createContactsClient();
  const live: LiveEntityDefaults[] = (await contacts.fetchAllEntities()).map((e) => ({
    id: e.id,
    name: e.name,
    defaultTags: e.defaultTags,
  }));
  if (live.length === 0) {
    throw new Error(
      'contacts returned an empty set — refusing to run (an outage is indistinguishable ' +
        'from "no contact has defaults"); retry once contacts is reachable'
    );
  }

  const overrides = venuesArg
    ? readOverrides(venuesArg.slice('--venues='.length), live)
    : undefined;

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const before = entityVenueDefaultsService.measureVenueCoverage(opened.db);
    const plan = entityVenueDefaultsService.planEntityVenueDefaults(opened.db, live, overrides);

    if (asJson) {
      process.stdout.write(`${JSON.stringify({ coverage: before, plan }, null, 2)}\n`);
      return;
    }

    console.warn(
      `${LOG} contacts=${live.length} venue coverage ${before.withVenue}/${before.addressable} ` +
        `addressable txn (${before.enrichExcluded} enrich-excluded, ${before.withoutEntity} without an entity)`
    );
    reportPlan(plan);

    if (plan.writes.length === 0) {
      console.warn(`${LOG} nothing to write`);
      return;
    }
    if (!apply) {
      console.warn(`${LOG} DRY RUN — re-run with --apply to write (take a snapshot first)`);
      return;
    }

    const applied = await applyPlan(contacts, plan);
    console.warn(`${LOG} APPLIED — ${applied} contact(s) rewritten`);
    console.warn(
      `${LOG} re-run a fresh import (or POPS-2607's re-evaluation) to see the coverage move; ` +
        'existing rows keep the tags they were committed with'
    );
  } finally {
    opened.raw.close();
  }
}

main().catch((err: unknown) => {
  console.error(`${LOG} FAILED:`, err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
