import { CONTACT_ENTITIES } from '../fixtures/entities';
import { created, notFound, ok, page } from './respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  AddressMutation,
  EntitiesLookupResponses,
  EntityResponse,
  HealthResponse,
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
  if (entity === undefined) return notFound('entity');
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

export const contactsHandlers: MockHandlers = {
  'GET /': ok('contacts'),
  'GET /health': ok<HealthResponse>({
    ok: true,
    pillar: 'contacts',
    status: 'ready',
    ts: '2026-09-05T08:00:00.000Z',
    version: 'standalone',
  }),
  'GET /entities': listEntities,
  'POST /entities': created(mutation),
  'POST /entities/lookup': ok<EntitiesLookupResponses[200]>({
    entities: CONTACT_ENTITIES.map(({ id, name, aliases }) => ({ id, name, aliases })),
    fetchedAt: '2026-09-05T08:00:00.000Z',
  }),
  'GET /entities/{id}': entityById,
  'PATCH /entities/{id}': ok(mutation),
  'DELETE /entities/{id}': ok({ message: 'deleted' }),
  'GET /entities/{id}/addresses': ok({ data: [] }),
  'POST /entities/{id}/addresses': addressCreated,
  'GET /entities/{id}/avatar': () => notFound('avatar'),
  'PUT /entities/{id}/avatar': ok(mutation),
  'DELETE /entities/{id}/avatar': ok(mutation),
  'POST /entities/{id}/colour/reroll': ok(mutation),
  'GET /entities/{id}/poster': () => notFound('poster'),
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
