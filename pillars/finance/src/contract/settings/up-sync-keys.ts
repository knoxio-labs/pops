/**
 * The two settings the scheduled Up sync reads (POPS-2921). Declared apart
 * from the manifest so the scheduler can fall back to the same numbers the
 * manifest advertises without importing the whole manifest tree.
 */
export const UP_SYNC_ENABLED_KEY = 'finance.upSync.enabled';
export const UP_SYNC_INTERVAL_KEY = 'finance.upSync.intervalMinutes';

/** Off until an operator turns it on: a sync needs a token nobody has set yet. */
export const UP_SYNC_DEFAULT_ENABLED = false;
/** Six hours: Up settles overnight, and a held row that settles is picked up on the next pass. */
export const UP_SYNC_DEFAULT_INTERVAL_MINUTES = 360;
export const UP_SYNC_MIN_INTERVAL_MINUTES = 5;
export const UP_SYNC_MAX_INTERVAL_MINUTES = 24 * 60;
