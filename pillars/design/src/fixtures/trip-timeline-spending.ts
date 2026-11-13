import type { CraftSpendingState } from './trip-timeline-craft-types';

/** Fictional Finance transaction records with independent account units and explicit tag membership. */
const records = [
  {
    id: 'fictional-finance-001',
    merchant: 'Harbour Hotel',
    date: '12 Nov 2026',
    account: 'Travel debit',
    amount: '120.00',
    unit: 'AUD',
    type: 'Purchase',
  },
  {
    id: 'fictional-finance-002',
    merchant: 'Garden Rail',
    date: '11 Nov 2026',
    account: 'Yen wallet',
    amount: '12,000',
    unit: 'JPY',
    type: 'Purchase',
  },
  {
    id: 'fictional-finance-003',
    merchant: 'Coast Air',
    date: '10 Nov 2026',
    account: 'Air rewards',
    amount: '18,000',
    unit: 'points',
    type: 'Redemption',
  },
] as const;

const [hotel, rail, flight] = records;
if (!hotel || !rail || !flight) throw new Error('The spending recovery records are required.');

const tagLabel = 'Summer along the coast';

/** Named owner/read states for the Timeline's inline spending region. */
export const craftSpendingStates = {
  ready: { kind: 'ready', tagLabel, records },
  empty: { kind: 'ready', tagLabel, records: [] },
  missingTag: { kind: 'tag-missing' },
  loading: { kind: 'loading' },
  unavailable: { kind: 'unavailable' },
  partial: { kind: 'partial', tagLabel, records: [hotel, rail] },
  creating: { kind: 'creating', tagLabel },
  attachmentFailed: { kind: 'attachment-failed', tagLabel, transaction: hotel },
  uncertainCreate: { kind: 'uncertain-create', tagLabel },
  chooseExisting: { kind: 'choose-existing', tagLabel, records },
  linked: { kind: 'linked', tagLabel, transaction: hotel },
} satisfies Record<string, CraftSpendingState>;
