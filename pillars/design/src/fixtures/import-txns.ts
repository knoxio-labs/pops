import { raw, type ImportBucket, type ImportTxn } from './import-txn-types';

export * from './import-txn-types';

export const importTxns: ImportTxn[] = [
  {
    checksum: 'a1b2c3',
    date: '2026-08-28',
    description: 'WOOLWORTHS 1234 NEWTOWN',
    amount: -84.32,
    account: 'Amex',
    entity: { name: 'Woolworths', matchType: 'exact' },
    ruleProvenance: { pattern: 'WOOLWORTHS', matchType: 'contains', confidence: 0.98 },
    transactionType: 'purchase',
    bucket: 'matched',
    rawRow: raw({ Date: '28/08/2026', Description: 'WOOLWORTHS 1234 NEWTOWN', Amount: '-84.32' }),
  },
  {
    checksum: 'd4e5f6',
    date: '2026-08-28',
    description: 'TRANSPORTFORNSW TAP',
    amount: -12.6,
    account: 'Amex',
    entity: { name: 'Opal', matchType: 'learned' },
    ruleProvenance: { pattern: 'TRANSPORTFORNSW', matchType: 'prefix', confidence: 0.91 },
    transactionType: 'purchase',
    bucket: 'matched',
    rawRow: raw({ Date: '28/08/2026', Description: 'TRANSPORTFORNSW TAP', Amount: '-12.60' }),
  },
  {
    checksum: 'g7h8i9',
    date: '2026-08-27',
    description: 'SALARY ACME PTY LTD',
    amount: 4125,
    account: 'Amex',
    entity: { name: 'Acme', matchType: 'alias' },
    transactionType: 'income',
    bucket: 'matched',
    rawRow: raw({ Date: '27/08/2026', Description: 'SALARY ACME PTY LTD', Amount: '4125.00' }),
  },
  {
    checksum: 'j1k2l3',
    date: '2026-08-25',
    description: 'AGL ENERGY DIRECT DEBIT',
    amount: -189.4,
    account: 'Amex',
    entity: { name: 'AGL', matchType: 'exact' },
    ruleProvenance: { pattern: 'AGL ENERGY', matchType: 'exact', confidence: 0.99 },
    overriddenRules: [
      {
        ruleId: 'r-old-agl',
        pattern: 'AGL',
        matchType: 'contains',
        priority: 2,
        confidence: 0.6,
        entityName: 'AGL Energy Online',
      },
    ],
    transactionType: 'purchase',
    bucket: 'matched',
    rawRow: raw({ Date: '25/08/2026', Description: 'AGL ENERGY DIRECT DEBIT', Amount: '-189.40' }),
  },
  {
    checksum: 'm4n5o6',
    date: '2026-08-24',
    description: 'REFUND BUNNINGS 5540',
    amount: 34.9,
    account: 'Amex',
    entity: { name: 'Bunnings', matchType: 'exact' },
    manuallyEdited: true,
    transactionType: 'refund',
    bucket: 'matched',
    rawRow: raw({ Date: '24/08/2026', Description: 'REFUND BUNNINGS 5540', Amount: '34.90' }),
  },
  {
    checksum: 'p7q8r9',
    date: '2026-08-24',
    description: 'INTERNAL TRANSFER TO SAVINGS',
    amount: -500,
    account: 'Amex',
    bucket: 'matched',
    rawRow: raw({
      Date: '24/08/2026',
      Description: 'INTERNAL TRANSFER TO SAVINGS',
      Amount: '-500.00',
    }),
  },
  {
    checksum: 's1t2u3',
    date: '2026-08-27',
    description: 'SQ *THE GROUNDS OF ALEX',
    amount: -21.5,
    account: 'Amex',
    entity: { name: 'The Grounds of Alexandria', matchType: 'ai', confidence: 0.82 },
    transactionType: 'purchase',
    bucket: 'uncertain',
    reason: 'AI match below the confidence bar the ladder trusts on its own.',
    rawRow: raw({ Date: '27/08/2026', Description: 'SQ *THE GROUNDS OF ALEX', Amount: '-21.50' }),
  },
  {
    checksum: 'v4w5x6',
    date: '2026-08-26',
    description: 'AMAZON AU MARKETPLACE',
    amount: -67.99,
    account: 'Amex',
    entity: { name: 'Amazon', matchType: 'ai', confidence: 0.54 },
    bucket: 'uncertain',
    reason: 'Low-confidence AI guess — marketplace sellers vary too much to trust unreviewed.',
    rawRow: raw({ Date: '26/08/2026', Description: 'AMAZON AU MARKETPLACE', Amount: '-67.99' }),
  },
  {
    checksum: 'y7z8a9',
    date: '2026-08-23',
    description: 'SP * MYSTERY MERCHANT XY',
    amount: -45.0,
    account: 'Amex',
    bucket: 'uncertain',
    reason: 'No entity resolved at all — nothing in the ladder recognized this merchant.',
    rawRow: raw({ Date: '23/08/2026', Description: 'SP * MYSTERY MERCHANT XY', Amount: '-45.00' }),
  },
  {
    checksum: 'b1c2d3',
    date: '2026-08-22',
    description: '',
    amount: -15.2,
    account: 'Amex',
    bucket: 'failed',
    reason: 'Description column was blank after parsing — nothing to match against.',
    rawRow: raw({ Date: '22/08/2026', Description: '', Amount: '-15.20' }),
  },
  {
    checksum: 'e4f5g6',
    date: 'not-a-date',
    description: 'ILLEGIBLE STATEMENT ROW',
    amount: 0,
    account: 'Amex',
    bucket: 'failed',
    reason: 'Date column did not parse under the mapped format.',
    rawRow: raw({ Date: '32/13/2026', Description: 'ILLEGIBLE STATEMENT ROW', Amount: 'n/a' }),
  },
  {
    checksum: 'h7i8j9',
    date: '2026-08-21',
    description: 'WOOLWORTHS 1234 NEWTOWN',
    amount: -84.32,
    account: 'Amex',
    entity: { name: 'Woolworths', matchType: 'exact' },
    transactionType: 'purchase',
    bucket: 'skipped',
    reason: 'Already on this account — checksum matches a transaction committed 21 Aug 2026.',
    rawRow: raw({ Date: '21/08/2026', Description: 'WOOLWORTHS 1234 NEWTOWN', Amount: '-84.32' }),
  },
  {
    checksum: 'k1l2m3',
    date: '2026-08-20',
    description: 'REFUND UNKNOWN SENDER',
    amount: 22.0,
    account: 'Amex',
    bucket: 'matched',
    reason: 'A credit with no transaction type set — dropped at commit until typed.',
    rawRow: raw({ Date: '20/08/2026', Description: 'REFUND UNKNOWN SENDER', Amount: '22.00' }),
  },
];

export function byBucket(bucket: ImportBucket): ImportTxn[] {
  return importTxns.filter((t) => t.bucket === bucket);
}

/** Rows counted "dropped" at commit: an untyped credit, or a purchase/refund with no entity. */
export function droppedRows(rows: ImportTxn[]): ImportTxn[] {
  return rows.filter((t) => {
    if (t.bucket !== 'matched') return false;
    if (t.amount > 0) return t.transactionType === undefined;
    return (t.transactionType === 'purchase' || t.transactionType === 'refund') && !t.entity;
  });
}
