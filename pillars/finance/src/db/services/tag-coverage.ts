/**
 * Measures how *complete* the ledger's tags are, as opposed to how correct
 * (POPS-2607).
 *
 * The 2026-08-28 namespace migration made every stored tag valid; it could not
 * make it present. The old flat vocabulary never asserted most facets, so the
 * relabel had nothing to relabel and 68% of the ledger came out of it with no
 * `occasion:` at all. A missing facet and a negative one are indistinguishable
 * in a query — "spend where `occasion:out`" silently drops every row that never
 * asserted an occasion — so the gap has to be measured before it can be closed,
 * and re-measured after every future import.
 *
 * This module only counts. It writes nothing and decides nothing: which facets
 * a row is expected to carry, and which rows sit outside a facet's denominator,
 * are decided in `tag-coverage-expectations.ts`.
 */
import { isSpendType } from '../../contract/corrections-constants.js';
import { transactions } from '../schema.js';
import {
  CLASSIFIED_TAG_FACETS,
  parseStoredTags,
  TAG_FACET_SEPARATOR,
  type ClassifiedTagFacet,
} from '../tag-facets.js';
import {
  FACET_EXPECTATIONS,
  findExclusion,
  isAddressable,
  isEnrichBlocked,
  type FacetExclusionReason,
  type FacetExpectation,
} from './tag-coverage-expectations.js';
import {
  buildUnknownTagUsage,
  isUntrackedStrandedTag,
  type TagVocabularySnapshot,
  type UnknownTagUsage,
} from './tag-coverage-vocabulary.js';

import type { FinanceDb } from './internal.js';

export type { FacetExclusionReason } from './tag-coverage-expectations.js';
export type { TagVocabularySnapshot, UnknownTagUsage } from './tag-coverage-vocabulary.js';
/** Coverage of one closed facet across the ledger. */
export interface FacetCoverage {
  facet: ClassifiedTagFacet;
  /** True when POPS-2607's acceptance criteria require this facet. */
  required: boolean;
  /** Rows the facet is expected on, after the exclusions below. */
  addressable: number;
  /** Addressable rows carrying at least one value on the facet. */
  covered: number;
  /** Addressable rows carrying none — the work remaining. */
  missing: number;
  /** Rows excluded because they carry an `enrich:` marker. */
  enrichExcluded: number;
  /** Rows excluded because their `type` is not spend — the facet cannot apply. */
  nonSpendExcluded: number;
  /**
   * Rows excluded by this facet's own rules, one entry per rule it carries and
   * zero-valued when a rule matched nothing. Empty on a facet with no rules.
   */
  excluded: { reason: FacetExclusionReason; transactions: number }[];
  /**
   * Addressable rows carrying more than one value on a single-valued facet.
   *
   * Cardinality binds the write path only, so these are stored rows that
   * predate the constraint (POPS-2606) and are this ticket's cleanup. Always
   * zero on a multi-valued facet.
   */
  cardinalityViolations: number;
}

/** A repeated descriptor with a gap — one tag rule, not one decision each. */
export interface DescriptorGap {
  description: string;
  /** How many transactions share this descriptor. */
  transactions: number;
  /** Required facets absent from at least one of those transactions. */
  missingFacets: ClassifiedTagFacet[];
}

/** The whole picture, for a before/after record on the ticket. */
export interface TagCoverage {
  /** Rows scanned. */
  transactions: number;
  facets: FacetCoverage[];
  /** `tags` → how many transactions carry exactly that many. Ascending, dense. */
  tagCountHistogram: { tags: number; transactions: number }[];
  /**
   * Tags stored on a transaction but absent from the active vocabulary.
   *
   * Reported in full whether or not they gate — the audit's job is to say what
   * it saw, and a stranded tag stays visible even when
   * {@link isCoverageComplete} has decided it is already-tracked work.
   */
  outsideVocabulary: UnknownTagUsage[];
  /** Descriptors with a gap, most frequent first — the rule-writing worklist. */
  gaps: DescriptorGap[];
}

interface ScannedRow {
  description: string;
  type: string;
  tags: string[];
}

function valuesOnFacet(tags: string[], facet: string): number {
  const prefix = `${facet}${TAG_FACET_SEPARATOR}`;
  return tags.filter((tag) => tag.startsWith(prefix)).length;
}

