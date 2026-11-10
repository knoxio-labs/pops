import {
  entitiesCatalogue,
  entitiesAddressesCreate,
  entitiesAddressesList,
  entitiesCreate,
  entitiesGet,
  entitiesList,
  entitiesPointsCreate,
  entitiesPointsList,
  entitiesReference,
  entitiesUpdate,
} from '../contacts-api/sdk.gen';
import { ContactError } from '../errors';
import { contactRequest } from '../request';

import type {
  Address,
  ContactPoint,
  ContactPointInput,
  Entity,
  EntityCatalogue,
} from '../contacts-api/types.gen';

/** Business or organisation details loaded through Contacts-owned fact routes. */
export interface ContactSnapshot {
  entity: Entity;
  points: ContactPoint[];
  addresses: Address[];
}

/** Canonical Contacts identity and URI understood by the POPS URI resolver. */
export interface ContactReference {
  canonicalId: string;
  uri: string;
}

/** Canonical entity data paired with its registered cross-pillar reference. */
export interface ContactSelection {
  entity: Entity;
  reference: ContactReference;
}

/** Typed adapter for the published entity, address and contact-point routes. */
export interface ContactGateway {
  search: (query: string, type?: string) => Promise<Entity[]>;
  create: (name: string, type: string) => Promise<Entity>;
  load: (id: string) => Promise<ContactSnapshot>;
  update: (id: string, name: string, notes: string) => Promise<Entity>;
  resolve: (id: string) => Promise<ContactSelection>;
  addPoint: (id: string, point: ContactPointInput) => Promise<ContactPoint>;
  addAddress: (id: string, value: string) => Promise<Address>;
}

/** Creation consumers load the owning type catalogue instead of copying type choices or defaults. */
export interface ContactCreationGateway extends ContactGateway {
  catalogue: () => Promise<EntityCatalogue>;
}

/** Bind entity-level contact workflows to published Contacts routes. */
export const contactGateway: ContactCreationGateway = {
  catalogue: () => contactRequest(() => entitiesCatalogue()),
  async search(query, type) {
    const result = await contactRequest(() => entitiesList({ query: { search: query, type } }));
    return result.data;
  },
  async create(name, type) {
    const result = await contactRequest(() => entitiesCreate({ body: { name, type } }));
    return result.data;
  },
  async load(id) {
    const { data: entity } = await contactRequest(() => entitiesGet({ path: { id } }));
    if (!['company', 'organisation'].includes(entity.type)) {
      throw new ContactError('entityType', 'contacts.entity.type');
    }
    const [points, addresses] = await Promise.all([
      contactRequest(() => entitiesPointsList({ path: { id } })),
      contactRequest(() => entitiesAddressesList({ path: { id } })),
    ]);
    return { entity, points: points.data, addresses: addresses.data };
  },
  async update(id, name, notes) {
    const result = await contactRequest(() =>
      entitiesUpdate({ path: { id }, body: { name, notes: notes || null } })
    );
    return result.data;
  },
  async resolve(id) {
    const reference = await contactRequest(() => entitiesReference({ path: { id } }));
    const { data: entity } = await contactRequest(() =>
      entitiesGet({ path: { id: reference.canonicalId } })
    );
    return { entity, reference };
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
