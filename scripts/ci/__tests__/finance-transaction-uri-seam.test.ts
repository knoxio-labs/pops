/**
 * The `pops://finance/transaction/<id>` spelling, across the purchases →
 * inventory fan-out seam.
 *
 * The fan-out takes a URI apart and rebuilds it. **purchases** strips
 * `pops://finance/transaction/<id>` down to the bare id, because inventory's
 * `POST /items` body carries a `purchaseTransactionId` and no URI field.
 * **inventory** rebuilds that exact string from the id and writes it to
 * `home_inventory.purchase_transaction_uri`, where the reconciliation cron
 * resolves it against finance.
 *
 * If the two spellings drift, a round-tripped asset reconciles as a
 * *different transaction* — a wrong link rather than a missing one, which is
 * the harder failure to notice.
 *
 * Each side was tested only against its own constant: inventory against a
 * literal of its own, purchases against its own `popsUriPattern` output. Both
 * suites stayed green through a change to either spelling.
 * `check-cross-pillar-expectations.mjs` does not close it either — it models
 * declared operations, explicitly not request bodies, which is where this id
 * travels (POPS-3392).
 *
 * It lives here, in root-owned `scripts/`, because neither pillar may import
 * the other's source. Both sides are read off disk the way the cross-pillar
 * guards already read a producer's spec, and composed rather than restated: a
 * fourth literal that has to agree with three others by inspection is the
 * thing this suite exists to replace.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const PURCHASES_SCALARS = join(repoRoot, 'pillars/purchases/src/contract/schemas/scalars.ts');
const INVENTORY_SERVICE = join(repoRoot, 'pillars/inventory/src/db/services/cross-pillar-uris.ts');
const INVENTORY_MIGRATION = join(
  repoRoot,
  'pillars/inventory/migrations/0008_cross_pillar_uri_denorm.sql'
);

/**
 * Read a source file, failing loudly rather than letting a moved file turn
 * every assertion below into a comparison of two empty strings.
 */
function source(path: string): string {
  const text = readFileSync(path, 'utf8');
  if (text.trim() === '') throw new Error(`${path} is empty`);
  return text;
}

/**
 * The one match of `pattern` in `text`, or a thrown error.
 *
 * A scan that finds nothing means the shape it looked for has moved, and the
 * only safe answer is to fail: silently returning "no spelling found" would
 * make this suite pass hardest exactly when it has stopped reading anything.
 */
function captureOne(text: string, pattern: RegExp, what: string): string {
  const match = pattern.exec(text);
  const captured = match?.[1];
  if (captured === undefined) throw new Error(`could not find ${what}`);
  return captured;
}

/** The arguments `FINANCE_TRANSACTION_URI` pins, read from purchases' source. */
function financeTransactionArguments(): { pillar: string; type: string } {
  const text = source(PURCHASES_SCALARS);
  const call = captureOne(
    text,
    /FINANCE_TRANSACTION_URI\s*=\s*popsUriPattern\(([^)]*)\)/u,
    "purchases' FINANCE_TRANSACTION_URI declaration"
  );
  const args = [...call.matchAll(/'([^']*)'/gu)].map((m) => m[1] ?? '');
  if (args.length !== 2) throw new Error(`expected two string arguments, got ${call}`);
  return { pillar: args[0] ?? '', type: args[1] ?? '' };
}

/**
 * Substitute the named arguments into a template lifted from source.
 *
 * Textual rather than evaluated: the point is to use the repo's own spelling,
 * not to re-run it, and `eval` on repo source would be a far worse trade for
 * the same answer.
 */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replaceAll(/\$\{(\w+)\}/gu, (whole, name: string) => values[name] ?? whole);
}

/** The URI purchases' own builder produces for an id. */
function purchasesUri(id: string): string {
  const text = source(PURCHASES_SCALARS);
  const template = captureOne(
    text,
    /export function popsUri\([^)]*\): string \{\s*return `([^`]*)`/u,
    "purchases' popsUri body"
  );
  const { pillar, type } = financeTransactionArguments();
  return fill(template, { pillar, type, id });
}

/** The regex purchases matches and strips ids with. */
function purchasesPattern(): RegExp {
  const text = source(PURCHASES_SCALARS);
  const template = captureOne(
    text,
    /export function popsUriPattern\([^)]*\): RegExp \{\s*return new RegExp\(`([^`]*)`/u,
    "purchases' popsUriPattern body"
  );
  const { pillar, type } = financeTransactionArguments();
  return new RegExp(fill(template, { pillar, type }), 'u');
}

/** The URI inventory's single builder produces for an id. */
function inventoryUri(id: string): string {
  const text = source(INVENTORY_SERVICE);
  const template = captureOne(
    text,
    /export function purchaseTransactionUriFor\([\s\S]*?return `([^`]*)`/u,
    "inventory's purchaseTransactionUriFor body"
  );
  return template.replaceAll(/\$\{\w+\}/gu, id);
}

/** The URI inventory's backfill migration wrote for an id. */
function migrationUri(id: string): string {
  const prefix = captureOne(
    source(INVENTORY_MIGRATION),
    /SET `purchase_transaction_uri` = '([^']*)' \|\|/u,
    "inventory's 0008 backfill expression"
  );
  return `${prefix}${id}`;
}

const SAMPLE_ID = 'tx-1';

describe('the finance-transaction URI, as each side of the seam spells it', () => {
  it('is the same string on both sides for the same id', () => {
    expect(inventoryUri(SAMPLE_ID)).toBe(purchasesUri(SAMPLE_ID));
  });

  it('is the same string the backfill migration wrote, so old and new rows agree', () => {
    // Rows written before 0008 got the migration's expression and rows written
    // after get the service's. Two spellings would point one transaction at two
    // URIs, and the cron would reconcile them as two.
    expect(migrationUri(SAMPLE_ID)).toBe(inventoryUri(SAMPLE_ID));
  });

  it('round-trips: what inventory builds, purchases matches and strips back to the id', () => {
    // The whole seam in one assertion. purchases sends the bare id, inventory
    // rebuilds the URI, and purchases must be able to read that id back out —
    // its `financeTransactionId` returns null rather than throwing when it
    // cannot, so a drift here is silent.
    const built = inventoryUri(SAMPLE_ID);

    expect(purchasesPattern().exec(built)?.[1]).toBe(SAMPLE_ID);
  });

  it('round-trips an id with the characters a real transaction id carries', () => {
    for (const id of ['a1b2c3d4', 'tx_2026-02-02_001', '01JC8YV5X9ZQ4K7M3N2P6R8T']) {
      expect(purchasesPattern().exec(inventoryUri(id))?.[1], id).toBe(id);
    }
  });

  it('reads a real spelling rather than an empty one, in every source it reads', () => {
    // The scans are regexes over source. If one silently stopped matching, the
    // comparisons above would agree on nothing at all — so each is asserted to
    // have found something with the shape it was looking for.
    for (const built of [
      purchasesUri(SAMPLE_ID),
      inventoryUri(SAMPLE_ID),
      migrationUri(SAMPLE_ID),
    ]) {
      expect(built.startsWith('pops://')).toBe(true);
      expect(built.endsWith(`/${SAMPLE_ID}`)).toBe(true);
      expect(built.split('/').length).toBeGreaterThan(3);
    }
  });

  it('fails loudly when a source it reads no longer holds the shape it scans for', () => {
    expect(() => captureOne('nothing here', /marker=(\w+)/u, 'the marker')).toThrow('the marker');
  });
});
