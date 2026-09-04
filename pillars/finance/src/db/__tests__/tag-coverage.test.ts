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
  type ClassifiedTagFacet,
  type FacetCoverage,
  type FacetExclusionReason,
  type OpenedFinanceDb,
} from '../index.js';
import { seededAccountId } from './seeded-account.js';

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
      accountId: seededAccountId(opened.db, 'Amex'),
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
  active: string[] = [],
  retired: string[] = []
): ReturnType<typeof tagCoverageService.measureTagCoverage> {
  return tagCoverageService.measureTagCoverage(opened.db, {
    active,
    known: [...active, ...retired],
  });
}

function facet(
  coverage: ReturnType<typeof tagCoverageService.measureTagCoverage>,
  name: ClassifiedTagFacet
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

/** How many rows one of a facet's own exclusion rules removed. */
function excludedFor(
  coverage: ReturnType<typeof tagCoverageService.measureTagCoverage>,
  name: ClassifiedTagFacet,
  reason: FacetExclusionReason
): number {
  const entry = facet(coverage, name).excluded.find((row) => row.reason === reason);
  return entry?.transactions ?? 0;
}

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

    const coverage = measure();

    expect(facet(coverage, 'occasion')).toMatchObject({ addressable: 0, missing: 0 });
    expect(excludedFor(coverage, 'occasion', 'transit')).toBe(2);
  });

  it('still requires contains: on a transit row — the exclusion is occasion-only', () => {
    txn('E-TOLL PAYMENT', ['contains:tolls']);

    const coverage = measure();

    expect(facet(coverage, 'contains')).toMatchObject({ addressable: 1, covered: 1 });
    expect(facet(coverage, 'venue').excluded).toEqual([]);
  });

  // Unconditional on purpose: excluding only the transit rows that LACK an
  // occasion would make the ratio flattering by construction — every row would
  // be covered or excluded and the number would always read 100%.
  it('excludes a transit row even when it does carry an occasion', () => {
    txn('AMPOL', ['contains:charging', 'occasion:travel']);

    const coverage = measure();

    expect(facet(coverage, 'occasion')).toMatchObject({ addressable: 0, covered: 0 });
    expect(excludedFor(coverage, 'occasion', 'transit')).toBe(1);
  });

  it('does not exclude rideshare or flight, which always carry one already', () => {
    txn('UBER TRIP', ['contains:rideshare']);
    txn('VIRGIN AUSTRALIA', ['contains:flight']);

    const coverage = measure();

    expect(facet(coverage, 'occasion')).toMatchObject({ addressable: 2, missing: 2 });
    expect(excludedFor(coverage, 'occasion', 'transit')).toBe(0);
  });

  it('keeps a transit descriptor off the rule worklist', () => {
    txn('TFNSW OPAL FARE', ['contains:public-transport']);

    expect(measure().gaps).toEqual([]);
  });
});

