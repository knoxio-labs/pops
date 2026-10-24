import { CONTACT_ENTITIES } from '../fixtures/entities';
import { created, noContent, notFound, ok, page } from './respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AddressMutation,
  ContactPointResponse,
  PersonProfileResponse,
  SourceAccountResponse,
  EntitiesLookupResponses,
  EntityResponse,
  HealthResponse,
  ProviderAccountStatus,
  ProviderOperation,
  ProviderRunStatus,
  ImportBatch,
  CommitReceipt,
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

const contactPoint: ContactPointResponse = {
  data: {
    id: '00000000-0000-4000-8000-000000000001',
    entityId: firstEntity?.id ?? '',
    active: true,
    preferred: true,
    kind: 'email',
    value: 'morgan@example.invalid',
    createdAt: '2026-09-05T08:00:00.000Z',
  },
};
const personProfile: PersonProfileResponse = {
  data: {
    entityId: firstEntity?.id ?? '',
    name: { givenName: 'Morgan', familyName: 'Vale' },
    updatedAt: '2026-09-05T08:00:00.000Z',
  },
};
const sourceAccount: SourceAccountResponse = {
  data: {
    id: '00000000-0000-4000-8000-000000000002',
    accountKey: 'standalone',
    provider: 'file',
    createdAt: '2026-09-05T08:00:00.000Z',
  },
};

const providerOperation: ProviderOperation = {
  accountId: '00000000-0000-4000-8000-000000000010',
  runId: '00000000-0000-4000-8000-000000000011',
};
const providerStatus: ProviderRunStatus = {
  ...providerOperation,
  runId: '00000000-0000-4000-8000-000000000011',
  status: 'completed',
  totalCollections: 1,
  completedCollections: 1,
  batchIds: [],
};
const providerAccounts: ProviderAccountStatus[] = [
  {
    accountId: providerOperation.accountId,
    provider: 'google',
    connected: true,
    reauthorizationRequired: false,
    includeOtherContacts: false,
  },
];
const importBatch: ImportBatch = {
  id: '00000000-0000-4000-8000-000000000012',
  accountId: providerOperation.accountId,
  collectionKey: 'contacts',
  revision: 1,
  rows: [],
  createdAt: '2026-10-24T00:00:00Z',
};
const importReceipt: CommitReceipt = { batchId: importBatch.id, revision: 2, rows: [] };

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
  'GET /providers/accounts': ok(providerAccounts),
  'POST /providers/google/authorize': () => ({ status: 201 }),
  'GET /providers/google/callback': ok<ProviderOperation>({
    accountId: providerOperation.accountId,
  }),
  'POST /providers/icloud/accounts': created<ProviderOperation>({
    accountId: providerOperation.accountId,
  }),
  'DELETE /providers/accounts/{id}': noContent,
  'POST /providers/accounts/{id}/sync': () => ({ status: 202, body: providerOperation }),
  'GET /providers/sync/{id}': ok(providerStatus),
  'POST /imports/files': created(importBatch),
  'GET /imports/{id}': ok(importBatch),
  'POST /imports/{id}/commit': ok(importReceipt),
  'GET /entities': listEntities,
  'POST /entities': created(mutation),
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
