/**
 * Fictional checkpoints for the account-checkpoints experiment (POPS-2750). A
 * checkpoint is a known-good balance at a point in time; the account's balance
 * is otherwise always the sum of its transactions. `expectedBalance` is set
 * only when the checkpoint disagreed with what the ledger predicted for that
 * date — the gap this epic exists to catch — and is absent everywhere else,
 * which is the common case.
 */
export type CheckpointSource = 'manual' | 'import' | 'statement';

export interface Checkpoint {
  id: string;
  accountId: string;
  /** Minor units, signed the same way the account's own balance is. */
  balance: number;
  /** ISO date the balance was true as of. */
  asOf: string;
  source: CheckpointSource;
  note?: string;
  /** What the transaction ledger predicted for this date, when it disagreed. */
  expectedBalance?: number;
}

export const checkpointsByAccountId: Record<string, Checkpoint[]> = {
  a1: [
    { id: 'c1', accountId: 'a1', balance: 390_000, asOf: '2025-10-01', source: 'manual' },
    {
      id: 'c2',
      accountId: 'a1',
      balance: 406_800,
      asOf: '2026-04-01',
      source: 'import',
      note: 'ANZ statement closing balance',
    },
    { id: 'c3', accountId: 'a1', balance: 428_140, asOf: '2026-09-01', source: 'manual' },
  ],
  a2: [
    {
      id: 'c4',
      accountId: 'a2',
      balance: -180_000,
      asOf: '2025-10-12',
      source: 'statement',
      note: 'Amex October statement',
    },
    {
      id: 'c5',
      accountId: 'a2',
      balance: -213_755,
      asOf: '2026-09-02',
      source: 'statement',
      note: 'Amex September statement',
      expectedBalance: -208_920,
    },
  ],
  a4: [
    {
      id: 'c6',
      accountId: 'a4',
      balance: 2_980_000,
      asOf: '2026-06-30',
      source: 'import',
      note: 'ANZ statement closing balance',
      expectedBalance: 2_981_200,
    },
    { id: 'c7', accountId: 'a4', balance: 3_120_000, asOf: '2026-09-01', source: 'manual' },
  ],
  a5: [
    {
      id: 'c8',
      accountId: 'a5',
      balance: 8_500,
      asOf: '2026-08-20',
      source: 'manual',
      note: 'Counted the notes and coins',
    },
  ],
};

/** The account page's newest-first order; every history list reads this way. */
export function checkpointsFor(accountId: string): Checkpoint[] {
  return (checkpointsByAccountId[accountId] ?? []).toSorted((a, b) => b.asOf.localeCompare(a.asOf));
}

/**
 * The date the balance was last true as of: the newest checkpoint's, else
 * whatever the account record carries. On the wire this is one field; the
 * fixtures keep both so accounts without checkpoint data still show a date.
 */
export function balanceAsOf(account: { id: string; balanceAsOf?: string }): string | undefined {
  return checkpointsFor(account.id)[0]?.asOf ?? account.balanceAsOf;
}

/**
 * The most recent checkpoint, if it disagrees with the ledger. Only the
 * latest one counts: an older flagged checkpoint followed by a consistent
 * newer one has been re-anchored, and the account is not in question.
 */
export function inconsistentCheckpoint(accountId: string): Checkpoint | undefined {
  const [latest] = checkpointsFor(accountId);
  return latest?.expectedBalance !== undefined ? latest : undefined;
}
