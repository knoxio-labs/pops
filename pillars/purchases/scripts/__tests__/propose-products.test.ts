/**
 * The dictionary runner's two claims, both of which are the kind that fail
 * silently: that the default run writes nothing, and that what it printed is
 * nonetheless what a `--write` run would do.
 *
 * A preview that quietly committed would look identical to a correct one on
 * the console — the operator only finds out later, from a dictionary they
 * never approved — so every preview here is checked against the database
 * afterwards rather than against its own return value. And a preview that
 * reported an estimate instead of the real pass would be just as invisible,
 * so the report of a preview is compared field for field against the report
 * of the committed run over the same starting state.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../src/db/__tests__/helpers.js';
import {
  createPurchase,
  deletePurchase,
  listProducts,
  updateAlias,
  upsertSource,
} from '../../src/db/index.js';
import {
  describePassReport,
  parseArgs,
  runProposalPass,
  type PassReport,
} from '../propose-products.js';

import type { CreatePurchaseInput, OpenedPurchasesDb } from '../../src/db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  upsertSource(opened.db, {
    id: 'woolworths',
    label: 'Woolworths',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
  });
});

afterEach(() => {
  cleanup();
});

function order(checksum: string, names: readonly string[]): CreatePurchaseInput {
  return {
    source: 'woolworths',
    ingestMethod: 'upload',
    orderedAt: '2026-02-02T01:41:21Z',
    currency: 'AUD',
    totalCents: 5678,
    sourceOrderId: checksum,
    checksum,
    merchantEntityName: 'Woolworths',
    items: names.map((name) => ({ name, unitPriceCents: 1179, lineTotalCents: 1179 })),
  };
}

function printedNames(): readonly string[] {
  return listProducts(opened.db)
    .flatMap((product) => product.aliases)
    .map((alias) => alias.printedName)
    .toSorted((a, b) => a.localeCompare(b));
}

describe('the preview, which is the default', () => {
  it('reports what it would mint and leaves the dictionary untouched', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG', 'chk  brst  1kg', 'MILK 2L']));

    const report = runProposalPass(opened.db, { write: false });

    // Two entries, not three: the chicken lines normalise alike. Which of
    // their two spellings labels the entry is the newest line's, and both
    // lines are on the same order, so only the milk wording is asserted
    // verbatim here.
    expect(report.outcome).toMatchObject({ scannedLines: 3, observedWordings: 2, proposed: 2 });
    expect(namesOf(report.minted)).toHaveLength(2);
    expect(namesOf(report.minted)).toContain('MILK 2L');
    expect(new Set(report.minted.map((entry) => entry.scopeKey)).size).toBe(1);
    expect(printedNames()).toEqual([]);
  });

  it('reports what it would retire and retires nothing', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    const gone = createPurchase(opened.db, order('other', ['MILK 2L']));
    runProposalPass(opened.db, { write: true });
    deletePurchase(opened.db, gone);

    const report = runProposalPass(opened.db, { write: false });

    expect(report.outcome.retired).toBe(1);
    expect(report.retired.map((entry) => entry.printedName)).toEqual(['MILK 2L']);
    expect(printedNames()).toEqual(['CHK BRST 1KG', 'MILK 2L']);
  });

  it('reports exactly what the committed run then does', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG', 'MILK 2L']));
    createPurchase(opened.db, order('cafe', ['FLAT WHITE']));

    const preview = runProposalPass(opened.db, { write: false });
    const committed = runProposalPass(opened.db, { write: true });

    expect(preview.outcome).toEqual(committed.outcome);
    expect(namesOf(preview.minted)).toEqual(namesOf(committed.minted));
    expect(namesOf(preview.retired)).toEqual(namesOf(committed.retired));
    expect(printedNames()).toEqual(['CHK BRST 1KG', 'FLAT WHITE', 'MILK 2L']);
  });

  it('rolls back the whole pass, not only the entries it minted', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    const gone = createPurchase(opened.db, order('other', ['MILK 2L']));
    runProposalPass(opened.db, { write: true });
    deletePurchase(opened.db, gone);

    runProposalPass(opened.db, { write: false });

    // The retire runs before the mint inside the pass, so a rollback that
    // only covered the inserts would leave the dictionary short of the entry
    // the preview said it was leaving alone.
    expect(printedNames()).toEqual(['CHK BRST 1KG', 'MILK 2L']);
  });

  it('leaves a confirmed entry alone and says so', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    runProposalPass(opened.db, { write: true });
    const alias = listProducts(opened.db).flatMap((product) => product.aliases)[0];
    if (alias === undefined) throw new Error('the pass minted nothing to confirm');
    updateAlias(opened.db, alias.id, { confirmed: true });

    const report = runProposalPass(opened.db, { write: false });

    expect(report.outcome).toMatchObject({ confirmed: 1, proposed: 0, retired: 0 });
  });
});

describe('the committed run', () => {
  it('writes the entries it reports', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG', 'MILK 2L']));

    const report = runProposalPass(opened.db, { write: true });

    expect(report.outcome.proposed).toBe(2);
    expect(printedNames()).toEqual(['CHK BRST 1KG', 'MILK 2L']);
  });

  it('is idempotent — a second run changes nothing', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    runProposalPass(opened.db, { write: true });

    const second = runProposalPass(opened.db, { write: true });

    expect(second.outcome).toMatchObject({ proposed: 0, retired: 0 });
    expect(second.minted).toEqual([]);
  });
});

describe('arguments', () => {
  it('previews when nothing is passed', () => {
    expect(parseArgs([])).toEqual({ write: false });
    expect(parseArgs(['--dry-run'])).toEqual({ write: false });
  });

  it('commits only for --write', () => {
    expect(parseArgs(['--write'])).toEqual({ write: true });
  });

  it("survives pnpm's separator, which reaches the script rather than being eaten", () => {
    // `pnpm propose:products -- --write` runs `tsx scripts/propose-products.ts
    // -- --write`, so refusing a bare `--` would refuse the documented form.
    expect(parseArgs(['--', '--write'])).toEqual({ write: true });
    expect(parseArgs(['--'])).toEqual({ write: false });
  });

  it('refuses an argument it does not know, rather than previewing', () => {
    expect(() => parseArgs(['--wirte'])).toThrow(/--wirte/);
    expect(() => parseArgs(['--limit', '10'])).toThrow(/--limit 10/);
  });

  it('refuses both modes at once', () => {
    expect(() => parseArgs(['--write', '--dry-run'])).toThrow(/contradict/);
  });
});

describe('what it prints', () => {
  const report: PassReport = {
    outcome: {
      scannedLines: 12,
      observedWordings: 3,
      proposed: 3,
      retired: 0,
      confirmed: 2,
    },
    minted: Array.from({ length: 12 }, (_, index) => ({
      scopeKey: 'source:woolworths',
      printedName: `WORDING ${String(index)}`,
    })),
    retired: [],
  };

  it('names the file, says nothing was written, and says how to write', () => {
    const text = describePassReport(report, { path: '/data/purchases.db', write: false });

    expect(text).toContain('preview against /data/purchases.db');
    expect(text).toContain('would mint 3 entries and retire 0');
    expect(text).toContain('nothing was written');
    expect(text).toContain('--write');
  });

  it('samples the wordings rather than printing all of them', () => {
    const text = describePassReport(report, { path: '/data/purchases.db', write: true });

    expect(text).toContain('WORDING 9');
    expect(text).not.toContain('WORDING 10');
    expect(text).toContain('… and 2 more');
    expect(text).toContain('minted 3 entries and retired 0');
    expect(text).not.toContain('nothing was written');
  });
});

function namesOf(entries: PassReport['minted']): readonly string[] {
  return entries.map((entry) => entry.printedName).toSorted((a, b) => a.localeCompare(b));
}
