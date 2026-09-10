/**
 * Fictional pending imports: every import that has been started and not
 * committed, whether a person started it or the bank did. Today the wizard's
 * draft lives only in the browser's IndexedDB; the design here assumes a
 * draft the server holds too, so a tab closed on one machine is a card on
 * the next one, and rows that arrive while nobody is looking have somewhere
 * to wait.
 *
 * Four shapes are staged on purpose. A file draft saved mid-review. A live
 * Up import that has been filling itself from the webhook and that nobody has
 * opened. A live one that IS open right now, with a second one behind it
 * collecting what arrived after it was opened: an open import never
 * changes under the person working in it. And a draft a deploy left behind,
 * saved under a shape this build no longer reads.
 *
 * `TODAY` is the same pin `import-sources` uses, so "3 days ago" reads the
 * same on every render.
 */
import { TODAY } from './import-sources';

export type PendingImportSource =
  | { kind: 'file'; format: string; files: string[] }
  | { kind: 'live'; provider: string };

export type PendingImportState =
  /** A draft the wizard saved. Resumes at `step`. */
  | 'saved'
  /** Rows arriving on their own; nobody has stepped through them yet. */
  | 'live'
  /** Open in a wizard right now: this tab or another one. */
  | 'open'
  /** Saved by a build this one cannot read. The only way out is discard. */
  | 'unusable';

export interface PendingImport {
  id: string;
  accountId: string;
  source: PendingImportSource;
  state: PendingImportState;
  /** The wizard step it stopped at; absent when never opened. */
  step?: string;
  rowCount: number;
  /** Rows the review step still wants a decision on; on a live import, what the matcher could not settle on its own. */
  unresolvedCount?: number;
  /** Live only: the balance the provider reported with the newest row, minor units. */
  balanceReported?: number;
  /** Rows that arrived after it was last saved (live sources only). */
  arrivedSinceSave?: number;
  /** When the draft was last written, ISO date-time. */
  savedAt: string;
  /** `open` only: when the tab holding it last checked in. A crashed tab never closes. */
  lastSeenAt?: string;
  /** Inclusive span of the rows it holds. */
  span?: { from: string; to: string };
  /** `unusable` only: what the person is told before discarding. */
  unusableReason?: string;
}

export const pendingImports: PendingImport[] = [
  {
    id: 'p-amex-aug',
    accountId: 'a2',
    source: { kind: 'file', format: 'Amex activity CSV', files: ['activity_2026-08.csv'] },
    state: 'saved',
    step: 'Review',
    rowCount: 46,
    unresolvedCount: 3,
    savedAt: '2026-09-04T21:12:00+10:00',
    span: { from: '2026-08-01', to: '2026-08-31' },
  },
  {
    id: 'p-up-live',
    accountId: 'a13',
    source: { kind: 'live', provider: 'Up' },
    state: 'live',
    rowCount: 11,
    unresolvedCount: 2,
    balanceReported: 61_215,
    savedAt: `${TODAY}T08:41:00+10:00`,
    span: { from: '2026-09-02', to: TODAY },
  },
  {
    id: 'p-up-open',
    accountId: 'a13',
    source: { kind: 'live', provider: 'Up' },
    state: 'open',
    step: 'Review',
    rowCount: 7,
    unresolvedCount: 1,
    savedAt: `${TODAY}T09:05:00+10:00`,
    lastSeenAt: `${TODAY}T09:05:00+10:00`,
    span: { from: '2026-08-29', to: '2026-09-01' },
  },
  {
    id: 'p-up-next',
    accountId: 'a13',
    source: { kind: 'live', provider: 'Up' },
    state: 'live',
    rowCount: 4,
    arrivedSinceSave: 4,
    balanceReported: 58_790,
    savedAt: `${TODAY}T09:40:00+10:00`,
    span: { from: TODAY, to: TODAY },
  },
  {
    id: 'p-anzcc-open-stale',
    accountId: 'a3',
    source: { kind: 'file', format: 'ANZ credit card statement', files: ['statement-2026-08.pdf'] },
    state: 'open',
    step: 'Tags',
    rowCount: 27,
    unresolvedCount: 0,
    savedAt: '2026-09-04T22:10:00+10:00',
    lastSeenAt: '2026-09-04T22:10:00+10:00',
    span: { from: '2026-07-13', to: '2026-08-12' },
  },
  {
    id: 'p-anz-old',
    accountId: 'a1',
    source: { kind: 'file', format: 'ANZ transaction CSV', files: ['Transactions.csv'] },
    state: 'unusable',
    step: 'Tags',
    rowCount: 412,
    savedAt: '2026-08-30T19:22:00+10:00',
    span: { from: '2026-04-02', to: '2026-08-31' },
    unusableReason:
      'Saved before the 2 Sep deploy. Its rows are in a shape this version no longer reads, and the file is not stored: upload it again to redo the import.',
  },
  {
    id: 'p-ing-archived',
    accountId: 'a10',
    source: { kind: 'file', format: 'ING transaction CSV', files: ['Orange-2026-07.csv'] },
    state: 'unusable',
    step: 'Review',
    rowCount: 58,
    savedAt: '2026-08-18T20:05:00+10:00',
    span: { from: '2026-07-01', to: '2026-07-31' },
    unusableReason:
      'Old ING Orange was archived on 20 Aug, so nothing can be filed against it. Restore the account to resume this, or discard it.',
  },
];

const byId = new Map(pendingImports.map((p) => [p.id, p]));

export function pendingImportById(id: string): PendingImport {
  const found = byId.get(id);
  if (!found) throw new Error(`no fixture pending import ${id}`);
  return found;
}

function pick(...ids: string[]): PendingImport[] {
  return ids.map(pendingImportById);
}

/** The sets the entry points are shown against, one per reviewable state. */
export const pendingSets = {
  none: [] as PendingImport[],
  /** One file draft, the case the shipping resume dialog already covers. */
  one: pick('p-amex-aug'),
  /** A file draft beside a live import nobody has opened. */
  mixed: pick('p-up-live', 'p-amex-aug'),
  /** The mixed set plus a draft a deploy orphaned. */
  withUnusable: pick('p-up-live', 'p-amex-aug', 'p-anz-old'),
  /** An open live import and the one collecting behind it. */
  openElsewhere: pick('p-up-next', 'p-up-open', 'p-amex-aug'),
  /** An import a tab left open days ago and never closed. */
  openStale: pick('p-anzcc-open-stale', 'p-amex-aug'),
  /** Every way a draft becomes unusable: a shape this build cannot read, an account that is gone. */
  unusableCauses: pick('p-anz-old', 'p-ing-archived', 'p-amex-aug'),
};

/** The live import collecting for an account, when one is. */
export function liveImportFor(accountId: string): PendingImport | undefined {
  return pendingImports.find((p) => p.accountId === accountId && p.state === 'live');
}

export function sourceLabel(source: PendingImportSource): string {
  if (source.kind === 'live') return `${source.provider} live feed`;
  const [first, ...rest] = source.files;
  if (!first) return source.format;
  return rest.length === 0 ? first : `${first} and ${rest.length} more`;
}
