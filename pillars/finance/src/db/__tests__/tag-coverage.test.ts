/**
 * Facet-completeness measurement over the ledger (POPS-2607).
 *
 * Fixtures model the shapes the migration actually left behind: a purchase with
 * no occasion, an `enrich:`-blocked row that must be excluded rather than
 * counted as a gap, the non-spend rows (`transfer`, `fee`) that these facets
 * cannot apply to at all, the stored two-venue rows POPS-2606 left for this
 * ticket to clean, and a repeated merchant that wants one rule rather than one
 * decision per row.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type TransactionType } from '../../contract/corrections-constants.js';
import {
  openFinanceDb,
  tagCoverageService,
  transactions,
  type ClosedTagFacet,
  type FacetCoverage,
  type OpenedFinanceDb,
} from '../index.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

function txnWithRawTags(
  description: string,
  tags: string,
  type: TransactionType = 'purchase'
): void {
  opened.db
    .insert(transactions)
    .values({
      description,
      account: 'Amex',
      amountCents: -1000,
      date: '2026-01-01',
      type,
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      tags,
    })
    .run();
}

function txn(description: string, tags: string[], type: TransactionType = 'purchase'): void {
  txnWithRawTags(description, JSON.stringify(tags), type);
}

function measure(
  vocabulary: string[] = []
): ReturnType<typeof tagCoverageService.measureTagCoverage> {
  return tagCoverageService.measureTagCoverage(opened.db, vocabulary);
}

function facet(
  coverage: ReturnType<typeof tagCoverageService.measureTagCoverage>,
  name: ClosedTagFacet
): FacetCoverage {
  const found = coverage.facets.find((f) => f.facet === name);
  if (!found) throw new Error(`no coverage reported for ${name}`);
  return found;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-tag-coverage-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('measureTagCoverage — the addressable set', () => {
  it('counts a row with no occasion as missing it, not as absent data', () => {
    txn('WOOLWORTHS 1034', ['venue:supermarket', 'contains:groceries']);

    const occasion = facet(measure(), 'occasion');

    expect(occasion.addressable).toBe(1);
    expect(occasion.missing).toBe(1);
    expect(occasion.covered).toBe(0);
  });

  it('excludes an enrich:-blocked row from every facet rather than calling it a gap', () => {
    txn('AMAZON MARKETPLACE AU', ['enrich:pending']);

    const coverage = measure();

    for (const name of ['venue', 'occasion', 'contains'] as const) {
      expect(facet(coverage, name).addressable).toBe(0);
      expect(facet(coverage, name).missing).toBe(0);
      expect(facet(coverage, name).enrichExcluded).toBe(1);
    }
  });

  it('excludes a fee from the three spend facets while still measuring fee: on it', () => {
    txn('INTEREST CHARGES', ['fee:interest'], 'fee');

    const coverage = measure();

    for (const name of ['venue', 'occasion', 'contains'] as const) {
      expect(facet(coverage, name).addressable).toBe(0);
      expect(facet(coverage, name).nonSpendExcluded).toBe(1);
    }
    expect(facet(coverage, 'fee')).toMatchObject({ addressable: 1, covered: 1, missing: 0 });
  });

  it('excludes a transfer — the same dollars are counted where they were spent', () => {
    txn('PayID Payment Received, Thank you', [], 'transfer');

    const occasion = facet(measure(), 'occasion');

    expect(occasion.addressable).toBe(0);
    expect(occasion.nonSpendExcluded).toBe(1);
    expect(occasion.missing).toBe(0);
  });

  it('addresses a refund and a reversal — both are spend, just signed the other way', () => {
    txn('REFUND MYER', ['venue:department-store'], 'refund');
    txn('REVERSAL', ['venue:cafe'], 'reversal');

    expect(facet(measure(), 'occasion')).toMatchObject({ addressable: 2, missing: 2 });
  });

  it('does not let an enrich: row be double-counted as a non-spend exclusion', () => {
    txn('AMAZON GIFT CARD', ['enrich:pending'], 'transfer');

    const venue = facet(measure(), 'venue');

    expect(venue.enrichExcluded).toBe(1);
    expect(venue.nonSpendExcluded).toBe(0);
  });
});

describe('measureTagCoverage — venue is measured but not required', () => {
  // A toll, a subscription, an online service: real spend at no place at all.
  // Requiring a venue there would force inventing a value that restates
  // `channel:online`, so the axis is deliberately partial (POPS-2607).
  it('still counts venue coverage, so the partial axis is visible', () => {
    txn('E-TOLL PAYMENT', ['occasion:admin-free', 'contains:tolls']);
    txn('PALMS ON OXFORD', ['venue:pub', 'occasion:out', 'contains:alcohol']);

    const venue = facet(measure(), 'venue');

    expect(venue).toMatchObject({ required: false, addressable: 2, covered: 1, missing: 1 });
  });

  it('does not call a row incomplete for want of a venue', () => {
    txn('GOOGLE *YOUTUBEPREMIUM', ['occasion:home', 'contains:subscription']);

    const coverage = measure(['occasion:home', 'contains:subscription']);

    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(true);
  });

  it('keeps a descriptor missing only venue off the rule worklist', () => {
    txn('CURSOR, AI POWERED IDE', ['occasion:work', 'contains:software']);

    expect(measure().gaps).toEqual([]);
  });

  it('still lists a descriptor missing a required facet alongside venue', () => {
    txn('PAYPAL *PYPL PAYIN4', []);

    expect(measure().gaps).toEqual([
      {
        description: 'PAYPAL *PYPL PAYIN4',
        transactions: 1,
        missingFacets: ['contains', 'occasion'],
      },
    ]);
  });
});

describe('measureTagCoverage — transit has no occasion of its own', () => {
  // The occasion is whatever you travelled to, recorded on that transaction —
  // not on the fare. Requiring one on a toll would force a guess (POPS-2607).
  it('excludes a toll and a fare from the occasion denominator', () => {
    txn('E-TOLL PAYMENT', ['contains:tolls']);
    txn('TFNSW OPAL FARE', ['contains:public-transport']);

    const occasion = facet(measure(), 'occasion');

    expect(occasion).toMatchObject({ addressable: 0, missing: 0, transitExcluded: 2 });
  });

  it('still requires contains: on a transit row — the exclusion is occasion-only', () => {
    txn('E-TOLL PAYMENT', ['contains:tolls']);

    const coverage = measure();

    expect(facet(coverage, 'contains')).toMatchObject({ addressable: 1, covered: 1 });
    expect(facet(coverage, 'venue').transitExcluded).toBe(0);
  });

  // Unconditional on purpose: excluding only the transit rows that LACK an
  // occasion would make the ratio flattering by construction — every row would
  // be covered or excluded and the number would always read 100%.
  it('excludes a transit row even when it does carry an occasion', () => {
    txn('AMPOL', ['contains:charging', 'occasion:travel']);

    expect(facet(measure(), 'occasion')).toMatchObject({
      transitExcluded: 1,
      addressable: 0,
      covered: 0,
    });
  });

  it('does not exclude rideshare or flight, which always carry one already', () => {
    txn('UBER TRIP', ['contains:rideshare']);
    txn('VIRGIN AUSTRALIA', ['contains:flight']);

    expect(facet(measure(), 'occasion')).toMatchObject({
      addressable: 2,
      missing: 2,
      transitExcluded: 0,
    });
  });

  it('keeps a transit descriptor off the rule worklist', () => {
    txn('TFNSW OPAL FARE', ['contains:public-transport']);

    expect(measure().gaps).toEqual([]);
  });
});

describe('measureTagCoverage — cardinality', () => {
  it('reports a stored two-venue row as a violation and still counts it covered', () => {
    txn('LUCKY CAT', ['venue:restaurant', 'venue:bar', 'occasion:out']);

    const venue = facet(measure(), 'venue');

    expect(venue.cardinalityViolations).toBe(1);
    expect(venue.covered).toBe(1);
    expect(venue.missing).toBe(0);
  });

  it('never reports a violation on a genuinely multi-valued facet', () => {
    txn('HARRIS FARM MARKETS', ['contains:food', 'contains:groceries', 'venue:supermarket']);

    expect(facet(measure(), 'contains').cardinalityViolations).toBe(0);
  });
});

describe('measureTagCoverage — vocabulary and histogram', () => {
  it('lists a stored tag that is not in the active vocabulary, counted once per row', () => {
    txn('FAT COW', ['venue:restaurant', 'occasion:travel']);
    txn('FAT COW', ['venue:restaurant']);

    const coverage = measure(['venue:restaurant']);

    expect(coverage.outsideVocabulary).toEqual([{ tag: 'occasion:travel', transactions: 1 }]);
  });

  it('counts a tag repeated on one row only once', () => {
    txn('ODD', ['venue:bar', 'venue:bar']);

    expect(measure([]).outsideVocabulary).toEqual([{ tag: 'venue:bar', transactions: 1 }]);
  });

  it('reports a dense histogram including the empty buckets between', () => {
    txn('none', []);
    txn('three', ['venue:bar', 'occasion:out', 'contains:drinks']);

    expect(measure().tagCountHistogram).toEqual([
      { tags: 0, transactions: 1 },
      { tags: 1, transactions: 0 },
      { tags: 2, transactions: 0 },
      { tags: 3, transactions: 1 },
    ]);
  });

  it('treats an unparseable tags column as no tags rather than throwing', () => {
    txnWithRawTags('BROKEN', '{not json');

    const coverage = measure();

    expect(coverage.transactions).toBe(1);
    expect(facet(coverage, 'occasion').missing).toBe(1);
  });
});

describe('measureTagCoverage — the rule worklist', () => {
  it('groups a repeated merchant into one line carrying its full row count', () => {
    for (let i = 0; i < 3; i += 1) txn('WOOLWORTHS 1034 CANTERB', ['venue:supermarket']);
    txn('ONE OFF CAFE', ['venue:cafe']);

    const coverage = measure();

    expect(coverage.gaps).toEqual([
      {
        description: 'WOOLWORTHS 1034 CANTERB',
        transactions: 3,
        missingFacets: ['contains', 'occasion'],
      },
      { description: 'ONE OFF CAFE', transactions: 1, missingFacets: ['contains', 'occasion'] },
    ]);
  });

  it('lists a descriptor whose rows disagree, and only the facets actually missing', () => {
    txn('TFNSW OPAL FARE', ['venue:transport', 'occasion:commute', 'contains:transport']);
    txn('TFNSW OPAL FARE', ['venue:transport', 'contains:transport']);

    expect(measure().gaps).toEqual([
      { description: 'TFNSW OPAL FARE', transactions: 2, missingFacets: ['occasion'] },
    ]);
  });

  it('omits a descriptor whose every row is complete', () => {
    txn('COMPLETE', ['venue:cafe', 'occasion:out', 'contains:coffee']);

    expect(measure().gaps).toEqual([]);
  });

  it('omits an enrich:-blocked descriptor — a rule there would assert a guess', () => {
    txn('AMAZON MARKETPLACE AU', ['enrich:pending']);

    expect(measure().gaps).toEqual([]);
  });

  it('omits a non-spend descriptor — a transfer was not spent on anything', () => {
    for (let i = 0; i < 11; i += 1) txn('PayID Payment Received, Thank you', [], 'transfer');

    expect(measure().gaps).toEqual([]);
  });
});

describe('isCoverageComplete', () => {
  it('is true only when every required facet is present and nothing is off-vocabulary', () => {
    txn('COMPLETE', ['venue:cafe', 'occasion:out', 'contains:coffee']);

    const coverage = measure(['venue:cafe', 'occasion:out', 'contains:coffee']);

    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(true);
  });

  it('is false on a missing required facet', () => {
    txn('GAP', ['venue:cafe', 'occasion:out']);

    expect(tagCoverageService.isCoverageComplete(measure(['venue:cafe', 'occasion:out']))).toBe(
      false
    );
  });

  it('is false on a stored cardinality violation even when nothing is missing', () => {
    const tags = ['venue:restaurant', 'venue:bar', 'occasion:out', 'contains:food'];
    txn('LUCKY CAT', tags);

    expect(tagCoverageService.isCoverageComplete(measure(tags))).toBe(false);
  });

  it('is false on a tag outside the active vocabulary even when coverage is full', () => {
    txn('COMPLETE', ['venue:cafe', 'occasion:out', 'contains:coffee']);

    expect(tagCoverageService.isCoverageComplete(measure(['venue:cafe', 'occasion:out']))).toBe(
      false
    );
  });

  it('is true for a ledger of nothing but enrich:-blocked rows', () => {
    txn('AMAZON MARKETPLACE AU', ['enrich:pending']);

    expect(tagCoverageService.isCoverageComplete(measure(['enrich:pending']))).toBe(true);
  });

  it('is true for a ledger of nothing but transfers, which these facets cannot describe', () => {
    txn('PayID Payment Received, Thank you', [], 'transfer');

    expect(tagCoverageService.isCoverageComplete(measure([]))).toBe(true);
  });
});
