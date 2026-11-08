import {
  entitiesAddressesCreate,
  entitiesAddressesList,
  entitiesGet,
  entitiesPointsCreate,
  entitiesPointsList,
  entitiesSourcesList,
  entitiesUpdate,
  sourcesAccountsList,
} from '../contacts-api/sdk.gen';
import { ContactError } from '../errors';
import { contactRequest } from '../request';

import type { PersonGateway } from './contracts';

/** Bind person editing to Contacts' existing contracts, rejecting other entity types before loading facts. */
export const personGateway: PersonGateway = {
  async load(id) {
    const { data: entity } = await contactRequest(() => entitiesGet({ path: { id } }));
    if (entity.type !== 'person') throw new ContactError('notPerson', 'contacts.person.type');
    const [points, addresses, sources, accounts] = await Promise.all([
      contactRequest(() => entitiesPointsList({ path: { id: entity.id } })),
      contactRequest(() => entitiesAddressesList({ path: { id: entity.id } })),
      contactRequest(() => entitiesSourcesList({ path: { id: entity.id } })),
      contactRequest(() => sourcesAccountsList()),
    ]);
    return {
      entity,
      points: points.data,
      addresses: addresses.data,
      sources: sources.data,
      accounts: accounts.data,
    };
  },
  async save(id, draft) {
    const result = await contactRequest(() =>
      entitiesUpdate({ path: { id }, body: { name: draft.name, notes: draft.notes || null } })
    );
    return result.data;
  },
  async addPoint(id, body) {
    const result = await contactRequest(() => entitiesPointsCreate({ path: { id }, body }));
    return result.data;
  },
  async addAddress(id, value) {
    const result = await contactRequest(() =>
      entitiesAddressesCreate({ path: { id }, body: { value } })
    );
    return result.data;
  },
};
