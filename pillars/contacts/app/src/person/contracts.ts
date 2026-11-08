import type {
  Address,
  ContactPoint,
  ContactPointInput,
  Entity,
  SourceAccount,
  SourceRecord,
} from '../contacts-api/types.gen';

/** Contacts-owned person facts, retaining original observations and source provenance. */
export interface PersonSnapshot {
  entity: Entity;
  points: ContactPoint[];
  addresses: Address[];
  sources: SourceRecord[];
  accounts: SourceAccount[];
}

/** Explicit display-name and notes patch; structured/imported names remain independent. */
export interface PersonDraft {
  name: string;
  notes: string;
}

/** Generated HTTP boundary for existing person contracts; creates are never replayed automatically. */
export interface PersonGateway {
  load: (id: string) => Promise<PersonSnapshot>;
  save: (id: string, draft: PersonDraft) => Promise<Entity>;
  addPoint: (id: string, point: ContactPointInput) => Promise<ContactPoint>;
  addAddress: (id: string, value: string) => Promise<Address>;
}
