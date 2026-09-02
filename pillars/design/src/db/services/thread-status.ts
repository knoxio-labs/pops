/**
 * The thread lifecycle, as a value rather than a comment.
 *
 * `open` is where every thread starts. `applied` and `rejected` are the two
 * ways a session closes one, and both are meant to arrive with a reply saying
 * what happened. `outdated` is the third: the anchor no longer resolves, so
 * nobody can act on the thread and nobody rejected it either.
 */
export const THREAD_STATUSES = ['open', 'applied', 'rejected', 'outdated'] as const;

export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export function isThreadStatus(value: unknown): value is ThreadStatus {
  return typeof value === 'string' && (THREAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether a status stamps `resolved_at`. Only `open` clears it — reopening a
 * thread has to leave no trace of the resolution it undid, or a later "when
 * was this closed" reads the wrong timestamp.
 */
export function isResolvedStatus(status: ThreadStatus): boolean {
  return status !== 'open';
}
