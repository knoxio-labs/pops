import { useImportStore } from './importStore';

const IMPORT_CLEARED_CHANNEL = 'pops-finance-import';

/**
 * Deletes the persisted wizard copy. Only user-intent clears (commit success,
 * explicit Discard, "New Import") pass `broadcast: true`; the fresh-start
 * normalization clear must stay silent so a stale disk read in one tab can
 * never reset another tab's live in-flight work.
 */
export function clearPersistedImport(broadcast: boolean): void {
  useImportStore.persist.clearStorage();
  if (!broadcast || typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(IMPORT_CLEARED_CHANNEL);
  channel.postMessage('cleared');
  channel.close();
}

/**
 * Invokes `fn` when another tab broadcasts a persisted-import clear (a channel
 * never receives its own posts, so the acting tab is unaffected). Returns an
 * unsubscribe; a no-op subscription when BroadcastChannel is unavailable.
 */
export function subscribeImportCleared(fn: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(IMPORT_CLEARED_CHANNEL);
  channel.onmessage = () => fn();
  return () => channel.close();
}
