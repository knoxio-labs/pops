import type { StatusBadgeTone } from '@pops/ui';

/**
 * Fictional bank rows for the import-review screens. Shaped like what the
 * review step shows, not like the finance contract: a design fixture owes
 * nothing to the wire format, and it must not import one.
 */
export type ImportRowStatus = 'matched' | 'new' | 'ambiguous';

export interface ImportRow {
  id: string;
  /** ISO date, no time. */
  date: string;
  description: string;
  amountCents: number;
  type: 'debit' | 'credit';
  /** The entity the ladder matched, when it matched one. */
  entity?: string;
  tags: string[];
  status: ImportRowStatus;
}

export const STATUS_TONE: Record<ImportRowStatus, StatusBadgeTone> = {
  matched: 'success',
  new: 'info',
  ambiguous: 'warning',
};

export const importRows: ImportRow[] = [
  {
    id: 'r1',
    date: '2026-08-28',
    description: 'WOOLWORTHS 1234 NEWTOWN',
    amountCents: 8_432,
    type: 'debit',
    entity: 'Woolworths',
    tags: ['groceries'],
    status: 'matched',
  },
  {
    id: 'r2',
    date: '2026-08-28',
    description: 'TRANSPORTFORNSW TAP',
    amountCents: 1_260,
    type: 'debit',
    entity: 'Opal',
    tags: ['transport'],
    status: 'matched',
  },
  {
    id: 'r3',
    date: '2026-08-27',
    description: 'SQ *THE GROUNDS OF ALEX',
    amountCents: 2_150,
    type: 'debit',
    tags: [],
    status: 'new',
  },
  {
    id: 'r4',
    date: '2026-08-27',
    description: 'SALARY ACME PTY LTD',
    amountCents: 412_500,
    type: 'credit',
    entity: 'Acme',
    tags: ['salary'],
    status: 'matched',
  },
  {
    id: 'r5',
    date: '2026-08-26',
    description: 'AMAZON AU MARKETPLACE',
    amountCents: 6_799,
    type: 'debit',
    tags: ['household'],
    status: 'ambiguous',
  },
  {
    id: 'r6',
    date: '2026-08-25',
    description: 'AGL ENERGY DIRECT DEBIT',
    amountCents: 18_940,
    type: 'debit',
    entity: 'AGL',
    tags: ['utilities'],
    status: 'matched',
  },
  {
    id: 'r7',
    date: '2026-08-25',
    description: 'PAYPAL *STEAMGAMES',
    amountCents: 8_999,
    type: 'debit',
    tags: [],
    status: 'new',
  },
  {
    id: 'r8',
    date: '2026-08-24',
    description: 'REFUND BUNNINGS 5540',
    amountCents: 3_490,
    type: 'credit',
    entity: 'Bunnings',
    tags: ['household'],
    status: 'ambiguous',
  },
];
