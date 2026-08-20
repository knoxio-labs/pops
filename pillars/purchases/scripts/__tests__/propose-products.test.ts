/**
 * The dictionary runner's two claims, both of which are the kind that fail
 * silently: that the default run leaves the dictionary as it found it, and
 * that what it printed is nonetheless the real pass rather than an estimate
 * of it.
 *
 * A preview that quietly committed would look identical to a correct one on
 * the console — the operator only finds out later, from a dictionary they
 * never approved — so every preview here is checked against the database
 * afterwards rather than against its own return value. And a preview that
 * reported an estimate instead of the real pass would be just as invisible,
 * so the report of a preview is compared field for field against the report
 * of the committed run over the same starting state.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../src/db/__tests__/helpers.js';
import {
  createPurchase,
  deletePurchase,
  listProducts,
  openPurchasesDb,
  renameProduct,
  updateAlias,
  upsertSource,
} from '../../src/db/index.js';
import {
  describePassReport,
  describePassTarget,
  main,
  parseArgs,
  runProposalPass,
  type PassReport,
} from '../propose-products.js';

import type { CreatePurchaseInput, OpenedPurchasesDb, PurchasesDb } from '../../src/db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedSource(opened.db);
});

afterEach(() => {
  cleanup();
});

function seedSource(db: PurchasesDb): void {
  upsertSource(db, {
    id: 'woolworths',
    label: 'Woolworths',
    settlementWindowDays: 14,
    autoLinkPolicy: 'auto',
  });
}

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

  it('names a renamed product the retire would take with it', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    const gone = createPurchase(opened.db, order('other', ['MILK 2L']));
    runProposalPass(opened.db, { write: true });
    const milk = listProducts(opened.db).find(({ aliases }) =>
      aliases.some((alias) => alias.printedName === 'MILK 2L')
    );
    if (milk === undefined) throw new Error('the pass minted no entry for the milk');
    renameProduct(opened.db, milk.product.id, 'Full-cream milk 2L');
    deletePurchase(opened.db, gone);

    const report = runProposalPass(opened.db, { write: false });

    // The label a human wrote is the one loss re-running the pass cannot put
    // back, and the retire line above it says only `MILK 2L`.
    expect(report.deletedProducts).toEqual(['Full-cream milk 2L']);
    expect(describePassReport(report, { path: '/data/purchases.db', write: false })).toContain(
      'delete product "Full-cream milk 2L"'
    );
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

  it('leaves a confirmed entry alone even once nothing prints its wording', () => {
    const gone = createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    runProposalPass(opened.db, { write: true });
    const alias = listProducts(opened.db).flatMap((product) => product.aliases)[0];
    if (alias === undefined) throw new Error('the pass minted nothing to confirm');
    updateAlias(opened.db, alias.id, { confirmed: true });
    deletePurchase(opened.db, gone);

    const report = runProposalPass(opened.db, { write: false });

    expect(report.outcome).toMatchObject({
      scannedLines: 0,
      confirmed: 1,
      proposed: 0,
      retired: 0,
    });
    expect(report.deletedProducts).toEqual([]);
    expect(printedNames()).toEqual(['CHK BRST 1KG']);
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

  it('reads its before-snapshot inside the transaction it commits', () => {
    createPurchase(opened.db, order('shop', ['CHK BRST 1KG']));
    const outsideTheTransaction = vi.spyOn(opened.db, 'select');

    const report = runProposalPass(opened.db, { write: true });

    // Every read goes through the transaction handle. A snapshot taken on the
    // bare connection would report a write that landed between it and the
    // pass as something the pass did — on the one run whose output is the
    // only surviving record of what it deleted.
    expect(outsideTheTransaction).not.toHaveBeenCalled();
    expect(report.outcome.proposed).toBe(1);
  });
});

describe('the command', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'propose-products-cli-'));
    path = join(dir, 'purchases.db');
    vi.stubEnv('PURCHASES_SQLITE_PATH', path);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('names the file it is about to read before it opens it', () => {
    const fileExistedAtEachLine: boolean[] = [];
    const printed = vi.spyOn(console, 'warn').mockImplementation(() => {
      fileExistedAtEachLine.push(existsSync(path));
    });

    main([]);

    // Opening creates the file, so a target line printed after the open is a
    // line the operator reads once the run is already under way.
    expect(printed.mock.calls[0]?.[0]).toBe(`preview against ${path}`);
    expect(fileExistedAtEachLine[0]).toBe(false);
    expect(printed.mock.calls.join('\n')).toContain('nothing was written');
    printed.mockRestore();
  });

  it('refuses a mistyped flag before it touches the database', () => {
    expect(() => main(['--wirte'])).toThrow(/--wirte/);

    // openPurchasesDb creates the file and its parent, so an argument checked
    // after the open would leave one behind for a run that never happened.
    expect(existsSync(path)).toBe(false);
  });

  it('commits through -- --write, which is how pnpm passes the flag', () => {
    const seeded = openPurchasesDb(path);
    seedSource(seeded.db);
    createPurchase(seeded.db, order('shop', ['CHK BRST 1KG']));
    seeded.raw.close();
    const printed = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    main(['--', '--write']);

    printed.mockRestore();
    const reopened = openPurchasesDb(path);
    expect(listProducts(reopened.db).map(({ product }) => product.label)).toEqual(['CHK BRST 1KG']);
    reopened.raw.close();
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
    deletedProducts: [],
  };

  it('names the file and the mode before the run starts', () => {
    expect(describePassTarget({ path: '/data/purchases.db', write: false })).toBe(
      'preview against /data/purchases.db'
    );
    expect(describePassTarget({ path: '/data/purchases.db', write: true })).toBe(
      'writing to /data/purchases.db'
    );
  });

  it('says nothing was written, and says how to write', () => {
    const text = describePassReport(report, { path: '/data/purchases.db', write: false });

    expect(text).toContain('would mint 3 entries, retire 0 and delete 0 products');
    expect(text).toContain('nothing was written');
    expect(text).toContain('--write');
  });

  it('samples the wordings rather than printing all of them', () => {
    const text = describePassReport(report, { path: '/data/purchases.db', write: true });

    expect(text).toContain('WORDING 9');
    expect(text).not.toContain('WORDING 10');
    expect(text).toContain('… and 2 more');
    expect(text).toContain('minted 3 entries, retired 0 and deleted 0 products');
    expect(text).not.toContain('nothing was written');
  });

  it('leaves a deleted product unnamed when a retire line already names it', () => {
    const retired = [{ scopeKey: 'source:woolworths', printedName: 'MILK 2L' }];
    const text = describePassReport(
      { ...report, retired, deletedProducts: ['MILK 2L', 'Full-cream milk 2L'] },
      { path: '/data/purchases.db', write: false }
    );

    expect(text).toContain('retire source:woolworths · MILK 2L');
    expect(text).toContain('delete product "Full-cream milk 2L"');
    expect(text).not.toContain('delete product "MILK 2L"');
    expect(text).toContain('delete 2 products');
  });
});

function namesOf(entries: PassReport['minted']): readonly string[] {
  return entries.map((entry) => entry.printedName).toSorted((a, b) => a.localeCompare(b));
}
