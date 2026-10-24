import { CONTACT_ENTITIES } from '../fixtures/entities';
import {
  contactPoint,
  importBatch,
  importReview,
  importReceipt,
  importReviewReceipt,
  importReadyReceipt,
  personProfile,
  sourceAccount,
} from './contacts-fixtures';
import { providerOperation, providerStatus, providerAccounts } from './contacts-provider-fixtures';
import { created, noContent, notFound, ok, page } from './respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AddressMutation,
  EntitiesLookupResponses,
  EntityResponse,
  HealthResponse,
  IdentityGroup,
  MergeResult,
  ResolveResponse,
  SeparateList,
  SeparateResult,
  UndoResult,
} from '../../contacts-api/types.gen';

/**
 * The vendored contacts contract (`contracts/contacts.openapi.json`), served
 * under `/contacts-api`, for the "contacts is up" mode.
 *
 * `contactsUnavailableHandlers` is the same key set answering every operation
 * the way the platform answers for a pillar that is registered but not
 * serving, which is what `VITE_CONTACTS_API=absent` installs instead.
 */

const [firstEntity] = CONTACT_ENTITIES;

const listEntities: MockHandler = (request) => {
  const type = request.query.get('type');
  const rows = type === null ? CONTACT_ENTITIES : CONTACT_ENTITIES.filter((e) => e.type === type);
  return { body: page(rows, request) };
};

const entityById: MockHandler = ({ params }) => {
  const entity = CONTACT_ENTITIES.find((e) => e.id === params['id']);
  if (entity === undefined) return notFound('entity', 'contacts.resource.not_found');
  const body: EntityResponse = { data: entity };
  return { body };
};

const mutation = { data: firstEntity, message: 'ok' };

const addressCreated: MockHandler = ({ params }) => {
  const body: AddressMutation = {
    data: {
      entityId: params['id'] ?? '',
      id: 'addr-standalone',
      lastEditedTime: '2026-09-05T08:00:00.000Z',
      value: '1 Wharf St',
    },
    message: 'ok',
  };
  return { status: 201, body };
};

const resolveIdentities: MockHandler = ({ body }) => {
  const ids =
    typeof body === 'object' && body !== null && 'ids' in body && Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string')
      : [];
  const response: ResolveResponse = {
    data: ids.map((id) => ({
      id,
      canonicalId: CONTACT_ENTITIES.some((entity) => entity.id === id) ? id : null,
    })),
    revision: 1,
  };
  return { body: response };
};

const identityGroup: MockHandler = ({ params }) => {
  const entity = CONTACT_ENTITIES.find((entity) => entity.id === params['id']);
  if (entity === undefined) return notFound('entity', 'contacts.resource.not_found');
  const body: IdentityGroup = {
    canonicalId: entity.id,
    memberIds: [entity.id],
    revision: 1,
    selections: [],
    members: [{ entity }],
  };
  return { body };
};

export const contactsHandlers: MockHandlers = {
  'GET /': ok('contacts'),
  'GET /openapi': ok({}),
  'GET /health': ok<HealthResponse>({
    ok: true,
    pillar: 'contacts',
    status: 'ready',
    ts: '2026-09-05T08:00:00.000Z',
    version: 'standalone',
  }),
  'GET /entities': listEntities,
  'POST /entities': created(mutation),
  'POST /entities/resolve': resolveIdentities,
  'GET /merges/groups/{id}': identityGroup,
  'POST /merges': ok<MergeResult>({
    canonicalId: firstEntity?.id ?? '',
    memberIds: [firstEntity?.id ?? ''],
    operationId: 'merge-standalone',
    revision: 2,
  }),
  'POST /merges/{id}/undo': ok<UndoResult>({
    operationId: 'undo-standalone',
    restoredIds: [firstEntity?.id ?? ''],
    revision: 3,
  }),
  'GET /merges/keep-separate': ok<SeparateList>({ data: [], revision: 1 }),
  'POST /merges/keep-separate': ok<SeparateResult>({
    keepSeparate: true,
    leftId: firstEntity?.id ?? '',
    rightId: 'other-standalone',
    revision: 2,
  }),
  'POST /entities/lookup': ok<EntitiesLookupResponses[200]>({
    entities: CONTACT_ENTITIES.map(({ id, name, aliases, type }) => ({ id, name, aliases, type })),
    fetchedAt: '2026-09-05T08:00:00.000Z',
  }),
  'GET /entities/{id}': entityById,
  'PATCH /entities/{id}': ok(mutation),
  'DELETE /entities/{id}': ok({ message: 'deleted' }),
  'GET /entities/{id}/contact-points': ok({ data: [contactPoint.data] }),
  'POST /entities/{id}/contact-points': created(contactPoint),
  'PUT /entities/{id}/contact-points/{point_id}/preferred': noContent,
  'GET /entities/{id}/person': ok(personProfile),
  'PUT /entities/{id}/person': ok(personProfile),
  'GET /entities/{id}/sources': ok({ data: [] }),
  'GET /sources/accounts': ok({ data: [sourceAccount.data] }),
  'POST /sources/accounts': ok(sourceAccount),
  'GET /entities/{id}/addresses': ok({ data: [] }),
  'POST /entities/{id}/addresses': addressCreated,
  'GET /entities/{id}/avatar': () => notFound('avatar', 'contacts.resource.not_found'),
  'PUT /entities/{id}/avatar': ok(mutation),
  'DELETE /entities/{id}/avatar': ok(mutation),
  'POST /entities/{id}/colour/reroll': ok(mutation),
  'GET /entities/{id}/poster': () => notFound('poster', 'contacts.resource.not_found'),
  'PUT /entities/{id}/poster': ok(mutation),
  'DELETE /entities/{id}/poster': ok(mutation),
  'POST /search': ok({ hits: [] }),
  'POST /imports/files': created(importBatch),
  'GET /imports/{id}': ok(importBatch),
  'GET /imports/{id}/review-proposals': ok(importReview),
  'POST /imports/{id}/commit': ok(importReceipt),
  'POST /imports/{id}/review-decisions': ok(importReviewReceipt),
  'GET /providers/accounts': ok(providerAccounts),
  'POST /providers/google/authorize': () => ({ status: 201 }),
  'GET /providers/google/callback': () => ({ status: 303 }),
  'POST /providers/icloud/accounts': created({
    accountId: providerOperation.accountId,
  }),
  'DELETE /providers/accounts/{id}': noContent,
  'POST /providers/accounts/{id}/sync': () => ({ status: 202, body: providerOperation }),
  'GET /providers/sync/{id}': ok(providerStatus),
  'POST /imports/{id}/apply-ready': ok(importReadyReceipt),
};

/**
 * What a caller gets for a registered pillar that is not serving: the
 * registry's `pillar-unavailable` result (`UriResolverResult` in
 * `@pops/types`), under a 503.
 */
export const CONTACTS_UNAVAILABLE = {
  kind: 'pillar-unavailable',
  moduleId: 'contacts',
  reason: 'contacts is not running (standalone: VITE_CONTACTS_API=absent)',
} as const;

const unavailable: MockHandler = () => ({ status: 503, body: CONTACTS_UNAVAILABLE });

export const contactsUnavailableHandlers: MockHandlers = Object.fromEntries(
  Object.keys(contactsHandlers).map((key) => [key, unavailable])
);
