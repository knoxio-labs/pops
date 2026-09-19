import { hasScopeFor, type ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { SyncRequestError } from './errors.js';

import type { CommandActor } from '../../domain/commands/index.js';

/**
 * The grant a caller must hold for its `Pops-Actor` to be believed. Only bfm's
 * account carries it: bfm has authenticated the device before relaying.
 */
export const ACTOR_SCOPE = 'inventory.sync';

const ACTOR_PATTERN = /^device:([^\s;]{1,128});label=(.+)$/;
const MAX_LABEL_LENGTH = 100;

function invalidActor(detail: string): SyncRequestError {
  return new SyncRequestError(400, 'invalid_actor', `Pops-Actor ${detail}`);
}

/**
 * Parse `device:<deviceId>;label=<percent-encoded label>`, the device bfm
 * authenticated and the name its owner gave it.
 */
export function parseActorHeader(header: string): Extract<CommandActor, { kind: 'device' }> {
  const match = ACTOR_PATTERN.exec(header.trim());
  const id = match?.[1];
  const encoded = match?.[2];
  if (id === undefined || encoded === undefined) {
    throw invalidActor('must read device:<deviceId>;label=<label>');
  }
  let label: string;
  try {
    label = decodeURIComponent(encoded).trim();
  } catch {
    throw invalidActor('label is not valid percent-encoding');
  }
  if (label === '' || label.length > MAX_LABEL_LENGTH) {
    throw invalidActor(`label must be 1 to ${MAX_LABEL_LENGTH} characters`);
  }
  return { kind: 'device', id, label };
}

/** What a request says about who is making it. */
export interface ActorRequest {
  /** The presented `X-API-Key`, if any; the scope gate has already admitted it. */
  readonly apiKey: string | undefined;
  /** The raw `Pops-Actor` header, if any. */
  readonly actorHeader: string | undefined;
  readonly verify: ServiceAccountVerifier;
}

/**
 * Decide who a mutation batch is recorded against (Inventory ADR-002 D12).
 *
 * No key: `web`, whatever `Pops-Actor` says, since anyone on the network can
 * send a header. A key whose account holds {@link ACTOR_SCOPE}: the device in
 * `Pops-Actor` when present, else the account as a service. Any other key:
 * the account as a service, `Pops-Actor` ignored. The key is re-verified here
 * (a cache hit after the gate's check) because the gate does not hand its
 * principal on; a key that no longer verifies is refused rather than demoted.
 */
export async function resolveActor(request: ActorRequest): Promise<CommandActor> {
  if (request.apiKey === undefined || request.apiKey === '') return { kind: 'web' };
  const verification = await request.verify(request.apiKey);
  if (verification.outcome === 'unavailable') {
    throw new SyncRequestError(
      503,
      'unavailable',
      'service-account credentials could not be verified'
    );
  }
  if (verification.outcome === 'rejected') {
    throw new SyncRequestError(
      401,
      'invalid_credential',
      'service-account credentials were rejected'
    );
  }
  const { principal } = verification;
  const header = request.actorHeader?.trim();
  if (header && hasScopeFor(principal.scopes, ACTOR_SCOPE)) return parseActorHeader(header);
  return { kind: 'service', id: principal.name };
}
