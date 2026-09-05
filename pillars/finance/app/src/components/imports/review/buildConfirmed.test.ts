import { describe, expect, it } from 'vitest';

import {
  buildConfirmedTransactions,
  dropReason,
  isConfirmable,
  partitionConfirmable,
} from './buildConfirmed';

import type { ParsedTransaction } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/importStore';

function matched(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-02-13',
    description: 'WOOLWORTHS 1234',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'chk-1',
    status: 'matched',
    entity: { entityId: 'ent-1', entityName: 'Woolworths', matchType: 'exact' },
    ...overrides,
  };
}

describe('buildConfirmedTransactions', () => {
  it('keeps a matched entity row and carries the matcher provenance', () => {
    const [confirmed] = buildConfirmedTransactions([matched()]);

    expect(confirmed).toMatchObject({
      entityId: 'ent-1',
      entityName: 'Woolworths',
      matchType: 'exact',
    });
    expect(confirmed?.matchRuleId).toBeUndefined();
    expect(confirmed?.matchConfidence).toBeUndefined();
  });

  it('carries confidence for an AI match', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({
        entity: { entityId: 'ent-2', entityName: 'Netflix', matchType: 'ai', confidence: 0.82 },
      }),
    ]);

    expect(confirmed?.matchType).toBe('ai');
    expect(confirmed?.matchConfidence).toBe(0.82);
  });

  it('carries the winning rule id and confidence for a learned-correction match', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({
        entity: {
          entityId: 'ent-3',
          entityName: 'Spotify',
          matchType: 'learned',
          confidence: 0.95,
        },
        ruleProvenance: {
          source: 'correction',
          ruleId: 'rule-1',
          pattern: 'SPOTIFY',
          matchType: 'exact',
          confidence: 0.95,
        },
      }),
    ]);

    expect(confirmed?.matchType).toBe('learned');
    expect(confirmed?.matchRuleId).toBe('rule-1');
    expect(confirmed?.matchConfidence).toBe(0.95);
  });

  it('keeps a transfer row with no entity and no match provenance beyond matchType none', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({ transactionType: 'transfer', entity: { matchType: 'none' } }),
    ]);

    expect(confirmed).toMatchObject({ transactionType: 'transfer', matchType: 'none' });
    expect(confirmed?.entityId).toBeUndefined();
  });

  it('drops a matched row missing both entityId and entityName (no provenance to persist)', () => {
    const result = buildConfirmedTransactions([matched({ entity: { matchType: 'exact' } })]);

    expect(result).toHaveLength(0);
  });

  it('keeps an entity-optional credit type (loan) with no entity — not silently dropped (#3607)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'loan', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ transactionType: 'loan' });
  });

  it('keeps a reversal with no entity — bank-initiated reversals have no merchant (#3757)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'reversal', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ transactionType: 'reversal' });
  });

  it('still drops a refund with no entity (merchant transactions require a payee)', () => {
    const result = buildConfirmedTransactions([
      matched({ transactionType: 'refund', entity: { matchType: 'none' } }),
    ]);

    expect(result).toHaveLength(0);
  });
});

describe('partitionConfirmable (#3765 — dropped rows are surfaced, not lost)', () => {
  it('returns a dropped entity-required row instead of silently discarding it', () => {
    const droppable = matched({ transactionType: 'purchase', entity: { matchType: 'exact' } });
    const { confirmed, dropped } = partitionConfirmable([droppable]);

    expect(confirmed).toHaveLength(0);
    expect(dropped).toEqual([droppable]);
  });

  it('treats an unset transaction type with no entity as droppable (requiresEntity default)', () => {
    const untyped = matched({ transactionType: undefined, entity: { matchType: 'none' } });
    const { confirmed, dropped } = partitionConfirmable([untyped]);

    expect(confirmed).toHaveLength(0);
    expect(dropped).toEqual([untyped]);
  });

  /**
   * POPS-2692. The production shape: a 95%-confidence correction rule whose
   * `entityId` is an outbox placeholder. Both halves of the pair are present,
   * so the old `entityId && entityName` gate passed it straight through to the
   * commit — writing a purchase whose entity resolves to nothing.
   */
  it('drops a purchase whose entity id is a pending:contact placeholder', () => {
    const placeholder = matched({
      transactionType: 'purchase',
      entity: {
        entityId: 'pending:contact:4c42ebf6-f6b7-4ce5-91ab-70ac3645ecbd',
        entityName: 'Apple',
        matchType: 'learned',
        confidence: 0.95,
      },
    });
    const { confirmed, dropped } = partitionConfirmable([placeholder]);

    expect(confirmed).toHaveLength(0);
    expect(dropped).toEqual([placeholder]);
    expect(buildConfirmedTransactions([placeholder])).toHaveLength(0);
  });

  it('keeps entity-optional and entity-resolved rows confirmed, dropped empty', () => {
    const withEntity = matched({ checksum: 'a' });
    const transfer = matched({
      checksum: 'b',
      transactionType: 'transfer',
      entity: { matchType: 'none' },
    });
    const reversal = matched({
      checksum: 'c',
      transactionType: 'reversal',
      entity: { matchType: 'none' },
    });
    const { confirmed, dropped } = partitionConfirmable([withEntity, transfer, reversal]);

    expect(confirmed).toEqual([withEntity, transfer, reversal]);
    expect(dropped).toHaveLength(0);
  });

  it('partition is disjoint and exhaustive over the input, and confirmed matches the commit filter', () => {
    const rows = [
      matched({ checksum: 'a' }),
      matched({ checksum: 'b', transactionType: 'purchase', entity: { matchType: 'exact' } }),
      matched({ checksum: 'c', transactionType: 'loan', entity: { matchType: 'none' } }),
      matched({ checksum: 'd', transactionType: 'refund', entity: { matchType: 'none' } }),
    ];
    const { confirmed, dropped } = partitionConfirmable(rows);

    expect(confirmed.length + dropped.length).toBe(rows.length);
    expect(confirmed.every(isConfirmable)).toBe(true);
    expect(dropped.every((t) => !isConfirmable(t))).toBe(true);
    // confirmed carries exactly the rows buildConfirmedTransactions would commit.
    expect(confirmed).toHaveLength(buildConfirmedTransactions(rows).length);
  });
});

