import {
  entitiesFactsGet,
  entitiesFactsChange,
  entitiesFactsUndo,
  entitiesSourcesList,
  sourcesAccountsList,
} from '../contacts-api/sdk.gen';
import { ContactError } from '../errors';
import { contactRequest } from '../request';
import { personChanges } from './draft-changes';

import type { PersonGateway } from './contracts';

/** Bind atomic versioned person edits and committed undo to the published Contacts contract. */
export const personGateway: PersonGateway = {
  async load(id) {
    const { data } = await contactRequest(() => entitiesFactsGet({ path: { id } }));
    if (data.entity.type !== 'person') throw new ContactError('notPerson', 'contacts.person.type');
    const [sources, accounts] = await Promise.all([
      contactRequest(() => entitiesSourcesList({ path: { id: data.entity.id } })),
      contactRequest(() => sourcesAccountsList()),
    ]);
    return { ...data, sources: sources.data, accounts: accounts.data };
  },
  async save(id, draft, before) {
    return contactRequest(() =>
      entitiesFactsChange({
        path: { id },
        body: {
          expectedVersion: before.version,
          idempotencyKey: crypto.randomUUID(),
          changes: personChanges(before, draft),
        },
      })
    );
  },
  async undo(id, operationId, version) {
    return contactRequest(() =>
      entitiesFactsUndo({
        path: { id, operation_id: operationId },
        body: { expectedVersion: version, idempotencyKey: crypto.randomUUID() },
      })
    );
  },
};
