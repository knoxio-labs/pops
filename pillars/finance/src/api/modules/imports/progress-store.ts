/**
 * In-memory progress tracking for import sessions.
 *
 * Process-local state polled by the FE via `getImportProgress`. Entries
 * expire after 5 minutes of inactivity to bound memory: every `setProgress`
 * or `updateProgress` call re-arms the expiry (a sliding/idle TTL), so a
 * slow-but-active import (e.g. AI retries) never gets deleted mid-flight —
 * only a session nobody has touched in 5 minutes is reaped. The single
 * pillar process makes the process-local store correct (no cross-instance
 * sharing needed).
 */
import type { ProcessImportOutput } from './types.js';

export interface ImportProgress {
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  currentStep: 'deduplicating' | 'matching';
  totalTransactions: number;
  processedCount: number;
  currentBatch: Array<{
    description: string;
    status: 'processing' | 'success' | 'failed';
    error?: string;
  }>;
  errors: Array<{ description: string; error: string }>;
  startedAt: string;
  result?: ProcessImportOutput;
}

const progressStore = new Map<string, ImportProgress>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

const CLEANUP_DELAY_MS = 5 * 60 * 1000;

function armExpiry(sessionId: string): void {
  const existing = expiryTimers.get(sessionId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    progressStore.delete(sessionId);
    expiryTimers.delete(sessionId);
  }, CLEANUP_DELAY_MS);
  timer.unref?.();
  expiryTimers.set(sessionId, timer);
}

/** Store progress for a session; expires after 5 minutes of inactivity. */
export function setProgress(sessionId: string, progress: ImportProgress): void {
  progressStore.set(sessionId, progress);
  armExpiry(sessionId);
}

/** Get progress for a session. Returns null if unknown or expired. */
export function getProgress(sessionId: string): ImportProgress | null {
  return progressStore.get(sessionId) ?? null;
}

/**
 * Merge partial updates into an existing session and re-arm its expiry.
 * No-op if the session is gone.
 */
export function updateProgress(sessionId: string, updates: Partial<ImportProgress>): void {
  const current = progressStore.get(sessionId);
  if (!current) return;
  progressStore.set(sessionId, { ...current, ...updates });
  armExpiry(sessionId);
}

/** Clear all progress entries (used by tests). */
export function clearProgress(): void {
  for (const timer of expiryTimers.values()) clearTimeout(timer);
  expiryTimers.clear();
  progressStore.clear();
}