describe('measureTagCoverage — a convenience store cannot say what it sold', () => {
  // The bank feed gives the merchant name and nothing else, and a servo kiosk
  // sells drinks, snacks, chargers and lottery tickets from one counter. The
  // value is unknowable rather than un-triaged, so the row is outside the
  // contains: denominator instead of counting as a miss (POPS-2681).
  it('excludes a convenience-store row from the contains denominator', () => {
    txn('METRO PETROLEUM', ['venue:convenience-store', 'occasion:out']);

    const coverage = measure();

    expect(facet(coverage, 'contains')).toMatchObject({ addressable: 0, missing: 0, covered: 0 });
    expect(excludedFor(coverage, 'contains', 'unknowable-contents')).toBe(1);
  });

  // The same discipline the transit rule is held to. Excluding only the rows
  // that LACK a contains: would make the ratio flattering by construction.
  it('excludes a convenience-store row even when it does carry a contains', () => {
    txn('EZYMART', ['venue:convenience-store', 'occasion:out', 'contains:food']);

    const coverage = measure();

    expect(facet(coverage, 'contains')).toMatchObject({ addressable: 0, covered: 0, missing: 0 });
    expect(excludedFor(coverage, 'contains', 'unknowable-contents')).toBe(1);
  });

  it('keeps the row inside the occasion and venue denominators', () => {
    txn('METRO PETROLEUM', ['venue:convenience-store']);

    const coverage = measure();

    expect(facet(coverage, 'occasion')).toMatchObject({ addressable: 1, missing: 1 });
    expect(facet(coverage, 'venue')).toMatchObject({ addressable: 1, covered: 1 });
    expect(excludedFor(coverage, 'occasion', 'unknowable-contents')).toBe(0);
  });

  it('reduces the denominator rather than counting the row as covered', () => {
    txn('WOOLWORTHS', ['venue:supermarket', 'occasion:home', 'contains:groceries']);
    txn('METRO PETROLEUM', ['venue:convenience-store', 'occasion:out']);

    const contains = facet(measure(), 'contains');

    expect(contains.addressable).toBe(1);
    expect(contains.covered).toBe(1);
    expect(contains.missing).toBe(0);
  });

  it('does not exclude another venue that happens to sell mixed goods', () => {
    txn('BIG W', ['venue:supermarket', 'occasion:home']);

    const coverage = measure();

    expect(facet(coverage, 'contains')).toMatchObject({ addressable: 1, missing: 1 });
    expect(excludedFor(coverage, 'contains', 'unknowable-contents')).toBe(0);
  });

  it('keeps a convenience-store descriptor off the rule worklist when only contains is absent', () => {
    txn('METRO PETROLEUM', ['venue:convenience-store', 'occasion:out']);

    expect(measure().gaps).toEqual([]);
  });

  it('still lists the descriptor when a facet it IS addressable for is absent', () => {
    txn('METRO PETROLEUM', ['venue:convenience-store']);

    expect(measure().gaps).toEqual([
      { description: 'METRO PETROLEUM', transactions: 1, missingFacets: ['occasion'] },
    ]);
  });

  it('lets isCoverageComplete pass on a ledger whose only gap is convenience-store contents', () => {
    txn('METRO PETROLEUM', ['venue:convenience-store', 'occasion:out']);

    expect(
      tagCoverageService.isCoverageComplete(measure(['venue:convenience-store', 'occasion:out']))
    ).toBe(true);
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

    expect(coverage.outsideVocabulary).toEqual([
      { tag: 'occasion:travel', transactions: 1, retired: false, unflagged: 1 },
    ]);
  });

  it('counts a tag repeated on one row only once', () => {
    txn('ODD', ['venue:bar', 'venue:bar']);

    expect(measure([]).outsideVocabulary).toEqual([
      { tag: 'venue:bar', transactions: 1, retired: false, unflagged: 1 },
    ]);
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

describe('isCoverageComplete — a retired tag on a flagged row is tracked elsewhere', () => {
  // The retirement migrations (0071, 0073) deliberately leave a row carrying a
  // retired value when they cannot resolve it, because the tag is the only
  // surviving evidence of what the row is, and flag it so the debt is recorded.
  // Gating on that pair reports one debt twice and turns the coverage gate into
  // a "has anyone written the classifier pattern yet" gate (POPS-2683).
  it('passes when every row carrying the retired value is flagged for review', () => {
    txn('VIRGIN AUSTRALIA', ['occasion:travel', 'contains:fee', 'flag:needs-review']);

    const coverage = measure(['occasion:travel', 'flag:needs-review'], ['contains:fee']);

    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(true);
  });

  // The audit reports what it saw; only the gate changed. A stranded tag that
  // stops being printed is a debt that stops being visible.
  it('still reports the retired tag even though it does not gate', () => {
    txn('VIRGIN AUSTRALIA', ['occasion:travel', 'contains:fee', 'flag:needs-review']);

    const coverage = measure(['occasion:travel', 'flag:needs-review'], ['contains:fee']);

    expect(coverage.outsideVocabulary).toEqual([
      { tag: 'contains:fee', transactions: 1, retired: true, unflagged: 0 },
    ]);
  });

  it('fails when the same retired value sits on a row nobody flagged', () => {
    txn('VIRGIN AUSTRALIA', ['occasion:travel', 'contains:fee']);

    const coverage = measure(['occasion:travel'], ['contains:fee']);

    expect(coverage.outsideVocabulary[0]).toMatchObject({ retired: true, unflagged: 1 });
    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(false);
  });

  // One unflagged row is enough. The exemption is per value, not per row, so a
  // value must be fully accounted for before it stops gating.
  it('fails when one of several rows carrying the retired value is unflagged', () => {
    txn('VIRGIN AUSTRALIA', ['occasion:travel', 'contains:fee', 'flag:needs-review']);
    txn('QANTAS', ['occasion:travel', 'contains:fee']);

    const coverage = measure(['occasion:travel', 'flag:needs-review'], ['contains:fee']);

    expect(coverage.outsideVocabulary[0]).toMatchObject({ transactions: 2, unflagged: 1 });
    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(false);
  });

  // The exemption is for values the vocabulary retired, not for typos. A flag
  // does not excuse a value nothing ever seeded.
  it('fails on a value the vocabulary has never held, flagged or not', () => {
    txn('MYSTERY', ['occasion:out', 'contains:typo', 'flag:needs-review']);

    const coverage = measure(['occasion:out', 'flag:needs-review']);

    expect(coverage.outsideVocabulary[0]).toMatchObject({ tag: 'contains:typo', retired: false });
    expect(tagCoverageService.isCoverageComplete(coverage)).toBe(false);
  });

  it('leaves a ledger with no flagged rows behaving exactly as before', () => {
    txn('WOOLWORTHS', ['venue:supermarket', 'occasion:home', 'contains:groceries']);

    expect(
      tagCoverageService.isCoverageComplete(
        measure(['venue:supermarket', 'occasion:home', 'contains:groceries'])
      )
    ).toBe(true);
    expect(tagCoverageService.isCoverageComplete(measure(['venue:supermarket']))).toBe(false);
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
