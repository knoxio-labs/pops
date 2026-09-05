/**
 * Fictional import plumbing for the per-account imports screen (POPS-2918):
 * how each account is fed, the batches that fed it, and the status the
 * account page and the grid read off those. Three shapes are staged on
 * purpose — a synced account (`a13`, Up), file-fed ones (`a1`/`a2` CSV,
 * `a3` PDF statements) and hand-fed ones (`a5` cash, and `a4`, which has a
 * bank but nothing has ever been imported into it).
 *
 * `TODAY` is pinned so "days quiet" reads the same on every render.
 */
export const TODAY = '2026-09-06';

export type ImportSourceKind = 'csv-dialect' | 'pdf-statement' | 'api';

/** Only an `api` source has a connection to be in a state. */
export type ConnectionState = 'connected' | 'token-missing' | 'not-connected';

export interface ImportConfig {
  accountId: string;
  kind: ImportSourceKind;
  /** The dialect, statement parser or provider, as a person would name it. */
  format: string;
  /** How often the account expects to be fed, when it was told. */
  expectedCadenceDays?: number;
  /** `api` only: the provider's own name for the account. */
  externalAccount?: string;
  /** `api` only: the NAME of the secret holding the token, never the token. */
  secretName?: string;
  connection?: ConnectionState;
}

export interface ImportBatch {
  id: string;
  accountId: string;
  kind: ImportSourceKind;
  format: string;
  /** When the batch landed, ISO date-time. */
  at: string;
  /** Inclusive span of the rows it wrote; absent when it wrote none. */
  from?: string;
  to?: string;
  rowCount: number;
  /** The checkpoint the source minted, when it carried a balance. */
  checkpointId?: string;
}

export const configByAccountId: Record<string, ImportConfig> = {
  a13: {
    accountId: 'a13',
    kind: 'api',
    format: 'Up',
    expectedCadenceDays: 1,
    externalAccount: 'Up Spending',
    secretName: 'UP_TOKEN',
    connection: 'connected',
  },
  a1: { accountId: 'a1', kind: 'csv-dialect', format: 'ANZ', expectedCadenceDays: 30 },
  a2: { accountId: 'a2', kind: 'csv-dialect', format: 'Amex', expectedCadenceDays: 30 },
  a3: {
    accountId: 'a3',
    kind: 'pdf-statement',
    format: 'ANZ credit card statement',
    expectedCadenceDays: 30,
  },
};

const up = (n: number, day: string, rowCount: number, checkpointId?: string): ImportBatch => ({
  id: `b-up-${n}`,
  accountId: 'a13',
  kind: 'api',
  format: 'Up',
  at: `${day}T06:00:00+10:00`,
  ...(rowCount > 0 ? { from: day, to: day } : {}),
  rowCount,
  checkpointId,
});

export const batchesByAccountId: Record<string, ImportBatch[]> = {
  a13: [
    up(6, '2026-09-06', 3, 'c-up-6'),
    up(5, '2026-09-05', 0),
    up(4, '2026-09-04', 5, 'c-up-4'),
    up(3, '2026-09-03', 1, 'c-up-3'),
    up(2, '2026-09-02', 4, 'c-up-2'),
    up(1, '2026-09-01', 2, 'c-up-1'),
  ],
  a1: [
    {
      id: 'b-anz-2',
      accountId: 'a1',
      kind: 'csv-dialect',
      format: 'ANZ',
      at: '2026-09-01T20:14:00+10:00',
      from: '2026-04-02',
      to: '2026-08-31',
      rowCount: 412,
    },
    {
      id: 'b-anz-1',
      accountId: 'a1',
      kind: 'csv-dialect',
      format: 'ANZ',
      at: '2026-04-01T09:02:00+10:00',
      from: '2025-10-01',
      to: '2026-04-01',
      rowCount: 388,
      checkpointId: 'c2',
    },
  ],
  a2: [
    {
      id: 'b-amex-3',
      accountId: 'a2',
      kind: 'csv-dialect',
      format: 'Amex',
      at: '2026-08-02T18:40:00+10:00',
      from: '2026-07-01',
      to: '2026-07-31',
      rowCount: 46,
    },
    {
      id: 'b-amex-2',
      accountId: 'a2',
      kind: 'csv-dialect',
      format: 'Amex',
      at: '2026-07-03T18:12:00+10:00',
      from: '2026-06-01',
      to: '2026-06-30',
      rowCount: 51,
    },
    {
      id: 'b-amex-1',
      accountId: 'a2',
      kind: 'csv-dialect',
      format: 'Amex',
      at: '2026-06-01T19:05:00+10:00',
      from: '2026-05-01',
      to: '2026-05-31',
      rowCount: 39,
    },
  ],
  a3: [
    {
      id: 'b-anzcc-2',
      accountId: 'a3',
      kind: 'pdf-statement',
      format: 'ANZ credit card statement',
      at: '2026-07-15T21:30:00+10:00',
      from: '2026-06-13',
      to: '2026-07-12',
      rowCount: 27,
      checkpointId: 'c-anzcc-2',
    },
    {
      id: 'b-anzcc-1',
      accountId: 'a3',
      kind: 'pdf-statement',
      format: 'ANZ credit card statement',
      at: '2026-06-14T21:02:00+10:00',
      from: '2026-05-13',
      to: '2026-06-12',
      rowCount: 31,
      checkpointId: 'c-anzcc-1',
    },
  ],
};

export function batchesFor(accountId: string): ImportBatch[] {
  return batchesByAccountId[accountId] ?? [];
}
