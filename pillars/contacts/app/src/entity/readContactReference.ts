import { entitiesGet, entitiesReference } from '../contacts-api/sdk.gen';
import { ContactError } from '../errors';
import { contactRequest } from '../request';

import type { Entity } from '../contacts-api/types.gen';
import type { ContactReference } from './api';

const contactUriPrefix = 'pops:contacts/contact/';

/** A verified owner read supplies its actual name/entity, canonical reference and mounted source route. */
export interface AvailableContactReference {
  status: 'available';
  name: string;
  entity: Entity;
  reference: ContactReference;
  href: string;
}

/** Missing requires resolver 404; later display-read failures preserve any proven identity instead. */
export type ContactReferenceRead =
  | AvailableContactReference
  | { status: 'missing'; diagnostic: string }
  | {
      status: 'unavailable' | 'readError';
      diagnostic: string;
      reference?: ContactReference;
    };

/** Resolve a retained owner URI through canonical proof and entity GET. Caller cancellation becomes unavailable; no automatic timeout or retry. */
export async function readContactReference(
  uri: string,
  options: { signal?: AbortSignal } = {}
): Promise<ContactReferenceRead> {
  if (!uri.startsWith(contactUriPrefix) || !addressableId(uri.slice(contactUriPrefix.length)))
    return { status: 'readError', diagnostic: 'contacts.reference.invalid' };
  let reference: ContactReference;
  try {
    const response: unknown = await contactRequest(() =>
      entitiesReference({
        path: { id: uri.slice(contactUriPrefix.length) },
        signal: options.signal,
      })
    );
    if (!isReference(response))
      return { status: 'readError', diagnostic: 'contacts.reference.invalid_response' };
    reference = response;
  } catch (failure) {
    if (failure instanceof ContactError && failure.messageKey === 'notFound')
      return { status: 'missing', diagnostic: failure.diagnostic };
    return failedRead(failure);
  }
  return readEntity(reference, options.signal);
}

async function readEntity(
  reference: ContactReference,
  signal?: AbortSignal
): Promise<ContactReferenceRead> {
  if (!addressableId(reference.canonicalId))
    return { status: 'readError', diagnostic: 'contacts.reference.unaddressable', reference };
  try {
    const response: unknown = await contactRequest(() =>
      entitiesGet({ path: { id: reference.canonicalId }, signal })
    );
    if (
      !isRecord(response) ||
      !isEntity(response.data) ||
      response.data.id !== reference.canonicalId
    )
      return { status: 'readError', diagnostic: 'contacts.reference.entity_mismatch', reference };
    return {
      status: 'available',
      name: response.data.name,
      entity: response.data,
      reference,
      href: `/contacts/${encodeURIComponent(reference.canonicalId)}`,
    };
  } catch (failure) {
    return { ...failedRead(failure), reference };
  }
}

function failedRead(failure: unknown): { status: 'unavailable' | 'readError'; diagnostic: string } {
  if (failure instanceof ContactError) {
    return {
      status: failure.messageKey === 'invalidResponse' ? 'readError' : 'unavailable',
      diagnostic: failure.diagnostic,
    };
  }
  return { status: 'unavailable', diagnostic: 'contacts.reference.unavailable' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReference(value: unknown): value is ContactReference {
  return (
    isRecord(value) &&
    typeof value.canonicalId === 'string' &&
    value.canonicalId.length > 0 &&
    value.uri === `${contactUriPrefix}${value.canonicalId}`
  );
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

function isEntity(value: unknown): value is Entity {
  if (!isRecord(value)) return false;
  const required = ['id', 'name', 'type', 'lastEditedTime'] satisfies (keyof Entity)[];
  const nullable = [
    'abn',
    'avatarAssetId',
    'colour',
    'defaultTransactionType',
    'notes',
    'posterAssetId',
  ] satisfies (keyof Entity)[];
  return (
    required.every((key) => typeof value[key] === 'string') &&
    strings(value.aliases) &&
    strings(value.defaultTags) &&
    nullable.every(
      (key) => value[key] === undefined || value[key] === null || typeof value[key] === 'string'
    )
  );
}

function addressableId(id: string): boolean {
  // URL path dot segments normalize before fetch, even after percent encoding.
  return id.length > 0 && id !== '.' && id !== '..';
}
