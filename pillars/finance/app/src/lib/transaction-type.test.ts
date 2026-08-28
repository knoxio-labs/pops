import { describe, expect, it } from 'vitest';

/**
 * Lockstep between the frontend's hand-maintained taxonomy and the pillar's.
 *
 * The generated client inlines the type union per operation instead of exporting
 * it, so this file's `TRANSACTION_TYPES`/`TILE_BY_TYPE` are a second copy of the
 * pillar's `TRANSACTION_TYPES`/`TRANSACTION_TYPE_STAT_TILE`. A copy nobody
 * checks is a copy that drifts: a type added server-side but not here renders as
 * a raw lowercase string and silently falls out of both headline tiles. This
 * suite is the check.
 */
import { TRANSACTION_TYPE_STAT_TILE, TRANSACTION_TYPES as PILLAR_TYPES } from '@pops/finance';

import {
  labelForType,
  requiresEntity,
  tileForType,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
} from './transaction-type';

describe('taxonomy lockstep with the pillar', () => {
  it('lists the same types as the pillar, in the same order', () => {
    expect([...TRANSACTION_TYPES]).toEqual([...PILLAR_TYPES]);
  });

  it('maps every type to the same headline tile the pillar does', () => {
    for (const type of PILLAR_TYPES) {
      expect(tileForType(type), `tile disagrees for: ${type}`).toBe(
        TRANSACTION_TYPE_STAT_TILE[type]
      );
    }
  });

  it('gives every type a display label', () => {
    for (const type of PILLAR_TYPES) {
      expect(TRANSACTION_TYPE_LABELS[type]).toBeTruthy();
      expect(labelForType(type)).toBe(TRANSACTION_TYPE_LABELS[type]);
    }
  });
});

describe('fee (POPS-2610)', () => {
  it('feeds the expense tile — a fee is money that left', () => {
    expect(tileForType('fee')).toBe('expense');
    expect(tileForType('FEE')).toBe('expense');
  });

  it('commits without a merchant, because the issuer is not one', () => {
    expect(requiresEntity('fee')).toBe(false);
  });

  it('still excludes a transfer from both tiles, and an unknown value from either', () => {
    expect(tileForType('transfer')).toBe('excluded');
    expect(tileForType('something-else')).toBe('excluded');
  });
});
