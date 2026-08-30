/**
 * The two failure shapes a contacts call can hand back, and the line between
 * them.
 *
 * They live apart from `client.ts` because more than the client branches on
 * them: the import commit degrades on one and aborts on the other, and the
 * outbox reconciler reads `detail` to tell a missing credential from an
 * outage.
 */
/**
 * Thrown when a contact pre-create fails for a reason expected to clear on
 * retry — contacts unreachable, mid-recovery (`degraded`), or rate-limited
 * (`rate-limited`, 429). The ONE failure mode `commitImport` degrades to an
 * outbox row instead of aborting; retrying the same `{ name, type }` later is
 * expected to eventually succeed.
 */
export class ContactsUnavailableError extends Error {
  override readonly name = 'ContactsUnavailableError';
  /** The bare reason, so a caller can branch on it without parsing prose —
   * the outbox reconciler must tell `no-credential` (nothing was sent; only a
   * redeploy fixes it) from a real outage before spending an attempt on it. */
  readonly detail: string;
  constructor(detail: string, operation = 'entity pre-create') {
    super(`contacts pillar unavailable during ${operation}: ${detail}`);
    this.detail = detail;
  }
}

/**
 * Thrown when a contact pre-create fails for a reason retrying will NEVER
 * fix — a malformed request, an auth failure, or an SDK/contacts contract
 * mismatch. Retrying `createOrFetchByName` with the same `{ name, type }`
 * would fail identically forever, so this must abort the commit loudly
 * rather than degrade to the outbox the way {@link ContactsUnavailableError}
 * does.
 */
export class ContactsPermanentError extends Error {
  override readonly name = 'ContactsPermanentError';
  constructor(detail: string, operation = 'entity pre-create') {
    super(`contacts pillar rejected ${operation}: ${detail}`);
  }
}
