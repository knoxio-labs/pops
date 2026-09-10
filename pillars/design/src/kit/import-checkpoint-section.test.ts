import { agreementTail, type LiveCheckpoint } from '@/kit/import-checkpoint-section';
import { describe, expect, it } from 'vitest';

const reported: LiveCheckpoint = { balanceMinor: 61_215, currency: 'AUD', asOf: '2026-09-06' };

describe('agreementTail', () => {
  it('ends the sentence when the ledger has not been compared yet', () => {
    expect(agreementTail(reported)).toBe('.');
  });

  it('says the ledger agrees on an exact match', () => {
    expect(agreementTail({ ...reported, ledgerMinor: 61_215 })).toBe(' · the ledger agrees.');
  });

  it('reports the size of a disagreement without its sign, in the account currency', () => {
    expect(agreementTail({ ...reported, ledgerMinor: 58_790 })).toBe(
      ' · the ledger is off by $24.25.'
    );
    expect(agreementTail({ ...reported, ledgerMinor: 63_640 })).toBe(
      ' · the ledger is off by $24.25.'
    );
  });
});
