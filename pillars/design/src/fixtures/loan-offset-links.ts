/** One offset account linked to a loan — mirrors the wire shape of `loan_offset_links`. */
export interface LoanOffsetLinkEntry {
  id: string;
  offsetAccountId: string;
  linkedFrom: string;
  unlinkedAt: string | null;
}

/**
 * `a11` (Home loan)'s offset links, oldest `linkedFrom` first — matching
 * `listOffsetLinks`'s ordering (POPS-2829). `lo1` is a closed arrangement
 * (an everyday account that was linked and later unlinked); `lo2` is the
 * active one. `a12` (Car loan) carries none, showing the empty state.
 */
export const loanOffsetLinksByAccountId: Record<string, LoanOffsetLinkEntry[]> = {
  a11: [
    { id: 'lo1', offsetAccountId: 'a10', linkedFrom: '2024-03-01', unlinkedAt: '2025-01-15' },
    { id: 'lo2', offsetAccountId: 'a1', linkedFrom: '2025-01-20', unlinkedAt: null },
  ],
};
