import { describe, expect, it } from 'vitest';

import {
  amountColour,
  detailFields,
  isCredit,
  rowCaption,
  rowSubtitle,
} from './ios-transaction-presentation';

import type { Transaction, TransactionDetail } from '@/fixtures/transactions';

const row: Transaction = {
  id: 't1',
  description: 'Sample Coffee',
  amountMinorUnits: -540,
  currency: 'AUD',
  date: '2026-09-03',
  type: 'purchase',
  entityName: 'Sample Coffee',
  tags: ['coffee'],
};

describe('credit', () => {
  it('is only a positive amount — zero is not money arriving', () => {
    expect(isCredit({ amountMinorUnits: 1 })).toBe(true);
    expect(isCredit({ amountMinorUnits: 0 })).toBe(false);
    expect(isCredit({ amountMinorUnits: -1 })).toBe(false);
  });

  it('tints only the credit, so spending is never drawn as a failure', () => {
    expect(amountColour({ amountMinorUnits: 420_000 })).toBe('var(--ios-success)');
    expect(amountColour({ amountMinorUnits: -540 })).toBe('var(--ios-foreground)');
    expect(amountColour({ amountMinorUnits: 0 })).toBe('var(--ios-foreground)');
  });
});

describe('row lines', () => {
  it('drops the entity rather than leaving a separator behind', () => {
    expect(rowSubtitle({ ...row, entityName: undefined })).toBe('3 Sept 2026');
    expect(rowSubtitle(row)).toBe('Sample Coffee · 3 Sept 2026');
  });

  it('keeps the type when there are no tags', () => {
    expect(rowCaption({ ...row, tags: [] })).toBe('purchase');
    expect(rowCaption({ ...row, tags: ['housing', 'recurring'] })).toBe(
      'purchase · housing · recurring'
    );
  });

  it('shows a type the app does not know verbatim', () => {
    expect(rowCaption({ ...row, type: 'settlement', tags: [] })).toBe('settlement');
  });
});

describe('detail fields', () => {
  it('omits every absent or blank value instead of drawing a placeholder', () => {
    const fields = detailFields({ ...row, entityName: undefined, tags: [] });
    expect(fields.map((f) => f.label)).toEqual(['Type']);
  });

  it('keeps the seeded three first when the fuller record lands', () => {
    const detail: TransactionDetail = {
      ...row,
      account: 'Everyday',
      location: '   ',
      country: 'Australia',
      notes: undefined,
      lastEditedAt: '2026-09-03T09:14:00',
    };
    expect(detailFields(row, detail).map((f) => f.label)).toEqual([
      'Type',
      'Entity',
      'Tags',
      'Account',
      'Country',
      'Last edited',
    ]);
  });

  it('is the only field carrying a clock time', () => {
    const detail: TransactionDetail = {
      ...row,
      account: 'Everyday',
      lastEditedAt: '2026-09-03T09:14:00',
    };
    const edited = detailFields(row, detail).find((f) => f.label === 'Last edited');
    expect(edited?.value).toMatch(/^3 Sept 2026 at /u);
  });
});