function measureFacet(
  expectation: FacetExpectation,
  rows: ScannedRow[],
  single: boolean
): FacetCoverage {
  const coverage: FacetCoverage = {
    facet: expectation.facet,
    required: expectation.required,
    addressable: 0,
    covered: 0,
    missing: 0,
    enrichExcluded: 0,
    nonSpendExcluded: 0,
    excluded: expectation.exclusions.map((exclusion) => ({
      reason: exclusion.reason,
      transactions: 0,
    })),
    cardinalityViolations: 0,
  };

  for (const row of rows) {
    const { tags } = row;
    if (isEnrichBlocked(tags)) {
      coverage.enrichExcluded += 1;
      continue;
    }
    if (expectation.spendOnly && !isSpendType(row.type)) {
      coverage.nonSpendExcluded += 1;
      continue;
    }
    const exclusion = findExclusion(expectation, tags);
    if (exclusion) {
      const tally = coverage.excluded.find((entry) => entry.reason === exclusion.reason);
      if (tally) tally.transactions += 1;
      continue;
    }
    coverage.addressable += 1;
    const values = valuesOnFacet(tags, expectation.facet);
    if (values === 0) coverage.missing += 1;
    else coverage.covered += 1;
    if (single && values > 1) coverage.cardinalityViolations += 1;
  }

  return coverage;
}

function buildHistogram(rows: ScannedRow[]): { tags: number; transactions: number }[] {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.tags.length, (counts.get(row.tags.length) ?? 0) + 1);
  const highest = Math.max(-1, ...counts.keys());
  const histogram: { tags: number; transactions: number }[] = [];
  for (let tags = 0; tags <= highest; tags += 1) {
    histogram.push({ tags, transactions: counts.get(tags) ?? 0 });
  }
  return histogram;
}

/**
 * Group the gaps by descriptor, so the worklist is one line per rule to write
 * rather than one line per row to review. A descriptor is listed when any of
 * its rows is missing a required facet it is addressable for.
 */
function buildGaps(rows: ScannedRow[]): DescriptorGap[] {
  const byDescription = new Map<
    string,
    { transactions: number; missing: Set<ClassifiedTagFacet> }
  >();

  for (const row of rows) {
    let entry = byDescription.get(row.description);
    if (!entry) {
      entry = { transactions: 0, missing: new Set<ClassifiedTagFacet>() };
      byDescription.set(row.description, entry);
    }
    entry.transactions += 1;
    for (const expectation of FACET_EXPECTATIONS) {
      if (!expectation.required) continue;
      if (!isAddressable(expectation, row)) continue;
      if (valuesOnFacet(row.tags, expectation.facet) === 0) entry.missing.add(expectation.facet);
    }
  }

  return [...byDescription.entries()]
    .filter(([, entry]) => entry.missing.size > 0)
    .map(([description, entry]) => ({
      description,
      transactions: entry.transactions,
      missingFacets: [...entry.missing].toSorted((a, b) => a.localeCompare(b)),
    }))
    .toSorted(
      (a, b) => b.transactions - a.transactions || a.description.localeCompare(b.description)
    );
}

/**
 * Measure facet coverage over every transaction in the ledger.
 *
 * `vocabulary` is passed in rather than read here so the caller decides what it
 * contains — the audit script reads the live table, a test supplies a fixture —
 * and so this stays a pure count over two inputs.
 */
export function measureTagCoverage(db: FinanceDb, vocabulary: TagVocabularySnapshot): TagCoverage {
  const rows: ScannedRow[] = db
    .select({
      description: transactions.description,
      type: transactions.type,
      tags: transactions.tags,
    })
    .from(transactions)
    .all()
    .map((row) => ({
      description: row.description,
      type: row.type,
      tags: parseStoredTags(row.tags),
    }));

  const singleByFacet = new Map<string, boolean>(
    CLASSIFIED_TAG_FACETS.map((closed) => [closed.facet, closed.single])
  );

  return {
    transactions: rows.length,
    facets: FACET_EXPECTATIONS.map((expectation) =>
      measureFacet(expectation, rows, singleByFacet.get(expectation.facet) === true)
    ),
    tagCountHistogram: buildHistogram(rows),
    outsideVocabulary: buildUnknownTagUsage(rows, vocabulary),
    gaps: buildGaps(rows),
  };
}

/**
 * True when every acceptance criterion POPS-2607 states as a count is met:
 * no required facet missing, no stored cardinality violation, no tag outside
 * the active vocabulary that something else is not already tracking. Lets the
 * audit script gate rather than only report.
 */
export function isCoverageComplete(coverage: TagCoverage): boolean {
  if (coverage.outsideVocabulary.some(isUntrackedStrandedTag)) return false;
  return coverage.facets.every(
    (facet) => facet.cardinalityViolations === 0 && (!facet.required || facet.missing === 0)
  );
}
