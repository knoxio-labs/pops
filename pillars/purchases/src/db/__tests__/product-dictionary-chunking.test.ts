/**
 * The proposal pass's retirement delete against a dictionary large enough to
 * have failed before chunking existed.
 *
 * SQLite refuses to prepare a statement with more than
 * `SQLITE_MAX_VARIABLE_NUMBER` bound parameters. `retireUnobserved` deletes
 * every unconfirmed alias no line prints any more in one `inArray(...)`
 * delete, so a dictionary whose stale-alias count crosses that ceiling threw
 * "too many SQL variables" before it was chunked. These tests drive
 * `proposeProducts` past it directly, the same way `reconcile-chunking.test.ts`
 * drives the sweep's charge-scoped queries past it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPurchase, listProducts, proposeProducts, updateAlias } from '../index.js';
import {
  amazonOrder,
  ARRANGEMENT_TIMEOUT_MS,
  measureSqliteMaxVariableNumber,
  openTempDb,
  seedAmazonSource,
} from './helpers.js';

import type { OpenedPurchasesDb } from '../index.js';
import type { TempDb } from './helpers.js';

/**
 * Insert `count` unconfirmed, unnamed aliases directly, each pointing at its
 * own fresh product and printing a wording no order in this test states —
 * `retireUnobserved` sees each one as stale the moment `proposeProducts` runs,
 * without the cost of ingesting an order per alias.
 */
function insertStaleAliases(raw: OpenedPurchasesDb['raw'], count: number): string[] {
  const insertProduct = raw.prepare(`INSERT INTO purchase_products (id, label) VALUES (?, ?)`);
  const insertAlias = raw.prepare(
    `INSERT INTO purchase_product_aliases
       (id, product_id, scope_key, source, normalised_name, printed_name, confirmed_at)
     VALUES (?, ?, ?, 'amazon', ?, ?, NULL)`
  );
  const aliasIds = Array.from({ length: count }, () => crypto.randomUUID());
  const insertMany = raw.transaction((ids: readonly string[]) => {
    ids.forEach((aliasId, i) => {
      const productId = crypto.randomUUID();
      const normalisedName = `stale wording ${i}`;
      insertProduct.run(productId, normalisedName);
      insertAlias.run(
        aliasId,
        productId,
        `amazon:${normalisedName}`,
        normalisedName,
        normalisedName
      );
    });
  });
  insertMany(aliasIds);
  return aliasIds;
}

describe('the proposal pass retirement delete at real SQLite scale', () => {
  let temp: TempDb;
  let opened: OpenedPurchasesDb;
  let overLimitCount: number;

  beforeEach(() => {
    temp = openTempDb();
    opened = temp.opened;
    seedAmazonSource(opened);
    overLimitCount = measureSqliteMaxVariableNumber() + 500;
  });

  afterEach(() => {
    temp.cleanup();
  });

  it(
    'retires every stale alias across a dictionary past the bound-parameter cap, leaving a confirmed one and an observed one untouched',
    () => {
      const staleIds = insertStaleAliases(opened.raw, overLimitCount);

      // A confirmed alias, deliberately mid-list: no pass may retire it,
      // chunked or not, and a chunking bug that dropped the confirmedAt
      // predicate on some chunks would still pass a test where it was first
      // or last.
      const confirmedId = staleIds[Math.floor(staleIds.length / 2)];
      if (confirmedId === undefined) throw new Error('expected a mid-list alias id');
      updateAlias(opened.db, confirmedId, { confirmed: true });

      // A wording an order actually prints right now: the pass must keep
      // minting for it, not fold it into the stale sweep.
      createPurchase(
        opened.db,
        amazonOrder({
          checksum: 'amazon:chunk-retire',
          sourceOrderId: 'amazon-chunk-retire',
          items: [{ name: 'CHK BRST 1KG', unitPriceCents: 1179, lineTotalCents: 1179 }],
        })
      );

      const outcome = proposeProducts(opened.db);

      // Every stale alias retired except the confirmed one, plus one fresh
      // entry minted for the line the order above prints.
      expect(outcome.retired).toBe(staleIds.length - 1);
      expect(outcome.proposed).toBe(1);

      const products = listProducts(opened.db);
      const printedNames = products.flatMap((entry) =>
        entry.aliases.map((alias) => alias.printedName)
      );
      expect(printedNames).toHaveLength(2);
      expect(printedNames).toContain('CHK BRST 1KG');
      expect(printedNames.some((name) => name.startsWith('stale wording'))).toBe(true);

      const confirmedAlias = products
        .flatMap((entry) => entry.aliases)
        .find((alias) => alias.id === confirmedId);
      expect(confirmedAlias?.confirmedAt).not.toBeNull();
    },
    ARRANGEMENT_TIMEOUT_MS
  );
});
