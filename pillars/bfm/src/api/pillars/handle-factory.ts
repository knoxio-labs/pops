/**
 * The handle every gateway call gets unless a test substitutes its own.
 *
 * Kept apart from `gateway.ts` and from every client for the reason
 * `inventory/handle-factory.ts` states: `check-cross-pillar-expectations.mjs`
 * cannot pin a `pillar<TRouter>()` call whose router is a bare generic, and it
 * excuses a whole file at a time. Nothing here calls an operation.
 */
import { DELEGATED_SUBJECT_HEADER } from '@pops/pillar-express';
import { pillar } from '@pops/pillar-sdk/server';

import { currentDeviceSubject } from '../auth/device-subject.js';

import type { PillarHandle } from '@pops/pillar-sdk/server';

/** The one pillar that holds grants to check a guest's email against. */
const DELEGATING_PILLAR_ID = 'finance';

/**
 * A guest device's email, for finance and nobody else (POPS-5884).
 *
 * Read on every outbound call rather than once per handle, because the handle
 * is cached across requests and the device is not. An operator device sends
 * no header, which is what finance already answers as the service account.
 */
function delegatedSubjectHeaders(): Record<string, string> {
  const email = currentDeviceSubject();
  return email === null ? {} : { [DELEGATED_SUBJECT_HEADER]: email };
}

/**
 * The authenticated `/server` handle for `pillarId`, on behalf of the device
 * whose request is running.
 *
 * Only the finance handle can send the subject header. Every other pillar
 * gets a handle with no header callback at all, so a guest's email never
 * leaves for a pillar that has no grants to check it against.
 */
export function pillarForDevice<TRouter>(pillarId: string): PillarHandle<TRouter> {
  return pillarId === DELEGATING_PILLAR_ID
    ? pillar<TRouter>(pillarId, { extraHeaders: delegatedSubjectHeaders })
    : pillar<TRouter>(pillarId);
}
