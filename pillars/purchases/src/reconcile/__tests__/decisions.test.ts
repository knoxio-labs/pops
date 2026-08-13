/**
 * What a decision in the reconcile queue leaves behind.
 *
 * Against a real database and the real sweep, because the property that
 * matters is not "a row was written" — it is that the NEXT sweep behaves
 * differently. Every test here that asserts a rule or a rejection exists is
 * followed by one that re-runs the whole reconciliation and checks the
 * question is not asked again; the first alone would pass just as happily
 * for a table nothing reads.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { financeReturning } from '../../api/finance/__tests__/fixtures.js';
import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import {
  confirmLink,
  createPurchase,
  listReconcileQueue,
  rejectLink,
  unlinkCharge,
  upsertSource,
} from '../../db/index.js';
import { runSweep } from '../sweep.js';

import type { FinanceClient } from '../../api/finance/client.js';
import type { CreatePurchaseInput, OpenedPurchasesDb, PurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let db: PurchasesDb;

beforeEach(() => {
  const temp = openTempDb();
  opened = temp.opened;
  cleanup = temp.cleanup;
  db = opened.db;
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

const NOW = '2026-03-10T00:00:00Z';

function anOrder(overrides: Partial<CreatePurchaseInput> & { checksum: string }): string {
  return createPurchase(db, {
    source: 'amazon',
    ingestMethod: 'export',
    orderedAt: '2026-03-04T00:00:00Z',
    currency: 'AUD',
    totalCents: 4128,
    sourceOrderId: overrides.checksum,
    merchantEntityName: 'Amazon',
    ...overrides,
  });
}

const deps = (finance: FinanceClient) => ({ db, finance, defaultWindowDays: 21 });

interface RuleRow {
  id: string;
  descriptionPattern: string;
  matchType: string;
  source: string | null;
  entityId: string | null;
  entityName: string | null;
  isActive: number;
  confidence: number;
  timesApplied: number;
  lastUsedAt: string | null;
}

function ruleRows(): RuleRow[] {
  return opened.raw
    .prepare(
      `SELECT id, description_pattern as descriptionPattern, match_type as matchType,
              source, entity_id as entityId, entity_name as entityName,
              is_active as isActive, confidence, times_applied as timesApplied,
              last_used_at as lastUsedAt
       FROM purchase_match_rules ORDER BY description_pattern, source`
    )
    .all() as RuleRow[];
}

interface LinkRow {
  chargeId: string;
  uri: string;
  description: string | null;
  confirmedAt: string | null;
  matchRuleId: string | null;
}

function linkRows(): LinkRow[] {
  return opened.raw
    .prepare(
      `SELECT charge_id as chargeId, transaction_uri as uri,
              transaction_description as description, confirmed_at as confirmedAt,
              match_rule_id as matchRuleId
       FROM purchase_charge_links ORDER BY transaction_uri`
    )
    .all() as LinkRow[];
}

function rejectionRows(): { chargeId: string; uri: string; rejectedAt: string }[] {
  return opened.raw
    .prepare(
      `SELECT charge_id as chargeId, transaction_uri as uri, rejected_at as rejectedAt
       FROM purchase_link_rejections ORDER BY transaction_uri`
    )
    .all() as { chargeId: string; uri: string; rejectedAt: string }[];
}

function onlyLink(): LinkRow {
  const rows = linkRows();
  const [row] = rows;
  if (row === undefined) throw new Error(`expected exactly one link, got ${String(rows.length)}`);
  return row;
}

describe('the descriptor a decision is made about', () => {
  it('is recorded on the link the sweep proposes', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1', description: 'AMAZON MKTPLACE AU 4128' })));

    expect(onlyLink().description).toBe('AMAZON MKTPLACE AU 4128');
  });

  it('reaches the queue, so a reader sees what the decision is about', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1', description: 'AMAZON MKTPLACE AU 4128' })));

    const [entry] = listReconcileQueue(db);
    expect(entry?.proposed[0]?.transactionDescription).toBe('AMAZON MKTPLACE AU 4128');
  });
});

describe('confirming teaches the matcher', () => {
  it('writes a rule keyed on the merchant, scoped to the order source', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1', description: 'AMAZON MKTPLACE AU 4128' })));
    const link = onlyLink();

    const outcome = confirmLink(db, link.chargeId, link.uri, NOW);

    expect(outcome.pinned).toBe(true);
    const rules = ruleRows();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      id: outcome.matchRuleId,
      // Digits stripped: the trailing 4128 is this order's amount, not the
      // merchant, and a rule carrying it would fire exactly once ever.
      descriptionPattern: 'AMAZON MKTPLACE AU',
      matchType: 'exact',
      source: 'amazon',
      entityName: 'Amazon',
      isActive: 1,
      timesApplied: 1,
    });
    expect(rules[0]?.lastUsedAt).not.toBeNull();
  });

  it('attributes the link to the rule it wrote', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1' })));
    const proposed = onlyLink();

    const outcome = confirmLink(db, proposed.chargeId, proposed.uri, NOW);

    const link = onlyLink();
    expect(link.confirmedAt).toBe(NOW);
    // The FK was decorative before anything wrote a rule. A link that names
    // no rule cannot be explained by one later, so the id has to be real
    // rather than merely agreeing with the outcome's own null.
    expect(link.matchRuleId).toEqual(expect.any(String));
    expect(link.matchRuleId).toBe(outcome.matchRuleId);
  });

  it('pins without a rule when the descriptor names no merchant', async () => {
    anOrder({ checksum: 'a' });
    // A terminal that emits a bare reference. The source pattern is
    // `AMAZON%`, so the candidate has to get past blocking some other way:
    // this order's source declares none.
    upsertSource(db, { id: 'terminal', label: 'Terminal', settlementWindowDays: 21 });
    anOrder({ checksum: 'b', source: 'terminal', sourceOrderId: 'b' });
    await runSweep(deps(financeReturning({ id: 't1', description: '4471 0092' })));

    const link = linkRows().find((row) => row.description === '4471 0092');
    if (link === undefined) throw new Error('expected the bare-reference link');

    const outcome = confirmLink(db, link.chargeId, link.uri, NOW);

    // The decision still stands. Refusing the pin over a merchant we cannot
    // name would lose a real answer to protect an empty rule.
    expect(outcome).toEqual({ pinned: true, matchRuleId: null });
    expect(ruleRows()).toHaveLength(0);
  });

  it('reports the link is gone rather than inventing a rule for it', () => {
    const purchaseId = anOrder({ checksum: 'a' });

    expect(confirmLink(db, purchaseId, 'pops://finance/transaction/t1', NOW)).toEqual({
      pinned: false,
      matchRuleId: null,
    });
    expect(ruleRows()).toHaveLength(0);
  });
});

describe('re-deciding does not duplicate', () => {
  it('reuses one rule across every order from the same merchant', async () => {
    anOrder({ checksum: 'a' });
    anOrder({ checksum: 'b', totalCents: 2200 });
    await runSweep(
      deps(
        financeReturning(
          { id: 't1', description: 'AMAZON MKTPLACE AU 4128', amountCents: 4128 },
          { id: 't2', description: 'AMAZON MKTPLACE AU 2200', amountCents: 2200 }
        )
      )
    );

    const ruleIds = linkRows().map(
      (link) => confirmLink(db, link.chargeId, link.uri, NOW).matchRuleId
    );

    expect(new Set(ruleIds).size).toBe(1);
    const rules = ruleRows();
    expect(rules).toHaveLength(1);
    // One count per attribution earned. Both links name the rule, and both
    // are attributions a later ranking is entitled to weigh.
    expect(rules[0]?.timesApplied).toBe(2);
    expect(linkRows().every((link) => link.matchRuleId === rules[0]?.id)).toBe(true);
  });

  it('counts nothing extra when the same link is confirmed twice', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1' })));
    const link = onlyLink();

    const first = confirmLink(db, link.chargeId, link.uri, NOW);
    const second = confirmLink(db, link.chargeId, link.uri, '2026-03-11T00:00:00Z');

    expect(second).toEqual(first);
    expect(ruleRows()).toHaveLength(1);
    // The counter is never revised downward, so a double-click's extra
    // count would be permanent. That is what makes the no-op load-bearing
    // rather than tidy.
    expect(ruleRows()[0]?.timesApplied).toBe(1);
    expect(onlyLink().confirmedAt).toBe(NOW);
  });

  it('leaves the count alone when a confirmed link is taken back', async () => {
    // `timesApplied` is a history, not a live count of the links naming the
    // rule. Decrementing here would make it look exact while still drifting
    // the moment a purchase's cascade removes a link, and a counter that
    // looks exact and is not is worse than one that says what it is.
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1' })));
    const link = onlyLink();
    const { matchRuleId } = confirmLink(db, link.chargeId, link.uri, NOW);

    unlinkCharge(db, link.chargeId, link.uri);

    expect(linkRows()).toHaveLength(0);
    expect(ruleRows()).toMatchObject([{ id: matchRuleId, timesApplied: 1, isActive: 1 }]);
  });

  it('counts a re-confirmation after a rejection, because it is a new one', async () => {
    // The rule explained a link, lost it, and explained another. Both are
    // real applications; collapsing them would hide that the operator had
    // to answer twice.
    anOrder({ checksum: 'a' });
    const finance = financeReturning({ id: 't1' });
    await runSweep(deps(finance));
    const first = onlyLink();
    confirmLink(db, first.chargeId, first.uri, NOW);
    rejectLink(db, first.chargeId, first.uri, NOW);

    anOrder({ checksum: 'b', sourceOrderId: 'b' });
    await runSweep(deps(finance));
    const second = onlyLink();
    confirmLink(db, second.chargeId, second.uri, NOW);

    expect(ruleRows()).toHaveLength(1);
    expect(ruleRows()[0]?.timesApplied).toBe(2);
  });
});

describe('a rule belongs to the merchant it was learned from', () => {
  it('does not answer for an unrelated merchant', async () => {
    upsertSource(db, {
      id: 'woolworths',
      label: 'Woolworths',
      descriptorPattern: 'WOOLWORTHS%',
      settlementWindowDays: 21,
    });
    anOrder({ checksum: 'a' });
    anOrder({
      checksum: 'w',
      source: 'woolworths',
      sourceOrderId: 'w',
      totalCents: 2200,
      merchantEntityName: 'Woolworths',
    });
    await runSweep(
      deps(
        financeReturning(
          { id: 't1', description: 'AMAZON MKTPLACE AU', amountCents: 4128 },
          { id: 't2', description: 'WOOLWORTHS 1234 SYDNEY', amountCents: 2200 }
        )
      )
    );

    for (const link of linkRows()) confirmLink(db, link.chargeId, link.uri, NOW);

    // Two merchants, two rules, and neither one scoped to the other's
    // source — a rule that applied everywhere would let one accepted
    // grocery shop speak for every Amazon order.
    expect(ruleRows().map((rule) => [rule.source, rule.descriptionPattern])).toEqual([
      ['amazon', 'AMAZON MKTPLACE AU'],
      ['woolworths', 'WOOLWORTHS SYDNEY'],
    ]);
  });

  it('keeps one rule per source when two merchants share a descriptor', async () => {
    // A marketplace reselling under one bank descriptor. The pattern is the
    // same string; the decision was still made about two different sources,
    // and collapsing them would let one answer the other's questions.
    upsertSource(db, {
      id: 'amazon-au',
      label: 'Amazon AU',
      descriptorPattern: 'AMAZON%',
      settlementWindowDays: 21,
    });
    anOrder({ checksum: 'a' });
    anOrder({ checksum: 'b', source: 'amazon-au', sourceOrderId: 'b', totalCents: 2200 });
    await runSweep(
      deps(
        financeReturning(
          { id: 't1', description: 'AMAZON MKTPLACE AU', amountCents: 4128 },
          { id: 't2', description: 'AMAZON MKTPLACE AU', amountCents: 2200 }
        )
      )
    );

    for (const link of linkRows()) confirmLink(db, link.chargeId, link.uri, NOW);

    expect(ruleRows().map((rule) => rule.source)).toEqual(['amazon', 'amazon-au']);
  });
});

describe('rejecting survives the next sweep', () => {
  it('removes the link and remembers the pairing', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1' })));
    const link = onlyLink();

    expect(rejectLink(db, link.chargeId, link.uri, NOW)).toBe(true);

    expect(linkRows()).toHaveLength(0);
    expect(rejectionRows()).toEqual([{ chargeId: link.chargeId, uri: link.uri, rejectedAt: NOW }]);
  });

  it('is not proposed again by a sweep over the same data', async () => {
    // The whole point. Deleting a link is easy; not being asked again is
    // what a reject has to mean.
    anOrder({ checksum: 'a' });
    const finance = financeReturning({ id: 't1' });
    await runSweep(deps(finance));
    const link = onlyLink();
    rejectLink(db, link.chargeId, link.uri, NOW);

    await runSweep(deps(finance));

    expect(linkRows()).toHaveLength(0);
    // The charge is back in the queue as unexplained rather than contested,
    // which is the honest state: nothing settles it that we know of.
    const [entry] = listReconcileQueue(db);
    expect(entry?.proposed).toEqual([]);
  });

  it('leaves the transaction free for the charge it does settle', async () => {
    // A rejection says these two are not a pair. It does not spend the
    // transaction — the order that really paid it must still be able to.
    anOrder({ checksum: 'a' });
    anOrder({ checksum: 'b', sourceOrderId: 'b' });
    const finance = financeReturning({ id: 't1' });
    await runSweep(deps(finance));

    const first = onlyLink();
    rejectLink(db, first.chargeId, first.uri, NOW);
    await runSweep(deps(finance));

    const remaining = onlyLink();
    expect(remaining.uri).toBe(first.uri);
    expect(remaining.chargeId).not.toBe(first.chargeId);
  });

  it('is one decision however many times it is made', async () => {
    anOrder({ checksum: 'a' });
    await runSweep(deps(financeReturning({ id: 't1' })));
    const link = onlyLink();
    rejectLink(db, link.chargeId, link.uri, NOW);

    // The link is already gone, so there is nothing left to reject — and
    // the record of the first decision must not be restamped.
    expect(rejectLink(db, link.chargeId, link.uri, '2026-03-12T00:00:00Z')).toBe(false);
    expect(rejectionRows()).toEqual([{ chargeId: link.chargeId, uri: link.uri, rejectedAt: NOW }]);
  });

  it('is what unlinking is not', async () => {
    // The contrast that justifies keeping both. An unlink is temporary by
    // design; if this test ever matched the reject one above, the two
    // decisions would have collapsed into one.
    anOrder({ checksum: 'a' });
    const finance = financeReturning({ id: 't1' });
    await runSweep(deps(finance));
    const link = onlyLink();

    unlinkCharge(db, link.chargeId, link.uri);
    await runSweep(deps(finance));

    expect(linkRows()).toHaveLength(1);
    expect(rejectionRows()).toHaveLength(0);
  });
});