/**
 * Every field of a parsed row, as a compile-time exhaustive key list. Adding a
 * field to `ParsedTransaction` without adding it here fails to typecheck, which
 * is what keeps the passthrough test below from going stale the way the
 * hand-written copy in `buildConfirmedTransactions` did (POPS-2604).
 */
const PARSED_KEYS = {
  date: true,
  description: true,
  amount: true,
  account: true,
  accountId: true,
  location: true,
  country: true,
  foreignAmountMinor: true,
  foreignCurrency: true,
  fxFeeCents: true,
  fxCaptureSource: true,
  balanceCents: true,
  balanceMarker: true,
  pending: true,
  rawRow: true,
  checksum: true,
} satisfies Record<keyof ParsedTransaction, true>;

describe('buildConfirmedTransactions parsed-field passthrough', () => {
  it('carries every parsed field to the commit payload', () => {
    const row = matched({
      accountId: 'acc-real-account',
      location: 'Github.com',
      country: 'US',
      foreignAmountMinor: 10_000,
      foreignCurrency: 'USD',
      fxFeeCents: 503,
      fxCaptureSource: 'anz-descriptor',
      balanceCents: 64_080,
      balanceMarker: 'CR',
    });

    const [confirmed] = buildConfirmedTransactions([row]);

    for (const key of Object.keys(PARSED_KEYS) as Array<keyof ParsedTransaction>) {
      expect(confirmed?.[key], `parsed field ${key} was dropped`).toEqual(row[key]);
    }
  });

  it('carries the picked accountId, not just the dialect-derived account name (POPS-2852)', () => {
    // `account` is the bank/dialect label ("ANZ Credit Card"); `accountId` is
    // the real account the wizard's account-step picked. A row whose dialect
    // label would name-match a DIFFERENT real account than the one picked
    // must still commit with the picked account's id.
    const row = matched({ account: 'ANZ Credit Card', accountId: 'acc-anz-personal' });

    const [confirmed] = buildConfirmedTransactions([row]);

    expect(confirmed?.account).toBe('ANZ Credit Card');
    expect(confirmed?.accountId).toBe('acc-anz-personal');
  });

  it('leaves the foreign-charge columns unset on a domestic row rather than zeroing them', () => {
    const [confirmed] = buildConfirmedTransactions([matched()]);

    expect(confirmed?.country).toBeUndefined();
    expect(confirmed?.foreignAmountMinor).toBeUndefined();
    expect(confirmed?.foreignCurrency).toBeUndefined();
    expect(confirmed?.fxFeeCents).toBeUndefined();
  });

  it('carries the capture source of a domestic row, which is the whole point of it', () => {
    const [confirmed] = buildConfirmedTransactions([
      matched({ fxCaptureSource: 'anz-descriptor' }),
    ]);

    expect(confirmed?.foreignCurrency).toBeUndefined();
    expect(confirmed?.fxCaptureSource).toBe('anz-descriptor');
  });
});

describe('dropReason — an untyped credit is never committed as spend (POPS-2754)', () => {
  const credit = (overrides: Partial<ProcessedTransaction> = {}) =>
    matched({
      description: 'APPLE.COM/BILL',
      amount: 139.72,
      entity: { entityId: 'ent-apple', entityName: 'Apple', matchType: 'learned' },
      ...overrides,
    });

  it('drops a credit with a resolved merchant but no type', () => {
    expect(dropReason(credit())).toBe('type');
    expect(isConfirmable(credit())).toBe(false);
  });

  it('drops a $0 row with no type — it is not a debit either', () => {
    expect(dropReason(credit({ amount: 0 }))).toBe('type');
  });

  it('commits the same credit once it names its type', () => {
    expect(dropReason(credit({ transactionType: 'refund' }))).toBeNull();
    expect(
      dropReason(credit({ transactionType: 'transfer', entity: { matchType: 'none' } }))
    ).toBeNull();
  });

  it('still commits an untyped debit with a merchant, as before', () => {
    expect(dropReason(matched())).toBeNull();
  });

  it('reports the missing merchant, not the missing type, on an untyped debit', () => {
    expect(dropReason(matched({ entity: { matchType: 'none' } }))).toBe('entity');
  });

  it('keeps the untyped credit out of the commit payload and in the dropped list', () => {
    const { confirmed, dropped } = partitionConfirmable([credit(), matched()]);

    expect(confirmed.map((t) => t.description)).toEqual(['WOOLWORTHS 1234']);
    expect(dropped.map((t) => t.description)).toEqual(['APPLE.COM/BILL']);
    expect(buildConfirmedTransactions([credit()])).toEqual([]);
  });
});
