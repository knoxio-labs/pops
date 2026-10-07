/**
 * A guest identity a service account vouches for (POPS-5881).
 *
 * bfm's hostname bypasses Cloudflare Access, so a guest's phone never presents
 * an Access token a producer could classify. bfm knows whose device it is and
 * says so in a header beside its own key. A producer that opted in then treats
 * the request as that guest's, so the same grants and the same default deny
 * apply as for the guest's browser session.
 *
 * Delegation only ever narrows what the key could already do, which is why it
 * does not wait for `POPS_OPERATOR_EMAILS`: a caller that names a guest must
 * never be answered as the service it is.
 */
import { normalizeEmail } from '@pops/pillar-sdk/access';
import { hasScopeFor, type ServiceAccountPrincipal } from '@pops/pillar-sdk/server';

import type { AuthFailure } from './scope-gate-rejection.js';

/** Carries the email of the guest a service account is calling on behalf of. */
export const DELEGATED_SUBJECT_HEADER = 'x-pops-subject-email';

/** RFC 5321's ceiling for a whole address. */
const MAX_EMAIL_LENGTH = 254;

/**
 * One address and nothing else. A comma is refused because Express joins a
 * repeated header with one, and two subjects must not resolve to either.
 */
const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+$/u;

export type DelegatedSubject =
  | { readonly outcome: 'guest'; readonly email: string }
  | { readonly outcome: 'refused'; readonly failure: AuthFailure };

interface DelegationInput {
  readonly logPrefix: string;
  /** The scope a service account must hold to name a subject. */
  readonly delegationScope: string;
  /** The raw header value, already known to be present. */
  readonly header: string;
  /** The verified account behind the request's key, when there was one. */
  readonly service: ServiceAccountPrincipal | undefined;
}

/**
 * Decide what a presented subject header means.
 *
 * The scope is checked before the value, so a caller that may not delegate
 * learns nothing about what a well-formed subject looks like.
 */
export function resolveDelegatedSubject(input: DelegationInput): DelegatedSubject {
  const { logPrefix, delegationScope, header, service } = input;
  if (service === undefined || !hasScopeFor(service.scopes, delegationScope)) {
    console.warn(
      `[${logPrefix}] refused a delegated subject from ` +
        `${service === undefined ? 'a caller with no verified key' : `service account '${service.name}'`}` +
        `, which needs '${delegationScope}'`
    );
    return {
      outcome: 'refused',
      failure: { status: 403, details: { requiredScope: delegationScope } },
    };
  }
  const email = normalizeEmail(header);
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    console.warn(
      `[${logPrefix}] service account '${service.name}' sent a malformed delegated subject`
    );
    return {
      outcome: 'refused',
      failure: { status: 400, details: { header: DELEGATED_SUBJECT_HEADER } },
    };
  }
  return { outcome: 'guest', email };
}
