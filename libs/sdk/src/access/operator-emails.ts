/**
 * The operator list: which Cloudflare Access emails are the owner rather than
 * a guest.
 *
 * Access vouches that an email signed in; it says nothing about what that
 * person may do. `POPS_OPERATOR_EMAILS` is the one place that distinction is
 * drawn, and every pillar reads it through here so two services cannot
 * disagree about who the operator is.
 */

/** Comma-separated operator emails. Unset or empty means no list is configured. */
export const OPERATOR_EMAILS_ENV = 'POPS_OPERATOR_EMAILS';

/**
 * The form an email is compared in: trimmed and lower-cased, nothing else.
 * No plus-tag or dot folding, because those are provider-specific and a
 * normaliser that guesses them wrong admits a stranger.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The configured operator emails, normalised. An empty set means the variable
 * is unset or carries no usable entry; what that means is the caller's
 * decision.
 */
export function readOperatorEmails(env: NodeJS.ProcessEnv = process.env): ReadonlySet<string> {
  const raw = env[OPERATOR_EMAILS_ENV] ?? '';
  const emails = new Set<string>();
  for (const entry of raw.split(',')) {
    const email = normalizeEmail(entry);
    if (email !== '') emails.add(email);
  }
  return emails;
}
