/**
 * The token a tab holds a draft's lease with (finance ADR-005). Minted once
 * per tab and kept in `sessionStorage`, so a reload re-claims as the same
 * owner and a new tab is a new owner. Falls back to memory where
 * `sessionStorage` is unavailable or refuses writes (a private window on
 * some browsers), which costs nothing more than a fresh token per reload.
 */
const KEY = 'pops-finance-import-owner';

let inMemory: string | null = null;

export function ownerToken(): string {
  if (inMemory !== null) return inMemory;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored !== null && stored.length >= 8) {
      inMemory = stored;
      return stored;
    }
    const minted = crypto.randomUUID();
    sessionStorage.setItem(KEY, minted);
    inMemory = minted;
    return minted;
  } catch {
    inMemory = crypto.randomUUID();
    return inMemory;
  }
}

/** Test seam: forget the cached token so the next call mints or re-reads. */
export function resetOwnerTokenForTests(): void {
  inMemory = null;
}
